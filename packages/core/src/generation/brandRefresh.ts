// The brand refresh diff (openspec connect-brand-design-systems):
// `compareTo` on the extraction tool measures the site again from the URLs a
// saved design system recorded and lists what changed. Never writes the
// design system: applying a change is the skill's job, one confirmed group at
// a time.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { DesignSystemDetail } from '../content/contentIndex';
import type { BrandRecord } from './brandKit';
import type { ExtractSiteResult } from './siteExtraction';

export interface ChangeEntry {
  name: string;
  from?: string;
  to?: string;
}

export interface BrandDiff {
  compareTo: string;
  tokens: { added: ChangeEntry[]; changed: ChangeEntry[]; removed: ChangeEntry[] };
  fonts: { added: string[]; removed: string[] };
  components: ChangeEntry[];
  marks: { added: string[]; removed: string[] };
  /** True when nothing differs. */
  same: boolean;
}

/** `--name: value` pairs of the first `:root` block (the light theme), comments dropped. */
export function rootTokens(css: string): Record<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = /:root\s*\{([^}]*)\}/.exec(clean)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) out[m[1]] = m[2].trim();
  return out;
}

const norm = (v: string): string => v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/(['"])/g, '"');

/** Flattens component specs to `button.primary.radius` → value. */
function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === 'crop' || k === 'selector') continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (obj !== undefined && obj !== null) out[prefix] = String(obj);
  return out;
}

const basename = (p: string): string => p.split('/').pop() ?? p;

/** What changed between a saved design system and a fresh extraction. Pure. */
export function diffBrand(input: {
  compareTo: string;
  previousTokensCss: string;
  previousBrand?: BrandRecord;
  draftTokens: Record<string, string>;
  unmeasured: string[];
  fonts: string[];
  components?: unknown;
  marks: string[];
}): BrandDiff {
  const before = rootTokens(input.previousTokensCss);
  const added: ChangeEntry[] = [];
  const changed: ChangeEntry[] = [];
  const removed: ChangeEntry[] = [];
  for (const [name, to] of Object.entries(input.draftTokens)) {
    const from = before[name];
    if (from === undefined) added.push({ name, to });
    else if (norm(from) !== norm(to) && !from.includes('var(')) changed.push({ name, from, to });
  }
  for (const name of input.unmeasured) if (before[name] !== undefined && !before[name].includes('var(')) removed.push({ name, from: before[name] });

  const prevFonts = new Set((input.previousBrand?.fonts ?? []).map((f) => f.family.toLowerCase()));
  const nowFonts = new Set(input.fonts.map((f) => f.toLowerCase()));
  const fonts =
    prevFonts.size > 0
      ? { added: [...nowFonts].filter((f) => !prevFonts.has(f)), removed: [...prevFonts].filter((f) => !nowFonts.has(f)) }
      : { added: [], removed: [] };

  const components: ChangeEntry[] = [];
  if (input.previousBrand?.components && input.components) {
    const a = flatten(input.previousBrand.components);
    const b = flatten(input.components);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] !== b[key]) components.push({ name: key, from: a[key], to: b[key] });
    }
  }

  const prevMarks = new Set((input.previousBrand?.marks ?? []).map((m) => basename(m.path)));
  const nowMarks = new Set(input.marks.map(basename));
  const marks = prevMarks.size > 0 ? { added: [...nowMarks].filter((m) => !prevMarks.has(m)), removed: [...prevMarks].filter((m) => !nowMarks.has(m)) } : { added: [], removed: [] };

  const same = !added.length && !changed.length && !removed.length && !fonts.added.length && !fonts.removed.length && !components.length && !marks.added.length && !marks.removed.length;
  return { compareTo: input.compareTo, tokens: { added, changed, removed }, fonts, components, marks, same };
}

/** The URLs to measure again for a saved design system, or an error to show. */
export function refreshUrls(detail: DesignSystemDetail | undefined, id: string): { ok: true; url: string; extraUrls: string[] } | { ok: false; error: string } {
  if (!detail) return { ok: false, error: `No design system "${id}". list_open_design_design_systems lists them.` };
  if (!id.startsWith('user:')) return { ok: false, error: `"compareTo" names one of the user's own design systems (user:…); ${id} is bundled.` };
  const urls = detail.brand?.sources?.urls ?? [];
  if (urls.length === 0) return { ok: false, error: `${id} has no source URLs in its brand.json, so there is nothing to measure again. Pass url to extract the site afresh.` };
  return { ok: true, url: urls[0], extraUrls: urls.slice(1, 4) };
}

/** The diff for a finished extraction against a saved design system. */
export async function brandRefreshDiff(workspaceRoot: string, detail: DesignSystemDetail, result: Extract<ExtractSiteResult, { bundleDir: string }>): Promise<BrandDiff | undefined> {
  if (!result.draft) return undefined;
  let fonts: string[] = [];
  let components: unknown;
  try {
    const ev = JSON.parse(await fs.readFile(path.join(workspaceRoot, result.bundleDir, 'evidence.json'), 'utf8')) as { pages?: Array<{ fonts?: Array<{ family: string }> }>; components?: unknown };
    fonts = [...new Set((ev.pages ?? []).flatMap((p) => (p.fonts ?? []).map((f) => f.family)))];
    components = ev.components;
  } catch {
    // No evidence file: compare tokens and marks only.
  }
  return diffBrand({
    compareTo: detail.id,
    previousTokensCss: detail.tokensCss ?? '',
    previousBrand: detail.brand,
    draftTokens: result.draft.tokens,
    unmeasured: result.draft.unmeasured,
    fonts,
    components,
    marks: result.marks,
  });
}

/** The extraction result with the refresh diff in place of the write-up instructions. */
export function formatRefreshResult(formatted: string, diff: BrandDiff | undefined): string {
  const out = JSON.parse(formatted) as Record<string, unknown>;
  if (!diff) return JSON.stringify({ ...out, refresh: undefined, next: `${String(out.next ?? '')} Nothing was measured, so there is no comparison with the saved design system.` }, null, 2);
  out.refresh = diff;
  out.next = diff.same
    ? `The site still matches ${diff.compareTo}: nothing to change.`
    : `This is a comparison only: ${diff.compareTo} is unchanged. Show the user the changes in groups (colours, type, spacing and shape, components, marks), and apply only the groups they confirm, to tokens.css and DESIGN.md together.`;
  return JSON.stringify(out, null, 2);
}
