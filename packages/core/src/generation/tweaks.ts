// Preview tweaks (openspec add-preview-tweaks): the knobs a design exposes
// through its base `:root` custom properties, an in-place rewriter that
// changes only those declarations' values, and "save as variant". The VS Code
// preview renders the knobs and sends the chosen values back to the host.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import postcss, { type Declaration } from 'postcss';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { findCollectionArtifacts } from '../workspace/collectionScan';

export type TweakType = 'color' | 'length' | 'number' | 'font' | 'text';
export type TweakSource = 'contract' | 'declared' | 'inferred';

export interface TweakKnob {
  /** The custom property, e.g. `--accent`. */
  name: string;
  label: string;
  group: string;
  type: TweakType;
  source: TweakSource;
  /** A design-token contract variable, which "Apply to design system" can write. */
  contract: boolean;
  /** The value as declared (may be a `var(...)` reference). */
  value: string;
  /** The value after following `var()` references; what the control shows. */
  resolved: string;
  /** The variable a change is written to: `name`, or the variable a `var()` chain ends at. */
  editAt: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  /** Also declared in a media query or another `:root`-like rule (e.g. dark mode), which Apply leaves alone. */
  overridden?: boolean;
}

export interface TweakDiscovery {
  knobs: TweakKnob[];
  /** True when the design exposes too few knobs to be worth tweaking (outside "More"). */
  fewVariables: boolean;
  /** A problem reading the `od-tweaks` declaration block, if any. */
  declarationError?: string;
}

/** One entry of the optional `<script type="application/od-tweaks+json">` block. */
export interface TweakDeclaration {
  var: string;
  label?: string;
  group?: string;
  type?: TweakType;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export const TWEAKS_BLOCK_TYPE = 'application/od-tweaks+json';
/** Fewer primary knobs than this shows the "ask the agent to tokenize it" empty state. */
export const FEW_VARIABLES_THRESHOLD = 3;

const CONTRACT = new Map(TOKEN_SCHEMA.map((t) => [t.name, t]));

/** True for a design-token contract variable (what a design system's tokens.css declares). */
export function isContractToken(name: string): boolean {
  return CONTRACT.has(name);
}
const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.*\)|transparent|white|black|currentcolor)$/i;
const LENGTH_RE = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|pt|svh|dvh|lvh)$/i;
const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;
const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,[\s\S]*)?\)$/;

interface StyleBlock {
  /** Offset of the CSS text inside the document. */
  start: number;
  css: string;
}

/** The `<style>` blocks' CSS with their offsets; a plain CSS file is one block. */
function styleBlocks(source: string, kind: 'html' | 'css'): StyleBlock[] {
  if (kind === 'css') return [{ start: 0, css: source }];
  const blocks: StyleBlock[] = [];
  for (const m of source.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style\s*>/gi)) {
    blocks.push({ start: (m.index ?? 0) + m[1].length, css: m[2] });
  }
  return blocks;
}

function isBaseRoot(decl: Declaration): boolean {
  const rule = decl.parent;
  if (!rule || rule.type !== 'rule') return false;
  if (rule.parent && rule.parent.type !== 'root') return false;
  return (rule as postcss.Rule).selectors.some((s) => s.trim() === ':root');
}

/** A `:root`-scoped override: inside an at-rule, or a selector like `:root[data-theme="dark"]`. */
function isRootOverride(decl: Declaration): boolean {
  const rule = decl.parent;
  if (!rule || rule.type !== 'rule' || isBaseRoot(decl)) return false;
  return (rule as postcss.Rule).selectors.some((s) => /^(html)?:root\b|^html\b/.test(s.trim()));
}

interface FoundDecl {
  decl: Declaration;
  blockStart: number;
}

function walkCustomProps(source: string, kind: 'html' | 'css', fn: (found: FoundDecl) => void): void {
  for (const block of styleBlocks(source, kind)) {
    let root;
    try {
      root = postcss.parse(block.css);
    } catch {
      continue;
    }
    root.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) fn({ decl, blockStart: block.start });
    });
  }
}

/** Base (non-media) `:root` custom properties, last declaration wins, in first-seen order. */
export function readRootVariables(source: string, kind: 'html' | 'css' = 'html'): { values: Map<string, string>; overridden: Set<string> } {
  const values = new Map<string, string>();
  const overridden = new Set<string>();
  walkCustomProps(source, kind, ({ decl }) => {
    if (isBaseRoot(decl)) values.set(decl.prop, decl.value.trim());
    else if (isRootOverride(decl)) overridden.add(decl.prop);
  });
  return { values, overridden };
}

/** Follows `var(--x)` references through `values`; returns the final variable and its value. */
export function resolveVar(name: string, values: Map<string, string>): { editAt: string; resolved: string } {
  let current = name;
  const seen = new Set<string>();
  for (;;) {
    const value = values.get(current) ?? '';
    const ref = VAR_RE.exec(value);
    if (!ref || seen.has(ref[1]) || !values.has(ref[1])) return { editAt: current, resolved: value };
    seen.add(current);
    current = ref[1];
  }
}

export function inferTweakType(name: string, value: string): TweakType | undefined {
  if (/^--font-(display|body|mono|sans|serif|heading|ui)\b|^--font$|^--font-family/.test(name)) return 'font';
  const v = value.trim();
  if (COLOR_RE.test(v)) return 'color';
  if (LENGTH_RE.test(v)) return 'length';
  if (NUMBER_RE.test(v)) return 'number';
  return undefined;
}

function labelFor(name: string): string {
  const words = name.replace(/^--/, '').split('-').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function contractGroup(name: string): string {
  if (/^--(font|text|leading|tracking)/.test(name)) return 'Type';
  if (/^--(space|section|container)/.test(name)) return 'Spacing & layout';
  if (/^--radius/.test(name)) return 'Shape';
  if (/^--(elev|focus)/.test(name)) return 'Elevation';
  if (/^--(motion|ease)/.test(name)) return 'Motion';
  return 'Color';
}

/** Default range around the current value (design D3). */
function defaultRange(type: TweakType, resolved: string): Pick<TweakKnob, 'min' | 'max' | 'step' | 'unit'> {
  if (type === 'length') {
    const m = LENGTH_RE.exec(resolved.trim());
    if (!m) return {};
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const px = unit === 'px' || unit === 'pt';
    const step = px ? 1 : unit === '%' || unit === 'vw' || unit === 'vh' ? 0.5 : 0.0625;
    const round = (x: number) => Math.round(x / step) * step;
    if (n === 0) return { min: 0, max: px ? 32 : 2, step, unit };
    const lo = round(Math.min(n * 0.5, n * 2));
    const hi = round(Math.max(n * 0.5, n * 2));
    return { min: lo, max: hi, step, unit };
  }
  if (type === 'number') {
    const n = Number(resolved.trim());
    if (!Number.isFinite(n)) return {};
    if (Math.abs(n) <= 3) return { min: Math.min(0.8, n), max: Math.max(1.6, n), step: 0.01 };
    return { min: Math.round(n * 0.5), max: Math.round(n * 2), step: 1 };
  }
  return {};
}

/** Parses the `od-tweaks` block: `{ "knobs": [...] }` or a bare array. */
export function readTweakDeclarations(html: string): { declarations: TweakDeclaration[]; error?: string } {
  const m = new RegExp(`<script\\b[^>]*type=["']${TWEAKS_BLOCK_TYPE.replace(/[+.]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)</script\\s*>`, 'i').exec(html);
  if (!m) return { declarations: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch (err) {
    return { declarations: [], error: `The od-tweaks block isn't valid JSON (${(err as Error).message}).` };
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { knobs?: unknown })?.knobs;
  if (!Array.isArray(list)) return { declarations: [], error: 'The od-tweaks block should be {"knobs": [...]} or an array of knobs.' };
  const declarations: TweakDeclaration[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || typeof (entry as TweakDeclaration).var !== 'string' || !(entry as TweakDeclaration).var.startsWith('--')) continue;
    const e = entry as Record<string, unknown>;
    const num = (k: string) => (typeof e[k] === 'number' && Number.isFinite(e[k]) ? (e[k] as number) : undefined);
    declarations.push({
      var: e.var as string,
      label: typeof e.label === 'string' ? e.label : undefined,
      group: typeof e.group === 'string' ? e.group : undefined,
      type: ['color', 'length', 'number', 'font', 'text'].includes(e.type as string) ? (e.type as TweakType) : undefined,
      min: num('min'),
      max: num('max'),
      step: num('step'),
      options: Array.isArray(e.options) ? e.options.filter((o): o is string => typeof o === 'string') : undefined,
    });
  }
  return { declarations };
}

/**
 * The knobs for an HTML design (design D2): token-contract variables, then
 * variables named in the declaration block, then other variables whose value
 * reads as a color, length or number (group "More").
 */
export function discoverTweaks(html: string): TweakDiscovery {
  const { values, overridden } = readRootVariables(html, 'html');
  const { declarations, error } = readTweakDeclarations(html);
  const declared = new Map(declarations.map((d) => [d.var, d]));
  const knobs: TweakKnob[] = [];
  const fonts = [...values.entries()].filter(([n]) => inferTweakType(n, '') === 'font').map(([, v]) => v);

  const make = (name: string, source: TweakSource, type: TweakType, group: string): TweakKnob => {
    const { editAt, resolved } = resolveVar(name, values);
    const spec = CONTRACT.get(name);
    const d = declared.get(name);
    const knob: TweakKnob = {
      name,
      label: d?.label ?? labelFor(name),
      group: d?.group ?? group,
      type: d?.type ?? type,
      source,
      contract: Boolean(spec),
      value: values.get(name) ?? '',
      resolved,
      editAt,
      ...(spec ? { description: spec.description } : {}),
      ...defaultRange(d?.type ?? type, resolved),
    };
    if (d?.min !== undefined) knob.min = d.min;
    if (d?.max !== undefined) knob.max = d.max;
    if (d?.step !== undefined) knob.step = d.step;
    if (d?.options?.length) knob.options = d.options;
    else if (knob.type === 'font') knob.options = [...new Set([resolved, ...fonts.filter((f) => !VAR_RE.test(f))])];
    if (overridden.has(name)) knob.overridden = true;
    return knob;
  };

  // Contract tokens in schema order.
  for (const spec of TOKEN_SCHEMA) {
    if (!values.has(spec.name)) continue;
    const { resolved } = resolveVar(spec.name, values);
    knobs.push(make(spec.name, declared.has(spec.name) ? 'declared' : 'contract', inferTweakType(spec.name, resolved) ?? 'text', contractGroup(spec.name)));
  }
  // Declared, non-contract variables in block order.
  for (const d of declarations) {
    if (CONTRACT.has(d.var) || !values.has(d.var) || knobs.some((k) => k.name === d.var)) continue;
    const { resolved } = resolveVar(d.var, values);
    knobs.push(make(d.var, 'declared', inferTweakType(d.var, resolved) ?? 'text', 'Design'));
  }
  // Everything else whose type we can tell.
  for (const name of values.keys()) {
    if (knobs.some((k) => k.name === name)) continue;
    const { resolved } = resolveVar(name, values);
    const type = inferTweakType(name, resolved);
    if (type) knobs.push(make(name, 'inferred', type, 'More'));
  }
  const primary = knobs.filter((k) => k.group !== 'More').length;
  return { knobs, fewVariables: primary < FEW_VARIABLES_THRESHOLD, ...(error ? { declarationError: error } : {}) };
}

export interface RewriteResult {
  text: string;
  /** Variables whose value was rewritten. */
  changed: string[];
  /** Variables with no base `:root` declaration to rewrite. */
  missing: string[];
}

/**
 * Rewrites the values of `values`' variables inside base `:root` rules,
 * leaving every other byte of `source` as it was (design D1). Every base
 * declaration of a variable is rewritten, so a later duplicate can't undo it.
 */
export function rewriteRootValues(source: string, values: Record<string, string>, kind: 'html' | 'css' = 'html'): RewriteResult {
  const edits: { start: number; end: number; text: string; name: string }[] = [];
  walkCustomProps(source, kind, ({ decl, blockStart }) => {
    if (!isBaseRoot(decl) || !(decl.prop in values) || decl.source?.start?.offset === undefined) return;
    const next = values[decl.prop].trim();
    if (!next || /[;{}]/.test(next)) return;
    const raw = (decl.raws as { value?: { raw?: string } }).value?.raw ?? decl.value;
    const valueStart = blockStart + decl.source.start.offset + decl.prop.length + (decl.raws.between ?? ':').length;
    const lead = raw.length - raw.trimStart().length;
    const start = valueStart + lead;
    edits.push({ start, end: start + raw.trim().length, text: next, name: decl.prop });
  });
  let text = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  const changed = [...new Set(edits.map((e) => e.name))];
  return { text, changed, missing: Object.keys(values).filter((n) => !changed.includes(n)) };
}

/** A chat request asking the agent to carry tweaked values through a design (design: "Send to chat"). */
export function formatTweaksForChat(entryPath: string, values: Record<string, string>): string {
  const lines = Object.entries(values).map(([name, value]) => `- \`${name}\`: \`${value}\``);
  return `In the Open Design artifact at "${entryPath}", I tried these values in the preview's Tweaks panel:\n\n${lines.join('\n')}\n\nApply them, and carry the change through anywhere the design hard-codes the old values instead of using these variables.`;
}

/** A sibling path for a variant: `dir/name.html` + "Warm sand" → `dir/name-warm-sand.html`. */
function slugLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function variantEntryPath(entryPath: string, label: string): string {
  const slug = slugLabel(label) || 'variant';
  const dot = entryPath.lastIndexOf('.');
  const slash = entryPath.lastIndexOf('/');
  const ext = dot > slash ? entryPath.slice(dot) : '.html';
  const base = dot > slash ? entryPath.slice(0, dot) : entryPath;
  return `${base}-${slug}${ext}`;
}

export interface SaveTweakVariantResult {
  ok: boolean;
  entryPath?: string;
  error?: string;
}

/**
 * "Save as variant" (design D4): writes a copy of the design with `values`
 * applied next to the original, registers it in the original's collection
 * (creating one, with the original as its master, when it has none) with
 * `screenRole: "variant"`, and leaves the original file unchanged.
 */
export async function saveTweakVariant(input: {
  workspaceRoot: string;
  entryPath: string;
  outputDir: string;
  /** The design's current text (the open, possibly unsaved, document). */
  source: string;
  values: Record<string, string>;
  label: string;
}): Promise<SaveTweakVariantResult> {
  const artifact = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath });
  const manifest = artifact?.manifest as Record<string, unknown> | undefined;
  if (!manifest) return { ok: false, error: 'Register this design first (register_open_design_artifact) to save variants of it.' };
  const target = variantEntryPath(input.entryPath, input.label);
  const absTarget = path.join(input.workspaceRoot, target);
  try {
    await fs.access(absTarget);
    return { ok: false, error: `${target} already exists. Pick another label.` };
  } catch {
    // Free to write.
  }

  const title = typeof manifest.title === 'string' ? manifest.title : path.posix.basename(input.entryPath);
  const existingId = typeof manifest.collectionId === 'string' && manifest.collectionId ? manifest.collectionId : undefined;
  const collectionId = existingId ?? `${slugLabel(path.posix.basename(input.entryPath, path.posix.extname(input.entryPath)))}-variants`;
  const collectionName = existingId ? (typeof manifest.collectionName === 'string' ? manifest.collectionName : existingId) : title;
  if (!existingId) {
    await writeArtifactManifest({
      workspaceRoot: input.workspaceRoot,
      entryPath: input.entryPath,
      artifactManifest: { ...manifest, collectionId, collectionName, screenRole: 'master', screenIndex: 0 },
    });
  }
  const siblings = existingId ? (await findCollectionArtifacts(input.workspaceRoot, input.outputDir, collectionId)).length : 1;

  await fs.writeFile(absTarget, rewriteRootValues(input.source, input.values).text);
  // A variant is a new design: not part of the original's exploration, and not published anywhere yet.
  const rest: Record<string, unknown> = { ...manifest };
  for (const key of ['collectionId', 'collectionName', 'screenRole', 'screenIndex', 'explorationId', 'directionId']) delete rest[key];
  const metadata = rest.metadata && typeof rest.metadata === 'object' && !Array.isArray(rest.metadata) ? { ...(rest.metadata as Record<string, unknown>) } : undefined;
  if (metadata) delete metadata.shares;
  await writeArtifactManifest({
    workspaceRoot: input.workspaceRoot,
    entryPath: target,
    artifactManifest: {
      ...rest,
      ...(metadata ? { metadata } : {}),
      title: `${title} — ${input.label}`,
      collectionId,
      collectionName,
      screenRole: 'variant',
      screenIndex: siblings,
    },
  });
  return { ok: true, entryPath: target };
}
