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
import { draftTokensCss, type DraftTokens } from './evidenceToTokens';
import { cropPng, screenshotDraft, screenshotPalette, SCREENSHOT_MAX_BYTES } from './screenshotPalette';
import type { ExtractSiteResult } from './siteExtraction';
import { CONFIDENCE_ORDER, parseBrandGuideText, parseHtmlSource, parseStyleSource, type SourceDraft } from './sourceExtraction';
import { readPowerPointTemplate, TEMPLATE_MAX_BYTES } from './templateExtraction';

export const MAX_SOURCES = 6;
export const TEXT_SOURCE_MAX = 2 * 1024 * 1024;
export type ExtractionSourceKind = 'screenshot' | 'css' | 'html' | 'brandGuide' | 'template';
export const SOURCE_KINDS: readonly ExtractionSourceKind[] = ['screenshot', 'css', 'html', 'brandGuide', 'template'];

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
}

/** Validates the `sources` input; returns an error message or the list. */
export function validateSources(raw: unknown): { ok: true; sources: ExtractionSource[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: '"sources" must be a list of { kind, path | text | data }.' };
  if (raw.length === 0) return { ok: false, error: '"sources" is empty.' };
  if (raw.length > MAX_SOURCES) return { ok: false, error: `"sources" takes at most ${MAX_SOURCES} entries (got ${raw.length}).` };
  const out: ExtractionSource[] = [];
  for (const [i, s] of raw.entries()) {
    if (!s || typeof s !== 'object') return { ok: false, error: `sources[${i}] must be an object.` };
    const o = s as Record<string, unknown>;
    if (!SOURCE_KINDS.includes(o.kind as ExtractionSourceKind)) return { ok: false, error: `sources[${i}].kind must be one of ${SOURCE_KINDS.join(', ')}.` };
    const kind = o.kind as ExtractionSourceKind;
    const given = ['path', 'text', 'data'].filter((k) => typeof o[k] === 'string' && (o[k] as string).length > 0);
    if (given.length !== 1) return { ok: false, error: `sources[${i}] needs exactly one of path, text or data.` };
    if (o.text !== undefined && kind !== 'css' && kind !== 'html') return { ok: false, error: `sources[${i}]: text is for css and html; give a ${kind} as path or data.` };
    if (o.data !== undefined && kind !== 'screenshot' && kind !== 'template') return { ok: false, error: `sources[${i}]: data is for a screenshot or template; give a ${kind} as path or text.` };
    if (kind === 'brandGuide' && o.path === undefined) return { ok: false, error: `sources[${i}]: a brandGuide is a workspace document (PDF, DOCX, PPTX, Markdown) given as path.` };
    if (typeof o.text === 'string' && o.text.length > TEXT_SOURCE_MAX) return { ok: false, error: `sources[${i}]: text is over 2 MB.` };
    if (typeof o.data === 'string') {
      const bytes = Math.floor((o.data.length * 3) / 4);
      const max = kind === 'screenshot' ? SCREENSHOT_MAX_BYTES : TEMPLATE_MAX_BYTES;
      if (bytes > max) return { ok: false, error: `sources[${i}]: data is over ${max / 1024 / 1024} MB.` };
    }
    out.push({ kind, path: o.path as string | undefined, text: o.text as string | undefined, data: o.data as string | undefined, name: typeof o.name === 'string' ? o.name : undefined });
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

export interface ExtractFromSourcesInput {
  workspaceRoot: string;
  outputDir: string;
  sources: ExtractionSource[];
  /** The URL extraction to merge with, when a url was given too. */
  urlResult?: Extract<ExtractSiteResult, { bundleDir: string }>;
  /** Turns a JPEG or WebP screenshot into PNG (a local browser); undefined where none is available. */
  toPng?: (data: Buffer) => Promise<Buffer | undefined>;
}

/** Reads every source, merges them with any URL measurement, and writes the evidence bundle. */
export async function extractFromSources(input: ExtractFromSourcesInput): Promise<Extract<ExtractSiteResult, { bundleDir: string }>> {
  const label = (s: ExtractionSource, i: number) => s.name ?? (s.path ? path.posix.basename(s.path) : s.kind === 'css' ? `pasted CSS ${i + 1}` : s.kind === 'html' ? `page source ${i + 1}` : `${s.kind} ${i + 1}`);
  const slugBase = (input.sources[0].name ?? (input.sources[0].path ? path.posix.basename(input.sources[0].path, path.posix.extname(input.sources[0].path)) : input.sources[0].kind)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sources';
  const bundleRel = input.urlResult?.bundleDir ?? path.posix.join(input.outputDir.split(path.sep).join('/'), '.extract', `sources-${slugBase}`);
  const bundleDir = path.join(input.workspaceRoot, bundleRel);
  if (!input.urlResult) await fs.rm(bundleDir, { recursive: true, force: true });
  await fs.mkdir(path.join(bundleDir, 'crops'), { recursive: true });
  const rel = (f: string) => path.posix.join(bundleRel, f);

  const drafts: SourceDraft[] = [];
  const notes: string[] = [];
  const marks: string[] = [...(input.urlResult?.marks ?? [])];
  const templateConflicts: DraftTokens['conflicts'] = [];
  let chartPalette: string[] | undefined;
  for (const [i, src] of input.sources.entries()) {
    const name = label(src, i);
    try {
      const file = src.path ? await fs.readFile(insideWorkspace(input.workspaceRoot, src.path)) : undefined;
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
        const t = await readPowerPointTemplate(src.path ?? src.name ?? 'template.pptx', data!);
        drafts.push(t.draft);
        chartPalette = chartPalette ?? (t.chartPalette.length ? t.chartPalette : undefined);
        for (const img of t.images) {
          await fs.writeFile(path.join(bundleDir, img.name), img.data);
          marks.push(rel(img.name));
        }
        for (const c of t.conflicts) templateConflicts.push({ token: c.token, value: c.value, page: `${name}, master "${c.master}"`, selector: 'theme', confidence: 'declared' });
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

  // evidence.json: the URL's, with the sources added, or a new one.
  const evidencePath = path.join(bundleDir, 'evidence.json');
  const existing = input.urlResult ? (JSON.parse(await fs.readFile(evidencePath, 'utf8').catch(() => '{}')) as Record<string, unknown>) : { version: 2, measuredAt: new Date().toISOString() };
  const summary = input.sources.map((s, i) => ({ kind: s.kind, name: label(s, i), path: s.path }));
  await fs.writeFile(evidencePath, JSON.stringify({ ...existing, status, sources: summary, sourceDrafts: drafts, chartPalette, marks, draft, notes: [...((existing.notes as string[]) ?? []), ...notes] }, null, 2) + '\n');
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
