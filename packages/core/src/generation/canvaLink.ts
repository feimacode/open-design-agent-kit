// Canva as a design-system source (openspec add-design-system-from-canva).
// Canva's connector can't read a Brand Kit's values, so a Canva design is
// taken in through its exports: the agent exports PPTX and PNG pages with the
// Canva connector and passes the download links back as `template` and
// `screenshot` sources. This module parses Canva links, and downloads an export
// link only when its host is one of Canva's export hosts: no other fetch.

/** Canva's export download host, as export-design returned it (checked 2026-11-09). The registry's `exportHosts` can widen this. */
export const DEFAULT_CANVA_EXPORT_HOSTS: readonly string[] = ['export-download.canva.com'];

export const CANVA_EXPORT_MAX_BYTES = 20 * 1024 * 1024;
export const CANVA_EXPORT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

export type CanvaLinkKind = 'design' | 'share' | 'shortlink' | 'template';

export interface CanvaLinkRef {
  kind: CanvaLinkKind;
  /** The link as given, trimmed. */
  link: string;
  /** A design id (`D…`, 11 characters) when the link names one. */
  designId?: string;
  /** The code of a `canva.link/<code>` or `canva.com/d/<code>` link. */
  code?: string;
  /** A public template's id, e.g. `EAFxyz123`. */
  templateId?: string;
}

/**
 * Parses a Canva link:
 * - `canva.com/design/<D…>/…` (edit, view, watch): a design;
 * - `canva.com/d/<code>`: a design's share link (read-design takes it as is);
 * - `canva.link/<code>`: a short link, resolved with resolve-shortlink;
 * - `canva.com/templates/<EA…>-<slug>/`: a public template, not a design yet.
 * Undefined for anything else, including other canva.com pages.
 */
export function parseCanvaUrl(raw: string): CanvaLinkRef | undefined {
  const link = raw.trim();
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'canva.link') {
    return parts[0] && /^[A-Za-z0-9_-]+$/.test(parts[0]) ? { kind: 'shortlink', link, code: parts[0] } : undefined;
  }
  if (host !== 'canva.com' && host !== 'www.canva.com') return undefined;
  if (parts[0] === 'design' && parts[1] && /^D[A-Za-z0-9_-]{10}$/.test(parts[1])) return { kind: 'design', link, designId: parts[1] };
  if (parts[0] === 'd' && parts[1] && /^[A-Za-z0-9_-]+$/.test(parts[1])) return { kind: 'share', link, code: parts[1] };
  if (parts[0] === 'templates' && parts[1]) {
    const id = /^(EA[A-Za-z0-9_-]+?)(?:-|$)/.exec(parts[1])?.[1];
    return id ? { kind: 'template', link, templateId: id } : undefined;
  }
  return undefined;
}

/** True when `raw` is an https URL on one of `hosts`, with no credentials or port. */
export function isAllowedExportUrl(raw: string, hosts: readonly string[] = DEFAULT_CANVA_EXPORT_HOSTS): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return hosts.map((h) => h.toLowerCase()).includes(url.hostname.toLowerCase());
}

export class ExportFetchError extends Error {}

export interface FetchExportOptions {
  hosts?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Downloads an export link: https only, the host checked before every hop
 * (redirects are followed by hand, at most 3), no cookies or credentials,
 * at most `maxBytes`, within `timeoutMs`.
 */
export async function fetchExportFile(raw: string, options: FetchExportOptions = {}): Promise<Buffer> {
  const hosts = options.hosts ?? DEFAULT_CANVA_EXPORT_HOSTS;
  const maxBytes = options.maxBytes ?? CANVA_EXPORT_MAX_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CANVA_EXPORT_TIMEOUT_MS);
  try {
    let current = raw;
    for (let hop = 0; ; hop++) {
      if (!isAllowedExportUrl(current, hosts)) {
        let host = current;
        try {
          host = new URL(current).hostname;
        } catch {
          // keep the raw text
        }
        throw new ExportFetchError(`${host} is not a Canva export host (${hosts.join(', ')}), so it was not downloaded`);
      }
      const response = await fetchImpl(current, { redirect: 'manual', credentials: 'omit', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop >= MAX_REDIRECTS) throw new ExportFetchError(`the export link redirected ${location ? 'too many times' : 'with no location'}`);
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) throw new ExportFetchError(`the export link answered HTTP ${response.status}; export links expire, so export the design again`);
      const declared = Number(response.headers.get('content-length') ?? '');
      if (Number.isFinite(declared) && declared > maxBytes) throw new ExportFetchError(`the export is over ${maxBytes / 1024 / 1024} MB`);
      const chunks: Buffer[] = [];
      let total = 0;
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new ExportFetchError(`the export is over ${maxBytes / 1024 / 1024} MB`);
          }
          chunks.push(Buffer.from(value));
        }
      }
      return Buffer.concat(chunks);
    }
  } catch (err) {
    if (err instanceof ExportFetchError) throw err;
    if (controller.signal.aborted) throw new ExportFetchError(`the export took longer than ${(options.timeoutMs ?? CANVA_EXPORT_TIMEOUT_MS) / 1000} s to download`);
    throw new ExportFetchError(`the export couldn't be downloaded: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** What evidence.json and brand.json keep about a draft built from Canva exports. */
export interface CanvaSourceRecord {
  source: 'canva';
  /** The design link the person gave (or the agent resolved). */
  design?: string;
  /** Exported page numbers, 1-based, across the screenshot sources. */
  pages?: number[];
  exportedAt: string;
}

export interface ComposeCanvaExportInstructionsInput {
  link: string;
  ref: CanvaLinkRef;
  /** Running on the hosted gateway: no workspace files of the user's. */
  hosted?: boolean;
}

/**
 * What the agent must do with a Canva link passed to
 * extract_open_design_design_system: check the connector, get to a design id,
 * export PPTX plus up to 4 PNG pages, and call back with the export links.
 * Nothing here contacts Canva.
 */
export function composeCanvaExportInstructions(input: ComposeCanvaExportInstructionsInput): string {
  const { ref, link } = input;
  const designStep =
    ref.kind === 'design'
      ? `The link names design \`${ref.designId}\`: use that id.`
      : ref.kind === 'share'
        ? `This is a share link: call \`read-design\` with \`design_id\` set to the whole link and \`filter.fields: ["design_metadata", "page_metadata"]\`; the design id is \`design_metadata.id\`.`
        : ref.kind === 'shortlink'
          ? `This is a short link: call \`resolve-shortlink\` with \`shortlink_id: "${ref.code}"\`, then take the design id (\`D…\`) from the design link it returns.`
          : `This is a public Canva template (\`${ref.templateId}\`), not a design of theirs, and Canva's tools export designs only. Ask the person once to open it in Canva with "Customize this template" (or to pick one of their own designs made from it) and send that design's link; then start again with that link.`;
  const manual = input.hosted
    ? 'If they would rather not connect it, ask them to download the design from Canva themselves (Share → Download: PPTX, and PNG for up to 4 pages) and attach the files; pass the PPTX as `{ "kind": "template", "data": "<base64>", "name": "<file name>" }` and each PNG as a `screenshot` with `data`.'
    : 'If they would rather not connect it, ask them to download the design from Canva themselves (Share → Download: PPTX, and PNG for up to 4 pages) into the workspace, and pass the files by `path` as a `template` and `screenshot` sources.';
  return `# Read a Canva design's design system

You passed a Canva link to \`extract_open_design_design_system\`. Open Design doesn't contact Canva, and Canva's connector can't read a Brand Kit's colours, fonts or logos. So the design is read from its exports: export it with the Canva connector, then call the tool again with the export links as sources. The server downloads them only from Canva's export host.

## Step 1 — check the Canva connector

Call \`list_open_design_integrations\` with \`integration: "canva"\`, and check your own tools, including deferred ones you can search for, for \`export-design\`, \`get-export-formats\` and \`read-design\`.

If they aren't there, offer to connect Canva once, using the setup steps the integrations list returned, and only after the person says yes. ${manual}

## Step 2 — get the design id

${designStep}

## Step 3 — choose the pages

Call \`get-export-formats\` with the design id and check that \`pptx\` and \`png\` are listed. Call \`read-design\` with \`filter.fields: ["page_metadata", "design_content"]\` for the page count and each page's text. Pick at most 4 pages for PNG: page 1, then the pages with the most text and colour (for a long deck, spread them out). A one-page design is just page 1.

## Step 4 — export

- \`export-design\` with \`format: { "type": "pptx" }\` (the whole design).
- \`export-design\` with \`format: { "type": "png", "pages": [<the pages>], "width": 1200 }\`. Keep the width at 1200 or less so each PNG stays under 4 MB.

Each call returns download links that expire within hours: call back right away.

## Step 5 — call back

Call \`extract_open_design_design_system\` again with the same \`url\` and one source per export file (at most 6):

\`\`\`json
{
  "url": ${JSON.stringify(link)},
  "sources": [
    { "kind": "template", "fileUrl": "<the pptx link>", "name": "<design title>.pptx", "canva": { "design": ${JSON.stringify(link)} } },
    { "kind": "screenshot", "fileUrl": "<the PNG link for page 1>", "name": "page 1", "canva": { "design": ${JSON.stringify(link)}, "pages": [1] } }
  ]
}
\`\`\`

Pass the links exactly as Canva returned them. The draft takes colour roles from the pixels and the PowerPoint theme, and fonts from the text on the slides; where they disagree it keeps the more trusted value and lists the other under conflicts.

## If they named a Brand Kit instead of a design

\`list-brand-kits\` gives only a kit's name and thumbnail; no Canva tool returns its colours, fonts or logos, so don't guess them from the thumbnail. Ask once for one design or brand template made with the kit (a brand template is the best sample) and follow the steps above with its link. They can also give the brand guide (a PDF, as a \`brandGuide\` source) or type the colour codes and font names, which you can pass as a \`css\` source.

Canva doesn't export font files or hover and focus states: the draft lists the fonts as needed and leaves states to the contract.`;
}
