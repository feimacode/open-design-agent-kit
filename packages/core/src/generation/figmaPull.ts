// One-off "pull a Figma frame and translate it to code" — the read
// direction of the pixel-canvas/code-semantic bridge. Grounded in a real,
// working reference: open-design's own apps/daemon/src/plugins/atoms/
// figma-extract.ts, which already calls these same two Figma REST endpoints
// (GET /v1/files/{key}/nodes and GET /v1/images/{key}) with a bearer token.
// This module uses a personal-access-token header (X-Figma-Token) instead,
// per this project's deliberate PAT-over-OAuth choice (no app registration/
// redirect-URI infra needed).
//
// Same split as every other content-producing piece of this project: a
// deterministic step (fetch + flatten the Figma node tree into a compact
// JSON summary) followed by a compose*Instructions() step that hands that
// summary to the model as ground truth — the model authors the actual code
// with its own file-editing tools. No deterministic Figma-JSON-to-HTML
// codegen here; 1:1 *visual* fidelity is a model-authoring goal, not
// something a fixed transform can guarantee across the huge variety of
// Figma structures.

export interface FigmaUrlRef {
  fileKey: string;
  nodeId?: string;
  /** Which Figma editor the link is for. */
  kind?: 'design' | 'board' | 'slides' | 'make';
}

// Matches figma.com/design/<key>/… (current), /file/<key>/… (legacy),
// /board/ (FigJam), /slides/ and /make/. For a branch link
// (/design/<key>/branch/<branchKey>/…) the branch key is the file key, as
// Figma's MCP server expects. A node id arrives as a `node-id` query param
// with `-` in place of the API's `:` separator ("123-456" -> "123:456"), how
// Figma's own "Copy link to selection" formats it.
const FIGMA_URL_RE = /^https?:\/\/(?:www\.)?figma\.com\/(file|design|board|slides|make)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?/i;

export function parseFigmaUrl(url: string): FigmaUrlRef | undefined {
  const match = FIGMA_URL_RE.exec(url.trim());
  if (!match) return undefined;
  const editor = match[1].toLowerCase();
  const kind = editor === 'file' ? 'design' : (editor as FigmaUrlRef['kind']);
  const fileKey = match[3] ?? match[2];

  let nodeId: string | undefined;
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get('node-id');
    if (raw) nodeId = raw.replace(/-/g, ':');
  } catch {
    // Malformed URL beyond the file-key prefix — still return the file key,
    // just without a node id.
  }

  return { fileKey, nodeId, kind };
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaPaint {
  type: string;
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlignHorizontal?: string;
  lineHeightPx?: number;
  letterSpacing?: number;
}

export interface FigmaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Modeled on figma-extract.ts's FigmaApiNode — a partial, pragmatic
// transcription of Figma's real file-node JSON shape, not the full schema.
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: FigmaBoundingBox;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  cornerRadius?: number;
  opacity?: number;
  characters?: string;
  style?: FigmaTextStyle;
  componentId?: string;
  visible?: boolean;
}

type FetchLike = typeof fetch;

export class FigmaApiError extends Error {}

export async function fetchFigmaNode(token: string, ref: FigmaUrlRef, fetchImpl: FetchLike = fetch): Promise<FigmaNode> {
  if (!ref.nodeId) {
    throw new FigmaApiError(
      'This Figma URL has no node id. Use Figma\'s "Copy link to selection" on the specific frame (not just the file link) and try again.',
    );
  }
  const url = `https://api.figma.com/v1/files/${ref.fileKey}/nodes?ids=${encodeURIComponent(ref.nodeId)}`;
  const response = await fetchImpl(url, { headers: { 'X-Figma-Token': token } });
  if (!response.ok) {
    throw new FigmaApiError(`Figma API responded with HTTP ${response.status} while fetching the frame.`);
  }
  const body = (await response.json()) as { nodes?: Record<string, { document?: FigmaNode }> };
  const document = body.nodes?.[ref.nodeId]?.document;
  if (!document) {
    throw new FigmaApiError(`Figma API response did not include a document for node "${ref.nodeId}" — it may not exist, or the token lacks access.`);
  }
  return document;
}

// Best-effort — never throws. A missing visual reference is not fatal to
// the pull; the structural summary alone is still usable.
export async function fetchFigmaFrameImage(
  token: string,
  fileKey: string,
  nodeId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | undefined> {
  try {
    const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`;
    const response = await fetchImpl(url, { headers: { 'X-Figma-Token': token } });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { err?: string | null; images?: Record<string, string | null> };
    if (body.err) return undefined;
    return body.images?.[nodeId] ?? undefined;
  } catch {
    return undefined;
  }
}

export interface FigmaFrameSummaryNode {
  id: string;
  name: string;
  type: string;
  box?: FigmaBoundingBox;
  fillColor?: string;
  strokeColor?: string;
  cornerRadius?: number;
  opacity?: number;
  characters?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: string;
  children?: FigmaFrameSummaryNode[];
}

export interface FigmaFrameSummary {
  root: FigmaFrameSummaryNode;
  nodeCount: number;
  truncated: boolean;
}

function toHexByte(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function toHexColor(color: FigmaColor): string {
  const hex = `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`;
  return color.a !== undefined && color.a < 1 ? `${hex}${toHexByte(color.a)}` : hex;
}

function firstSolidColor(paints?: FigmaPaint[]): string | undefined {
  const solid = paints?.find((p) => p.type === 'SOLID' && p.visible !== false && p.color);
  if (!solid?.color) return undefined;
  return toHexColor({ ...solid.color, a: solid.opacity ?? solid.color.a });
}

const DEFAULT_MAX_NODES = 500;

// Deterministic depth-first flatten — pure, no I/O. Caps traversal (default
// 500 nodes, same safety-cap posture as the clipper's own MAX_NODES) so a
// huge/deeply-nested frame can't blow up the instructions payload; sets
// `truncated` rather than silently dropping the overflow unremarked.
export function summarizeFigmaNode(node: FigmaNode, opts: { maxNodes?: number } = {}): FigmaFrameSummary {
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  let count = 0;
  let truncated = false;

  function walk(n: FigmaNode): FigmaFrameSummaryNode | undefined {
    if (count >= maxNodes) {
      truncated = true;
      return undefined;
    }
    count++;

    const summary: FigmaFrameSummaryNode = { id: n.id, name: n.name, type: n.type };
    if (n.absoluteBoundingBox) summary.box = { ...n.absoluteBoundingBox };

    const fillColor = firstSolidColor(n.fills);
    if (fillColor) summary.fillColor = fillColor;
    const strokeColor = firstSolidColor(n.strokes);
    if (strokeColor) summary.strokeColor = strokeColor;
    if (typeof n.cornerRadius === 'number') summary.cornerRadius = n.cornerRadius;
    if (typeof n.opacity === 'number' && n.opacity < 1) summary.opacity = n.opacity;

    if (n.type === 'TEXT') {
      summary.characters = n.characters;
      summary.fontFamily = n.style?.fontFamily;
      summary.fontSize = n.style?.fontSize;
      summary.fontWeight = n.style?.fontWeight;
      summary.textAlign = n.style?.textAlignHorizontal;
    }

    if (n.children && n.children.length > 0) {
      const children = n.children.map(walk).filter((c): c is FigmaFrameSummaryNode => !!c);
      if (children.length > 0) summary.children = children;
    }

    return summary;
  }

  const root = walk(node) ?? { id: node.id, name: node.name, type: node.type };
  return { root, nodeCount: count, truncated };
}

export interface ComposePullFigmaInstructionsInput {
  /** The structural summary from the token path; absent when no token is configured. */
  frameSummary?: FigmaFrameSummary;
  frameName?: string;
  imageUrl?: string;
  designSystemId?: string;
  suggestedEntryPath: string;
  /** The parsed link, for Figma's MCP tools. */
  figmaRef?: FigmaUrlRef;
  /** How to configure a token in this host, shown when neither Figma nor a token is available. */
  tokenSetupHint?: string;
}

/**
 * Instructions to rebuild a Figma frame as an Open Design artifact (openspec
 * connect-figma). Figma's MCP server comes first when the user has it
 * connected; the token-based structural summary is extra ground truth when a
 * token is configured, and the fallback otherwise.
 */
export function composePullFigmaInstructions(input: ComposePullFigmaInstructionsInput): string {
  const { frameSummary, frameName, imageUrl, designSystemId, suggestedEntryPath, figmaRef } = input;
  const label = frameName ? `the Figma frame "${frameName}"` : 'the Figma frame';
  const parts: string[] = [];

  parts.push(
    `# Translate a Figma frame into a code artifact\n\nYou are translating ${label} into a real, production-quality HTML/CSS artifact with 1:1 visual fidelity, not a loose interpretation.`,
  );

  const ids = figmaRef?.nodeId
    ? `\`fileKey: "${figmaRef.fileKey}"\` and \`nodeId: "${figmaRef.nodeId}"\``
    : 'the file key and node id from the link';
  parts.push(
    `\n\n## Step 1 — use Figma's own server when it's connected\n\nCall \`list_open_design_integrations\` with \`integration: "figma"\` and check your own tools, including deferred ones you can search for, for Figma's \`get_design_context\`.\n\nIf it's there:\n1. Load Figma's guidance first (Figma requires it): call \`get_figma_skill\` with \`uri: "skill://figma/figma-design-to-code/SKILL.md"\`.\n2. Call \`get_design_context\` with ${ids}, \`clientLanguages: "html,css"\` and \`clientFrameworks: "unknown"\`. It returns reference code, a screenshot and download URLs for the frame's assets.\n3. Call \`get_variable_defs\` with the same ids for the frame's colors, type and spacing variables.\n4. Download the assets the design uses right away (their URLs are short-lived) into the artifact's folder, and reference them by relative path.\n5. Treat the returned code as a **reference**, not the final file: rebuild it as one self-contained HTML entry file (CSS in a \`<style>\` block) following the rules below, using the variables' real values.\n6. When the artifact is written, call \`get_screenshot\` with the same ids and compare it with your result; fix any visible differences.${frameSummary ? '\n\nThe structural summary below (from the access token) is extra ground truth either way.' : ''}`,
  );

  if (frameSummary) {
    parts.push(
      `\n\n## Ground truth\n\nThe JSON below is a deterministic, exact structural summary of the frame — positions, sizes, fill/stroke colors (hex), corner radii, and text runs (with their exact characters, font, size). Treat it as authoritative: match exact colors, relative positions/sizes, and text content precisely. Do not invent content, copy, or elements that aren't present in this data.${
        frameSummary.truncated
          ? ` NOTE: this summary was truncated at ${frameSummary.nodeCount} nodes — the frame has more content than shown; ask the user if the missing portion matters before proceeding.`
          : ''
      }\n\n\`\`\`json\n${JSON.stringify(frameSummary.root, null, 2)}\n\`\`\``,
    );
    parts.push(
      imageUrl
        ? `\n\n## Visual reference\n\nA rendered PNG export of this exact frame is available at: ${imageUrl}\nIf your environment can view images from a URL, fetch and look at it to cross-check visual fidelity (layering, gradients, and other details the structural JSON above simplifies away). If it cannot, rely on the structural JSON alone.`
        : `\n\n## Visual reference\n\nNo rendered image export was available — rely on the structural JSON alone.`,
    );
  } else {
    parts.push(
      `\n\n## Step 2 — if Figma isn't connected\n\nNo Figma access token is configured either, so there's nothing to read the frame with yet. Offer to connect Figma once, using the setup steps \`list_open_design_integrations\` returned, and only after the user says yes. If they'd rather not, they can use a personal access token instead: ${input.tokenSetupHint ?? 'configure a Figma personal access token for Open Design (Figma → Settings → Personal access tokens)'}, then ask again. Don't guess the design from the link alone.`,
    );
  }

  parts.push(
    designSystemId
      ? `\n\n## Design system\n\nThis frame is associated with design system "${designSystemId}" — reuse its component conventions where the frame's structure clearly matches them, but the frame's own exact colors/type still take precedence over the design system's generic tokens.`
      : `\n\n## Design system\n\nNo design system was specified — implement the frame's own exact styling directly (inline styles or plain CSS), without inventing a design-system abstraction that wasn't requested.`,
  );

  parts.push(
    `\n\n## Output\n\nWrite the artifact's entry file at \`${suggestedEntryPath}\` (adjust the filename if there's a clearly better one, e.g. if it collides with something already there) using your own file-editing tools, then call register_open_design_artifact.`,
  );

  return parts.join('');
}

export interface PreparePullFigmaFrameOptions {
  figmaUrl: string;
  designSystemId?: string;
  /** The host's configured personal access token, if any. */
  token?: string;
  /** Workspace-relative output directory, e.g. ".open-design". */
  outputDir: string;
  /** How to configure a token in this host. */
  tokenSetupHint: string;
  fetchImpl?: FetchLike;
}

function frameSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'frame'
  );
}

/**
 * The pull_open_design_figma_frame tool, shared by both hosts: parses the
 * link, fetches the token summary when a token is configured, and composes
 * connector-first instructions. Returns the tool's text result.
 */
export async function preparePullFigmaFrame(options: PreparePullFigmaFrameOptions): Promise<string> {
  const ref = parseFigmaUrl(options.figmaUrl);
  if (!ref) return `"${options.figmaUrl}" does not look like a Figma file/design URL.`;
  if (!ref.nodeId && ref.kind !== 'make') {
    return 'That link points at a whole Figma file, not a frame. Ask the user to select the frame in Figma and use "Copy link to selection" (the link must contain node-id), then call this tool again with it.';
  }
  if (ref.kind === 'make' && !ref.nodeId) ref.nodeId = '0:1';

  let frameSummary: FigmaFrameSummary | undefined;
  let frameName: string | undefined;
  let imageUrl: string | undefined;
  const notes: string[] = [];
  if (options.token) {
    try {
      const node = await fetchFigmaNode(options.token, ref, options.fetchImpl);
      frameSummary = summarizeFigmaNode(node);
      frameName = node.name;
      imageUrl = await fetchFigmaFrameImage(options.token, ref.fileKey, ref.nodeId!, options.fetchImpl);
    } catch (err) {
      notes.push(`The access token couldn't read the frame (${err instanceof Error ? err.message : String(err)}), so only Figma's own server can be used.`);
    }
  }
  const suggestedEntryPath = `${options.outputDir.replace(/\/+$/, '')}/figma/${frameSlug(frameName ?? `frame-${ref.nodeId}`)}.html`;
  let instructions = composePullFigmaInstructions({
    frameSummary,
    frameName,
    imageUrl,
    designSystemId: options.designSystemId,
    suggestedEntryPath,
    figmaRef: ref,
    tokenSetupHint: options.tokenSetupHint,
  });
  if (notes.length) instructions = `${notes.join('\n')}\n\n${instructions}`;
  return JSON.stringify({ instructions, suggestedEntryPath }, null, 2);
}
