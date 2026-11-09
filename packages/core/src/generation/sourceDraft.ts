// `sources` on extract_open_design_design_system (openspec
// add-brand-from-screenshot-or-css): screenshots, CSS, page source, brand
// guides and PowerPoint templates, with or without a URL, into the same draft
// and evidence bundle as a URL extraction. Values are preferred measured >
// declared > stated > sampled; every other value is kept under `conflicts`
// with its source. Reads only what it is given: no network.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { extractDocument, sourceKindFor } from '../vendored/documentExtract';
import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { DEFAULT_CANVA_EXPORT_HOSTS, fetchExportFile, isAllowedExportUrl, CANVA_EXPORT_MAX_BYTES, type CanvaSourceRecord } from './canvaLink';
import { draftTokensCss, type DraftTokens } from './evidenceToTokens';
import { fetchFigmaStyles, figmaFileKey, figmaSourceLabel, figmaSourceRecord, parseFigmaSource, parseFigmaStyles, validateFigmaSource, FIGMA_LOGO_MAX_BYTES, type FigmaLogoInput, type FigmaLogoRecord, type FigmaSourceInput, type FigmaSourceRecord } from './figmaSource';
import { cropPng, screenshotDraft, screenshotPalette, SCREENSHOT_MAX_BYTES } from './screenshotPalette';
import type { ExtractSiteResult } from './siteExtraction';
import { CONFIDENCE_ORDER, parseBrandGuideText, parseHtmlSource, parseStyleSource, type SourceDraft } from './sourceExtraction';
import { readPowerPointTemplate, TEMPLATE_MAX_BYTES } from './templateExtraction';

export const MAX_SOURCES = 6;
export const TEXT_SOURCE_MAX = 2 * 1024 * 1024;
export type ExtractionSourceKind = 'screenshot' | 'css' | 'html' | 'brandGuide' | 'template' | 'figma';
export const SOURCE_KINDS: readonly ExtractionSourceKind[] = ['screenshot', 'css', 'html', 'brandGuide', 'template', 'figma'];

export interface ExtractionSource {
  kind: ExtractionSourceKind;
  /** A workspace-relative file. */
  path?: string;
  /** Text (css, html). */
  text?: string;
  /** Base64 file data (screenshot, template). */
  data?: string;
  /** A label for pasted text or data, e.g. "pricing page". */
  name?: string;
  /** A Figma file the host agent read through Figma's own server (openspec add-design-system-from-figma). */
  figma?: FigmaSourceInput;
  /** An export download link (template, screenshot), fetched only from an allowed export host (openspec add-design-system-from-canva). */
  fileUrl?: string;
  /** Which Canva design (and pages) this export came from; turns on the template reader's Canva mode. */
  canva?: { design?: string; pages?: number[] };
}

export interface ValidateSourcesOptions {
  /** Hosts a `fileUrl` may come from; Canva's export host by default. */
  exportHosts?: readonly string[];
}

/** Validates the `sources` input; returns an error message or the list. */
export function validateSources(raw: unknown, options: ValidateSourcesOptions = {}): { ok: true; sources: ExtractionSource[] } | { ok: false; error: string } {
  const exportHosts = options.exportHosts ?? DEFAULT_CANVA_EXPORT_HOSTS;
  if (!Array.isArray(raw)) return { ok: false, error: '"sources" must be a list of { kind, path | text | data }.' };
  if (raw.length === 0) return { ok: false, error: '"sources" is empty.' };
  if (raw.length > MAX_SOURCES) return { ok: false, error: `"sources" takes at most ${MAX_SOURCES} entries (got ${raw.length}).` };
  const out: ExtractionSource[] = [];
  for (const [i, s] of raw.entries()) {
    if (!s || typeof s !== 'object') return { ok: false, error: `sources[${i}] must be an object.` };
    const o = s as Record<string, unknown>;
    if (!SOURCE_KINDS.includes(o.kind as ExtractionSourceKind)) return { ok: false, error: `sources[${i}].kind must be one of ${SOURCE_KINDS.join(', ')}.` };
    const kind = o.kind as ExtractionSourceKind;
    if (kind === 'figma') {
      const checked = validateFigmaSource(o);
      if (!checked.ok) return { ok: false, error: `sources[${i}]: ${checked.error}` };
      out.push({ kind, name: typeof o.name === 'string' ? o.name : checked.source.name, figma: checked.source });
      continue;
    }
    const given = ['path', 'text', 'data', 'fileUrl'].filter((k) => typeof o[k] === 'string' && (o[k] as string).length > 0);
    if (given.length !== 1) return { ok: false, error: `sources[${i}] needs exactly one of path, text, data or fileUrl.` };
    if (o.fileUrl !== undefined) {
      if (kind !== 'screenshot' && kind !== 'template') return { ok: false, error: `sources[${i}]: fileUrl is for a screenshot or template exported from Canva.` };
      if (!isAllowedExportUrl(String(o.fileUrl), exportHosts)) {
        let host = String(o.fileUrl);
        try {
          host = new URL(host).hostname || host;
        } catch {
          // keep the raw text
        }
        return { ok: false, error: `sources[${i}]: fileUrl must be an https export link from ${exportHosts.join(', ')}; ${host} is not one, and nothing was fetched.` };
      }
    }
    let canva: ExtractionSource['canva'];
    if (o.canva !== undefined) {
      if (kind !== 'screenshot' && kind !== 'template') return { ok: false, error: `sources[${i}]: canva is for a screenshot or template exported from Canva.` };
      if (!o.canva || typeof o.canva !== 'object' || Array.isArray(o.canva)) return { ok: false, error: `sources[${i}].canva must be { design, pages }.` };
      const c = o.canva as Record<string, unknown>;
      if (c.design !== undefined && typeof c.design !== 'string') return { ok: false, error: `sources[${i}].canva.design must be the design link.` };
      if (c.pages !== undefined && (!Array.isArray(c.pages) || !c.pages.every((n) => Number.isInteger(n) && (n as number) >= 1))) return { ok: false, error: `sources[${i}].canva.pages must be page numbers from 1.` };
      canva = { design: c.design as string | undefined, pages: c.pages as number[] | undefined };
    }
    if (o.text !== undefined && kind !== 'css' && kind !== 'html') return { ok: false, error: `sources[${i}]: text is for css and html; give a ${kind} as path or data.` };
    if (o.data !== undefined && kind !== 'screenshot' && kind !== 'template') return { ok: false, error: `sources[${i}]: data is for a screenshot or template; give a ${kind} as path or text.` };
    if (kind === 'brandGuide' && o.path === undefined) return { ok: false, error: `sources[${i}]: a brandGuide is a workspace document (PDF, DOCX, PPTX, Markdown) given as path.` };
    if (typeof o.text === 'string' && o.text.length > TEXT_SOURCE_MAX) return { ok: false, error: `sources[${i}]: text is over 2 MB.` };
    if (typeof o.data === 'string') {
      const bytes = Math.floor((o.data.length * 3) / 4);
      const max = kind === 'screenshot' ? SCREENSHOT_MAX_BYTES : TEMPLATE_MAX_BYTES;
      if (bytes > max) return { ok: false, error: `sources[${i}]: data is over ${max / 1024 / 1024} MB.` };
    }
    out.push({
      kind,
      path: o.path as string | undefined,
      text: o.text as string | undefined,
      data: o.data as string | undefined,
      fileUrl: o.fileUrl as string | undefined,
      canva,
      name: typeof o.name === 'string' ? o.name : undefined,
    });
  }
  return { ok: true, sources: out };
}

function insideWorkspace(workspaceRoot: string, rel: string): string {
  const abs = path.resolve(workspaceRoot, rel);
  const root = path.resolve(workspaceRoot);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`${rel} is outside the workspace.`);
  return abs;
}

const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;

/** A logo file's format from its first bytes. */
function sniffLogo(bytes: Buffer): string {
  const head = bytes.subarray(0, 64).toString('utf8').trimStart();
  if (head.startsWith('<')) return 'svg';
  if (isPng(bytes)) return 'png';
  if (bytes.subarray(0, 3).toString('latin1') === '\xff\xd8\xff') return 'jpg';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF') return 'webp';
  return 'bin';
}

/**
 * An exported logo into the bundle's logos/: the record with its bundle path,
 * or a record with no path when only its role was listed (the hosted gateway).
 */
async function saveFigmaLogo(logo: FigmaLogoInput, bundleDir: string, rel: (f: string) => string, workspaceRoot: string): Promise<FigmaLogoRecord> {
  const record: FigmaLogoRecord = { role: logo.role, name: logo.name, width: logo.width, height: logo.height, seenOn: logo.seenOn };
  const bytes = logo.data
    ? Buffer.from(logo.data.replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, ''), 'base64')
    : logo.path
      ? await fs.readFile(insideWorkspace(workspaceRoot, logo.path))
      : undefined;
  if (!bytes) return record;
  if (bytes.length > FIGMA_LOGO_MAX_BYTES) throw new Error(`it is over ${FIGMA_LOGO_MAX_BYTES / 1024 / 1024} MB`);
  const ext = (logo.path ? path.posix.extname(logo.path).slice(1) : '').toLowerCase() || sniffLogo(bytes);
  const name = path.posix.basename(logo.name ?? `${logo.role}.${ext}`);
  await fs.mkdir(path.join(bundleDir, 'logos'), { recursive: true });
  await fs.writeFile(path.join(bundleDir, 'logos', name), bytes);
  return { ...record, name, path: rel(`logos/${name}`) };
}

export interface ExtractFromSourcesInput {
  workspaceRoot: string;
  outputDir: string;
  sources: ExtractionSource[];
  /** The URL extraction to merge with, when a url was given too. */
  urlResult?: Extract<ExtractSiteResult, { bundleDir: string }>;
  /** Turns a JPEG or WebP screenshot into PNG (a local browser); undefined where none is available. */
  toPng?: (data: Buffer) => Promise<Buffer | undefined>;
  /** A Figma access token for the published-styles fallback (the local server only; never the hosted one). */
  figmaToken?: string;
  /** Fetches Figma's REST replies and Canva export links (tests inject one). */
  fetchImpl?: typeof fetch;
  /** Hosts a `fileUrl` may be downloaded from; Canva's export host by default. */
  exportHosts?: readonly string[];
}

/** Reads every source, merges them with any URL measurement, and writes the evidence bundle. */
export async function extractFromSources(input: ExtractFromSourcesInput): Promise<Extract<ExtractSiteResult, { bundleDir: string }>> {
  const label = (s: ExtractionSource, i: number) =>
    s.name ??
    (s.kind === 'figma' && s.figma
      ? figmaSourceLabel(s.figma)
      : s.path
        ? path.posix.basename(s.path)
        : s.kind === 'css'
          ? `pasted CSS ${i + 1}`
          : s.kind === 'html'
            ? `page source ${i + 1}`
            : `${s.kind} ${i + 1}`);
  const first = input.sources[0];
  const slugBase = (
    first.name ??
    (first.kind === 'figma' && first.figma ? figmaSourceLabel(first.figma) : first.path ? path.posix.basename(first.path, path.posix.extname(first.path)) : first.kind)
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'sources';
  const bundleRel = input.urlResult?.bundleDir ?? path.posix.join(input.outputDir.split(path.sep).join('/'), '.extract', `sources-${slugBase}`);
  const bundleDir = path.join(input.workspaceRoot, bundleRel);
  if (!input.urlResult) await fs.rm(bundleDir, { recursive: true, force: true });
  await fs.mkdir(path.join(bundleDir, 'crops'), { recursive: true });
  const rel = (f: string) => path.posix.join(bundleRel, f);

  const drafts: SourceDraft[] = [];
  const notes: string[] = [];
  const marks: string[] = [...(input.urlResult?.marks ?? [])];
  const figmaLogos: FigmaLogoRecord[] = [];
  const templateConflicts: DraftTokens['conflicts'] = [];
  let chartPalette: string[] | undefined;
  for (const [i, src] of input.sources.entries()) {
    const name = label(src, i);
    try {
      const file = src.path
        ? await fs.readFile(insideWorkspace(input.workspaceRoot, src.path))
        : src.fileUrl
          ? await fetchExportFile(src.fileUrl, { hosts: input.exportHosts ?? DEFAULT_CANVA_EXPORT_HOSTS, maxBytes: CANVA_EXPORT_MAX_BYTES, fetchImpl: input.fetchImpl })
          : undefined;
      const data = src.data ? Buffer.from(src.data, 'base64') : file;
      const text = src.text ?? (src.kind === 'css' || src.kind === 'html' ? file?.toString('utf8') : undefined);
      if (src.kind === 'css') {
        if ((text ?? '').length > TEXT_SOURCE_MAX) throw new Error('it is over 2 MB');
        drafts.push(parseStyleSource(text ?? '', name));
      } else if (src.kind === 'html') {
        if ((text ?? '').length > TEXT_SOURCE_MAX) throw new Error('it is over 2 MB');
        const html = parseHtmlSource(text ?? '', name);
        drafts.push(html);
        if (html.stylesheets.length > 0) notes.push(`${name} links ${html.stylesheets.length} stylesheet(s) that weren't read: pass their text as css sources for more.`);
      } else if (src.kind === 'brandGuide') {
        const kind = sourceKindFor(src.path!);
        if ('error' in kind) throw new Error(kind.error);
        const doc = await extractDocument(path.basename(src.path!), file!);
        if (doc.pdfNote) notes.push(`${name}: ${doc.pdfNote}`);
        drafts.push(parseBrandGuideText(doc.markdown, name));
      } else if (src.kind === 'template') {
        const fromCanva = Boolean(src.canva || src.fileUrl);
        const t = await readPowerPointTemplate(src.path ?? (src.name && /\.(pptx|potx)$/i.test(src.name) ? src.name : `${src.name ?? 'template'}.pptx`), data!, { canva: fromCanva });
        drafts.push(t.draft);
        chartPalette = chartPalette ?? (t.chartPalette.length ? t.chartPalette : undefined);
        for (const img of t.images) {
          await fs.writeFile(path.join(bundleDir, img.name), img.data);
          marks.push(rel(img.name));
        }
        for (const c of t.conflicts) templateConflicts.push({ token: c.token, value: c.value, page: `${name}, master "${c.master}"`, selector: 'theme', confidence: 'declared' });
      } else if (src.kind === 'figma') {
        const figma = src.figma!;
        if ((figma.frames ?? []).length > 0) drafts.push(parseFigmaSource(figma));
        if (figma.styles) {
          if (!input.figmaToken) throw new Error('reading published styles needs a Figma access token configured on this machine; read the frames with the Figma connector instead');
          const fileKey = figma.fileKey ?? figmaFileKey(figma.file);
          if (!fileKey) throw new Error('reading published styles needs the file key: pass the Figma file link or its key in "file"');
          drafts.push(parseFigmaStyles(await fetchFigmaStyles(fileKey, input.figmaToken, input.fetchImpl), figmaSourceLabel(figma)));
        }
        for (const logo of figma.logos ?? []) {
          try {
            figmaLogos.push(await saveFigmaLogo(logo, bundleDir, rel, input.workspaceRoot));
          } catch (err) {
            notes.push(`The ${logo.role} logo couldn't be saved: ${err instanceof Error ? err.message : String(err)}.`);
          }
        }
      } else if (src.kind === 'screenshot') {
        let png: Buffer = data!;
        if (png.length > SCREENSHOT_MAX_BYTES) throw new Error('it is over 4 MB');
        if (!isPng(png)) {
          const converted = input.toPng ? await input.toPng(png) : undefined;
          if (!converted) throw new Error('only PNG screenshots can be read here; save it as PNG');
          png = converted;
        }
        const shotName = `source-${i + 1}.png`;
        await fs.writeFile(path.join(bundleDir, shotName), png);
        const palette = screenshotPalette(png);
        const crops: Record<string, string> = {};
        for (const [token, c] of Object.entries(palette.roles)) {
          if (!c?.box || token === '--bg') continue;
          const crop = `crops/source-${i + 1}-${token.slice(2)}.png`;
          await fs.writeFile(path.join(bundleDir, crop), cropPng(png, c.box));
          crops[token] = crop;
        }
        drafts.push(screenshotDraft(palette, name, (t) => crops[t]));
      }
    } catch (err) {
      notes.push(`${name} couldn't be read: ${err instanceof Error ? err.message : String(err)}.`);
    }
  }

  // Merge, most trusted first; a URL measurement is "measured".
  const base = input.urlResult?.draft;
  const tokens: Record<string, string> = { ...(base?.tokens ?? {}) };
  const sources: DraftTokens['sources'] = {};
  for (const [k, v] of Object.entries(base?.sources ?? {})) sources[k] = { ...v, confidence: 'measured' };
  const conflicts: DraftTokens['conflicts'] = [...(base?.conflicts ?? []).map((c) => ({ ...c, confidence: 'measured' as const })), ...templateConflicts];
  const ordered = [...drafts].sort((a, b) => CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence));
  for (const d of ordered) {
    for (const [token, v] of Object.entries(d.tokens)) {
      if (!(token in tokens)) {
        tokens[token] = v.value;
        sources[token] = { selector: v.where, page: d.source, crop: v.crop, confidence: d.confidence, source: d.source, ...(v.note ? { note: v.note } : {}) };
      } else if (tokens[token].toLowerCase() !== v.value.toLowerCase()) {
        conflicts.push({ token, value: v.value, page: d.source, selector: v.where, crop: v.crop, confidence: d.confidence });
      }
    }
    notes.push(...d.notes);
  }
  const contract = new Set(TOKEN_SCHEMA.map((t) => t.name));
  const draft: DraftTokens = {
    tokens,
    dark: base?.dark,
    unmeasured: [...contract].filter((n) => !(n in tokens)),
    sources,
    conflicts,
    notes: [...(base?.notes ?? [])],
  };
  if (!tokens['--font-body'] && !tokens['--font-display']) notes.push('No font was found in the sources: ask the user which fonts the brand uses.');
  if (conflicts.some((c) => c.confidence !== 'measured')) notes.push(`Sources disagree on ${[...new Set(conflicts.map((c) => c.token))].join(', ')}: the draft keeps the most trusted value (measured, then declared, stated, sampled); see draft.conflicts.`);
  const sourceCandidates = drafts.flatMap((d) => d.candidates.map((c) => ({ ...c, source: d.source }))).filter((c) => !Object.values(tokens).includes(c.value)).slice(0, 32);
  const status = Object.keys(tokens).length > 0 ? 'ok' : input.urlResult?.status === 'blocked' ? 'blocked' : 'partial';
  const figma = input.sources.map((s) => s.figma).filter((f): f is FigmaSourceInput => Boolean(f));
  if (figma.length > 0) notes.push(`Draft from Figma (${figma.map((f) => f.file).join(', ')}): the file, frame links and date are recorded as source "figma" in evidence.json.`);
  const figmaFonts = figma.flatMap((f) => f.fonts ?? []);
  const savedLogos = figmaLogos.filter((l) => l.path);
  const neededLogos = figmaLogos.filter((l) => !l.path);
  if (savedLogos.length) notes.push(`Logo files (${savedLogos.map((l) => l.name).join(', ')}) were saved into the bundle; saving the design system copies them into its assets/.`);
  if (neededLogos.length) notes.push(`Logos listed as needed, to attach once the design system is saved: ${neededLogos.map((l) => l.name ?? l.role).join(', ')}.`);
  if (figmaFonts.length) notes.push(`Font files are listed as needed: ${figmaFonts.map((f) => f.family).join(', ')}.`);
  const canvaSources = input.sources.filter((s) => s.canva || s.fileUrl);
  let canvaRecord: CanvaSourceRecord | undefined;
  if (canvaSources.length) {
    const pages = [...new Set(canvaSources.filter((s) => s.kind === 'screenshot').flatMap((s) => s.canva?.pages ?? []))].sort((a, b) => a - b);
    canvaRecord = { source: 'canva', design: canvaSources.find((s) => s.canva?.design)?.canva?.design, pages: pages.length ? pages : undefined, exportedAt: new Date().toISOString() };
    notes.push(`Draft from Canva exports${canvaRecord.design ? ` of ${canvaRecord.design}` : ''}${pages.length ? ` (pages ${pages.join(', ')})` : ''}: recorded as source "canva" in evidence.json. Canva doesn't export font files or hover and focus states.`);
  }
  let figmaRecord: FigmaSourceRecord | undefined;
  if (figma.length) {
    figmaRecord = figmaSourceRecord(figma[0]);
    if (figmaLogos.length) figmaRecord.logos = figmaLogos;
    if (figmaFonts.length) figmaRecord.fonts = figmaFonts;
  }

  // evidence.json: the URL's, with the sources added, or a new one.
  const evidencePath = path.join(bundleDir, 'evidence.json');
  const existing = input.urlResult ? (JSON.parse(await fs.readFile(evidencePath, 'utf8').catch(() => '{}')) as Record<string, unknown>) : { version: 2, measuredAt: new Date().toISOString() };
  // Export links are signed and short-lived: keep only their host in the record.
  const summary = input.sources.map((s, i) => ({ kind: s.kind, name: label(s, i), path: s.path, ...(s.fileUrl ? { from: new URL(s.fileUrl).hostname } : {}), ...(s.canva ? { canva: s.canva } : {}) }));
  await fs.writeFile(evidencePath, JSON.stringify({ ...existing, status, sources: summary, figma: figmaRecord, canva: canvaRecord, sourceDrafts: drafts, chartPalette, marks, draft, notes: [...((existing.notes as string[]) ?? []), ...notes] }, null, 2) + '\n');
  return {
    status,
    slug: input.urlResult?.slug ?? `sources-${slugBase}`,
    bundleDir: bundleRel,
    draft,
    draftCss: draftTokensCss(draft, `Draft from ${summary.map((s) => s.name).join(', ')}${input.urlResult ? ' and the measured site' : ''} by extract_open_design_design_system`),
    screenshots: [...(input.urlResult?.screenshots ?? []), ...input.sources.flatMap((s, i) => (s.kind === 'screenshot' ? [rel(`source-${i + 1}.png`)] : []))],
    blocked: input.urlResult?.blocked ?? [],
    candidates: input.urlResult?.candidates,
    marks,
    content: input.urlResult?.content,
    brandKit: input.urlResult?.brandKit,
    sourceCandidates,
    chartPalette,
    notes: [...(input.urlResult?.notes ?? []), ...notes],
  };
}
