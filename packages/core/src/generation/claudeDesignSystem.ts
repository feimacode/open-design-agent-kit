// One-off conversion between an Open Design design system (DESIGN.md +
// tokens.css) and a Claude Design System artifact (a `project/` file tree:
// design-system.json index, list-shaped tokens.json, README.md brand book,
// components/Cover/preview.html). Pure: callers read and write the files.
// Claude has no public API for these, so publishing the exported tree (or
// fetching one to import) is left to an agent's Artifact tool.
//
// Lossy by design, and every loss is reported in `notes`:
//   - Claude's tokens.json rejects `var()` and `color-mix()`; colour `var()`
//     references become `{alias}` tokens, other lengths/shadows are resolved
//     to literals, and color-mix values are computed to literal colours.
//   - Claude has no motion family, so `--motion-*` / `--ease-*` are skipped.
// Importing maps arbitrary Claude token names onto the Open Design token
// contract by name heuristics, keeping the original names as well.

import { MOTION_CORE_NAMES, MOTION_VOCABULARY_NAMES, withMotionVocabulary } from './motionVocabulary';
import { CHART_VOCABULARY_NAMES, withChartVocabulary } from './chartVocabulary';
import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { contrastRatio, parseColor, resolveColorValue, resolveColorsIn } from './colorMix';
import { contrastFindings } from './claudeDesignSystemFormat';
import { isSafeCssValue, resolveTokenValue } from './designSystemTokens';

// ---------- shared ----------

export interface ClaudeToken {
  name: string;
  value: string | Record<string, string>;
  usage?: string;
}

export interface ClaudeTypeStyle {
  name: string;
  fontSize: string;
  lineHeight?: string | number;
  letterSpacing?: string;
  fontWeight?: number | string;
  family?: string;
  usage?: string;
}

export interface ClaudeTokensJson {
  name?: string;
  version?: number;
  meta?: Record<string, unknown>;
  color?: { themes?: Array<{ id: string; name?: string }>; tokens?: ClaudeToken[] };
  type?: {
    fonts?: unknown[];
    families?: Record<string, string>;
    groups?: Array<{ name: string; family?: string; styles?: ClaudeTypeStyle[] }>;
  };
  [family: string]: unknown;
}

const COLOR_FN = /^(rgba?|hsla?|oklch|oklab|lab|lch|color)\(([^()]*)\)$/i;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LENGTH = /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%)?$/;
const VAR_ONLY = /^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/;
const CLAUDE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
// Families the importer and exporter both treat as contract-shaped; any
// other `{tokens:[…]}` family in a Claude system is carried as-is.
const TYPE_METRICS_FAMILY = 'typeMetrics';

const TINT_NAME = /soft|light|tint|subtle|faint|muted|bg|background|surface|on[-_.]|ink|text|line|border/i;

/** Rough chroma 0–1 of a plain colour (hex spread, or oklch/lch chroma). */
function chroma(value: string): number {
  const hex = HEX.exec(value)?.[0];
  if (hex) {
    let h = hex.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return Math.max(...rgb) - Math.min(...rgb);
  }
  const fn = /^(oklch|lch)\(\s*[\d.]+%?\s+([\d.]+)/i.exec(value);
  if (fn) return parseFloat(fn[2]) / (fn[1].toLowerCase() === 'lch' ? 150 : 0.4);
  return 0;
}

function mostChromatic(names: string[], values: Map<string, string>): string | undefined {
  let best: string | undefined;
  let bestChroma = 0.15;
  for (const n of names) {
    const c = chroma(values.get(n) ?? '');
    if (c > bestChroma) [best, bestChroma] = [n, c];
  }
  return best;
}

const toPx = (v: string | number | undefined): number | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(v.trim());
  if (!m) return undefined;
  return parseFloat(m[1]) * (m[2] === 'rem' || m[2] === 'em' ? 16 : 1);
};

function isPlainColor(value: string): boolean {
  return HEX.test(value) || COLOR_FN.test(value);
}

function contractDescription(name: string): string | undefined {
  return TOKEN_SCHEMA.find((t) => t.name === `--${name}`)?.description;
}

/** Top-level rule bodies of a stylesheet, recursing into `@media (prefers-color-scheme: dark)`. */
function cssBlocks(css: string): Array<{ selector: string; body: string; darkMedia: boolean }> {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Array<{ selector: string; body: string; darkMedia: boolean }> = [];
  const walk = (src: string, darkMedia: boolean): void => {
    let depth = 0;
    let start = 0;
    let open = -1;
    let selector = '';
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '{') {
        if (depth === 0) {
          selector = src.slice(start, i).trim();
          open = i + 1;
        }
        depth++;
      } else if (src[i] === '}') {
        depth = Math.max(0, depth - 1);
        if (depth === 0 && open >= 0) {
          const body = src.slice(open, i);
          if (selector.startsWith('@media')) {
            if (/prefers-color-scheme\s*:\s*dark/.test(selector)) walk(body, true);
          } else if (!selector.startsWith('@')) {
            out.push({ selector, body, darkMedia });
          }
          start = i + 1;
          open = -1;
        }
      }
    }
  };
  walk(text, false);
  return out;
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);/g)) {
    const value = m[2].trim().replace(/\s+/g, ' ');
    if (isSafeCssValue(value)) out.set(m[1], value);
  }
  return out;
}

const isDarkSelector = (selector: string): boolean => /dark/i.test(selector);

/** Rough lightness 0–1 of a plain colour, for naming the first theme. */
function lightness(value: string): number | undefined {
  const hex = HEX.exec(value)?.[0];
  if (hex) {
    let h = hex.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const fn = /^(oklch|oklab|lab|lch)\(\s*([\d.]+)(%?)/i.exec(value);
  if (fn) {
    const n = parseFloat(fn[2]);
    if (fn[3] === '%' || fn[1].toLowerCase().startsWith('l')) return n / 100;
    return n;
  }
  return undefined;
}

// ---------- Open Design → Claude ----------

export interface ToClaudeDesignSystemInput {
  /** Display name; becomes the index `title`. */
  name: string;
  /** Open Design id (bundled directory name or `user:<dir>`), recorded in tokens.json meta. */
  id: string;
  designMd: string;
  tokensCss?: string;
  /** Who the change is recorded for in `lastChange.by`. */
  by?: string;
  /** ISO timestamp; defaults to now. */
  now?: string;
  /** `lastChange.via`; defaults to "Open Design · <id>". */
  via?: string;
  /** `lastChange.note`; defaults to a one-off export note. */
  note?: string;
  /** tokens.json `meta` (a provenance note); defaults to the Open Design id and date. */
  meta?: Record<string, unknown>;
}

export interface ClaudeDesignSystemFiles {
  /** Paths relative to the artifact root (all under `project/`) → file text. */
  files: Record<string, string>;
  /** Everything that did not carry across, one line each. */
  notes: string[];
}

/** Usage notes for the contract's text colours, naming the grounds they read on so contrast can be checked. */
const TEXT_GROUNDS: Record<string, string> = {
  fg: 'Primary text on `bg` and `surface`.',
  'fg-2': 'Secondary text on `bg` and `surface`.',
  muted: 'Subtext and captions on `bg` and `surface`.',
  'accent-on': 'Text and icons on `accent` fills.',
};

export function toClaudeDesignSystem(input: ToClaudeDesignSystemInput): ClaudeDesignSystemFiles {
  const now = input.now ?? new Date().toISOString();
  const notes: string[] = [];
  let motionSeen = false;
  const blocks = input.tokensCss ? cssBlocks(input.tokensCss) : [];
  const base = new Map<string, string>();
  const dark = new Map<string, string>();
  for (const block of blocks) {
    const decls = declarations(block.body);
    if (block.selector === ':root' && !block.darkMedia) for (const [k, v] of decls) base.set(k, v);
    else if (block.darkMedia || isDarkSelector(block.selector)) for (const [k, v] of decls) dark.set(k, v);
  }
  if (!input.tokensCss) notes.push('No tokens.css: only the README was exported.');

  const lookupIn = (overlay?: Map<string, string>) => (name: string): string | undefined => overlay?.get(name) ?? base.get(name);
  const baseLookup = lookupIn();
  const darkLookup = lookupIn(dark);
  const resolvedBase = new Map([...base].map(([k, v]) => [`--${k}`, v]));
  const literal = (name: string): string | undefined => resolveTokenValue(resolvedBase, `--${name}`);

  // A token is a colour when its value is a colour, a color-mix(), or an alias chain ending in one.
  const colorNames = new Set<string>();
  const isColorName = (name: string, seen = new Set<string>()): boolean => {
    const v = base.get(name) ?? dark.get(name);
    if (v === undefined || seen.has(name)) return false;
    if (isPlainColor(v) || parseColor(v) || /^color-mix\(/i.test(v)) return true;
    const ref = VAR_ONLY.exec(v)?.[1];
    return ref ? isColorName(ref, new Set([...seen, name])) : false;
  };
  for (const name of new Set([...base.keys(), ...dark.keys()])) if (isColorName(name)) colorNames.add(name);
  // An alias survives only when its target is emitted too; otherwise its value is resolved.
  const aliasable = (ref: string): boolean => colorNames.has(ref) && CLAUDE_NAME.test(ref) && resolveColorValue(`var(--${ref})`, baseLookup) !== undefined;

  const mixed: string[] = [];
  const toColorValue = (name: string, v: string | undefined, lookup: (n: string) => string | undefined): string | undefined => {
    if (v === undefined) return undefined;
    if (HEX.test(v)) return v.toLowerCase();
    if (isPlainColor(v)) return v;
    const ref = VAR_ONLY.exec(v)?.[1];
    if (ref && aliasable(ref)) return `{${ref}}`;
    const resolved = resolveColorValue(v, lookup);
    if (resolved === undefined) {
      notes.push(`--${name}: ${v} skipped (it does not resolve to a colour).`);
      return undefined;
    }
    if (/color-mix\(/i.test(v) && !mixed.includes(name)) mixed.push(name);
    return resolved;
  };

  const bg = base.get('bg');
  const firstThemeDark = bg !== undefined && (lightness(resolveColorValue(bg, baseLookup) ?? bg) ?? 1) < 0.5;
  const themes = firstThemeDark
    ? [{ id: 'dark', name: 'Dark' }]
    : dark.size > 0
      ? [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }]
      : [{ id: 'light', name: 'Light' }];
  if (firstThemeDark && dark.size > 0) notes.push('Dark-mode overrides skipped: the base theme is already dark.');
  const hasDarkTheme = themes.length === 2;

  // Every family but type shares one name space on the page; a second use drops.
  const used = new Set<string>();
  const claim = (name: string): boolean => {
    if (!CLAUDE_NAME.test(name)) {
      notes.push(`--${name} skipped: name is not valid in Claude tokens.`);
      return false;
    }
    if (used.has(name)) {
      notes.push(`--${name} skipped: the name is already used by another token.`);
      return false;
    }
    used.add(name);
    return true;
  };

  const colorTokens: ClaudeToken[] = [];
  for (const name of colorNames) {
    const first = toColorValue(name, base.get(name), baseLookup);
    const second = hasDarkTheme && dark.has(name) ? toColorValue(name, dark.get(name), darkLookup) : undefined;
    if (first === undefined && second === undefined) continue;
    if (!claim(name)) continue;
    // A token with no dark override stays a plain string: Claude reuses the first theme's value.
    const value: ClaudeToken['value'] = second !== undefined && first !== undefined && second !== first ? { [themes[0].id]: first, dark: second } : first ?? second!;
    colorTokens.push({ name, value, usage: TEXT_GROUNDS[name] ?? contractDescription(name) ?? 'Brand-specific colour from Open Design.' });
  }

  const spacing: ClaudeToken[] = [];
  const radius: ClaudeToken[] = [];
  const shadow: ClaudeToken[] = [];
  const typeMetrics: ClaudeToken[] = [];
  const families: Record<string, string> = {};
  const textSizes = new Map<string, string>();

  for (const [name, raw] of base) {
    if (colorNames.has(name)) continue;
    const value = literal(name) ?? raw;
    const usage = contractDescription(name) ?? 'Brand-specific token from Open Design.';
    const fontKey = /^font-(.+)$/.exec(name)?.[1];
    if (fontKey) {
      const stack = fitFontStack(value);
      if (stack === undefined) notes.push(`--${name} skipped: font stack has characters Claude rejects.`);
      else {
        if (stack !== value) notes.push(`--${name} shortened to Claude's 200-character limit: ${stack}.`);
        families[fontKey.toLowerCase()] = stack;
      }
    } else if (/^text-/.test(name)) {
      textSizes.set(name, value);
    } else if (/^(leading|tracking)-/.test(name)) {
      if (claim(name)) typeMetrics.push({ name, value, usage });
    } else if (/^(motion|ease|duration)-/.test(name)) {
      motionSeen = true;
    } else if (/(^|-)(elev|shadow)(-|$)|^focus-ring$/.test(name)) {
      const first = resolveColorsIn(raw, baseLookup);
      if (first === undefined) {
        notes.push(`--${name}: ${raw} skipped (unresolvable reference).`);
        continue;
      }
      if (/color-mix\(/i.test(raw) && !mixed.includes(name)) mixed.push(name);
      const darkValue = hasDarkTheme ? resolveColorsIn(dark.get(name) ?? raw, darkLookup) : undefined;
      if (!claim(name)) continue;
      shadow.push({ name, value: darkValue && darkValue !== first ? { [themes[0].id]: first, dark: darkValue } : first, usage });
    } else if (LENGTH.test(value)) {
      if (claim(name)) (/radius|rounded/.test(name) ? radius : spacing).push({ name, value, usage });
    } else {
      notes.push(`--${name}: ${raw} skipped (no matching Claude token family).`);
    }
  }
  if (mixed.length) {
    notes.push(`Written as literal colours computed from color-mix(): ${mixed.map((n) => `--${n}`).join(', ')}. They won't follow later edits to the colours they mix.`);
  }

  const body = families.body ? 'body' : Object.keys(families)[0];
  const display = families.display ? 'display' : body;
  const leadingBody = base.get('leading-body');
  const leadingTight = base.get('leading-tight');
  const tracking = base.get('tracking-display');
  const steps = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];
  const style = (name: string, isDisplay: boolean): ClaudeTypeStyle | undefined => {
    const fontSize = textSizes.get(name);
    if (!fontSize) return undefined;
    textSizes.delete(name);
    const lineHeight = isDisplay ? leadingTight : leadingBody;
    return {
      name,
      fontSize,
      ...(lineHeight !== undefined ? { lineHeight: /^[\d.]+$/.test(lineHeight) ? Number(lineHeight) : lineHeight } : {}),
      ...(isDisplay && tracking && tracking !== '0' ? { letterSpacing: tracking } : {}),
      usage: contractDescription(name),
    };
  };
  const textStyles = steps.slice(0, 4).map((n) => style(n, false)).filter((s): s is ClaudeTypeStyle => !!s);
  const displayStyles = steps.slice(4).map((n) => style(n, true)).filter((s): s is ClaudeTypeStyle => !!s);
  for (const [name, fontSize] of textSizes) textStyles.push({ name, fontSize });
  textStyles.sort((a, b) => (toPx(a.fontSize) ?? 0) - (toPx(b.fontSize) ?? 0));
  const groups = [
    ...(displayStyles.length ? [{ name: 'Display', family: display, styles: displayStyles }] : []),
    ...(textStyles.length ? [{ name: 'Text', family: body, styles: textStyles }] : []),
  ].filter((g) => g.family);

  const tokens: ClaudeTokensJson = {
    name: input.name,
    version: 1,
    meta: input.meta ?? { source: 'open-design', id: input.id, synced: now.slice(0, 10) },
    color: { themes, tokens: colorTokens },
    type: { fonts: [], families, groups },
    spacing: { tokens: spacing },
    radius: { tokens: radius },
    ...(shadow.length ? { shadow: { tokens: shadow } } : {}),
    ...(typeMetrics.length ? { [TYPE_METRICS_FAMILY]: { note: 'Line heights and tracking from the Open Design token contract.', tokens: typeMetrics } } : {}),
  };
  // A brand's own failing pair stays exact; its usage note says so (craft.md, "Legible in every theme").
  for (const f of contrastFindings(tokens as Record<string, unknown>)) {
    const t = colorTokens.find((c) => c.name === f.token);
    if (t) t.usage = `${t.usage} Below 4.5:1 on \`${f.ground}\`${themes.length > 1 ? ` in ${f.theme}` : ''} (${f.ratio}:1), as the brand has it.`;
  }

  // Claude has no motion family: the motion tokens and the derived vocabulary go into the README as guidance (openspec add-motion-vocabulary).
  const motion = motionSeen || base.size > 0 ? motionReadmeSection(base) : '';
  if (motion) notes.push('Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.');
  // Chart colours are derived, not the brand's own colour tokens: listed in the README as guidance (openspec add-chart-tokens).
  const charts = base.size > 0 ? chartReadmeSection(base) : '';
  const readme = `${brandBook(input.designMd)}${motion}${charts}\n\n## Not synced from Open Design\n\n${
    notes.length ? notes.map((n) => `- ${n}`).join('\n') : '- Everything in tokens.css carried across.'
  }\n- Fonts are named by family only (hosted faces); no font files were copied.\n- No components or assets: Open Design design systems carry tokens and guidance only.\n`;

  const index = {
    v: 3,
    layout: 'files',
    createdOnFiles: { v: 1, at: now },
    title: input.name,
    namespace: namespaceOf(input.name),
    libraries: [],
    sections: {},
    groups: [],
    assetGroups: {},
    blobs: {},
    docs: { sections: [] },
    lastChange: { by: input.by ?? 'Claude', at: now, via: input.via ?? `Open Design · ${input.id}`, note: input.note ?? 'One-off export from Open Design.' },
  };

  return {
    files: {
      'project/README.md': readme,
      'project/tokens.json': `${JSON.stringify(tokens, null, 2)}\n`,
      'project/components/Cover/preview.html': coverHtml({
        name: input.name,
        tagline: summaryOf(input.designMd),
        colors: colorTokens,
        families,
        displayKey: display,
        radiusLg: toPx(literal('radius-lg')),
        hasRadius: (n: string) => radius.some((r) => r.name === n),
      }),
      'project/design-system.json': `${JSON.stringify(index, null, 2)}\n`,
    },
    notes,
  };
}

/** A font stack Claude accepts (≤200 characters, no functions): long fallback lists keep their head and generic family. */
function fitFontStack(stack: string): string | undefined {
  if (/[;{}<>\\()]/.test(stack)) return undefined;
  if (stack.length <= 200) return stack;
  const parts = stack.split(',').map((s) => s.trim()).filter(Boolean);
  const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/.test(parts[parts.length - 1] ?? '') ? parts.pop()! : undefined;
  const kept: string[] = [];
  for (const p of parts) {
    if ([...kept, p, ...(generic ? [generic] : [])].join(', ').length > 200) break;
    kept.push(p);
  }
  return kept.length ? [...kept, ...(generic ? [generic] : [])].join(', ') : undefined;
}

/** DESIGN.md as a Claude brand book: no `#` title (the page shows the name) and no provenance lines. */
function brandBook(designMd: string): string {
  const lines = designMd.replace(/\r\n/g, '\n').trim().split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0 && /^#\s/.test(lines[first])) lines.splice(first, 1);
  return lines
    .filter((l) => !/^\s*>\s*Category:/i.test(l))
    .join('\n')
    .trim();
}

function namespaceOf(name: string): string {
  const ns = name
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
  return /^[A-Za-z]/.test(ns) ? ns : `DS${ns}`;
}

function summaryOf(designMd: string): string {
  const quote = designMd
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('>') && !/^>\s*Category:/i.test(l.trim()))
    .map((l) => l.replace(/^\s*>\s?/, ''))
    .join(' ')
    .trim();
  const sentence = /^[^.!?]*[.!?]/.exec(quote)?.[0] ?? quote;
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence;
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface CoverInput {
  name: string;
  tagline: string;
  colors: ClaudeToken[];
  families: Record<string, string>;
  displayKey: string | undefined;
  radiusLg: number | undefined;
  hasRadius: (name: string) => boolean;
}

type CoverPattern = 'pills' | 'dots' | 'rules' | 'tiles';

/** cover.md's pattern rows, picked from what the tokens say about the brand. */
function coverPattern(families: Record<string, string>, displayKey: string | undefined, radiusLg: number | undefined): { row: CoverPattern; why: string } {
  const first = (stack: string | undefined): string => (stack ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const bodyStack = families.body ?? '';
  const displayStack = (displayKey && families[displayKey]) ?? bodyStack;
  if ((radiusLg ?? 0) >= 16) return { row: 'pills', why: `soft and friendly: radius-lg is ${radiusLg}px` };
  if (/mono/.test(first(bodyStack)) || /monospace\s*$/i.test(bodyStack.trim())) return { row: 'dots', why: 'precise and technical: the body face is mono' };
  if (/serif/i.test(displayStack) && !/sans-serif/i.test(displayStack.split(',').pop() ?? '')) return { row: 'rules', why: 'editorial: the display face is a serif' };
  return { row: 'tiles', why: 'geometric and modular: tiles cut by the radius scale' };
}

/** The name's lines and size per cover.md: 120 down to 64px, longest line within 440px, two lines at most. */
function coverName(name: string, displayStack: string): { lines: string[]; size: number; band: boolean } {
  const em = /mono/i.test(displayStack) ? 0.62 : /serif/i.test(displayStack) && !/sans-serif/i.test(displayStack) ? 0.55 : 0.6;
  const width = (s: string, size: number): number => s.length * em * size;
  const fit = (lines: string[], maxWidth: number, min: number, max: number): number | undefined => {
    // Height: lines × size × .95 + tagline (20) + two 24px steps must fit 288.
    const byHeight = Math.floor((288 - 20 - 48) / (lines.length * 0.95));
    for (let size = Math.min(max, byHeight); size >= min; size--) if (lines.every((l) => width(l, size) <= maxWidth)) return size;
    return undefined;
  };
  const one = fit([name], 440, 64, 120);
  if (one) return { lines: [name], size: one, band: false };
  // Break once, at the space or hyphen nearest the middle.
  const breaks = [...name.matchAll(/[ -]/g)].map((m) => m.index!);
  if (breaks.length) {
    const at = breaks.reduce((a, b) => (Math.abs(b - name.length / 2) < Math.abs(a - name.length / 2) ? b : a));
    const lines = [name.slice(0, name[at] === '-' ? at + 1 : at), name.slice(at + 1)].map((l) => l.trim());
    const two = fit(lines, 440, 64, 120);
    if (two) return { lines, size: two, band: false };
  }
  // Too wide for its zone: the top-band skeleton, name full width beneath the band.
  const lines = [name];
  for (let size = 64; size >= 24; size--) if (width(name, size) <= 912) return { lines, size, band: true };
  return { lines, size: 24, band: true };
}

/** The cover per the type's cover brief: colour blocks, one pattern chosen from the tokens, the name bottom-left. */
function coverHtml(c: CoverInput): string {
  const has = (n: string): boolean => c.colors.some((t) => t.name === n);
  const pick = (...names: string[]): string | undefined => names.find(has);
  const brand = pick('accent', 'brand', 'primary') ?? c.colors[0]?.name ?? 'fg';
  const ink = pick('fg', 'ink', 'text') ?? brand;
  const ground = pick('bg', 'surface') ?? ink;
  // A block within a few percent of the ground vanishes; take the next tint that shows.
  const valueOf = (n: string, depth = 0): string | undefined => {
    const v = c.colors.find((t) => t.name === n)?.value;
    const s = typeof v === 'string' ? v : v ? Object.values(v)[0] : undefined;
    const alias = s ? /^\{(.+)\}$/.exec(s)?.[1] : undefined;
    return alias && depth < 16 ? valueOf(alias, depth + 1) : s;
  };
  const shows = (n: string): boolean => {
    const a = valueOf(n);
    const b = valueOf(ground);
    return !a || !b || (contrastRatio(a, b) ?? 2) >= 1.08;
  };
  const tint = ['surface-warm', 'border-soft', 'surface', 'border', 'muted'].find((n) => has(n) && n !== ground && shows(n)) ?? ink;
  const signal = pick('success', 'warn', 'danger') ?? brand;
  const muted = pick('muted', 'fg-2') ?? ink;
  const hairline = pick('border', 'border-soft') ?? ink;
  const fontVar = c.displayKey ? `var(--font-${c.displayKey})` : 'system-ui, sans-serif';
  const displayStack = (c.displayKey && c.families[c.displayKey]) || '';
  const { row, why } = coverPattern(c.families, c.displayKey, c.radiusLg);
  const nameFit = coverName(c.name, displayStack);
  const corner = (['radius-md', 'radius-sm', 'radius-lg'] as const).find(c.hasRadius);
  const rx = corner ? `var(--${corner})` : '0';

  // Blocks and pattern live in one box: x 480–960 beside the name, or a full-width band on top.
  const W = nameFit.band ? 960 : 480;
  const H = nameFit.band ? 112 : 288;
  const shapes: string[] = [];
  let blocksLine: string;
  let patternLine: string;
  if (nameFit.band) {
    blocksLine = `${brand} 320×112 band · ${tint} 288×80 · ${ink} 160×112 off the right edge · ${signal} 96×24 once`;
    shapes.push(`<rect class="brand blk" x="0" y="-16" width="320" height="128"/>`);
    shapes.push(`<rect class="tint blk" x="336" y="16" width="288" height="80"/>`);
    shapes.push(`<rect class="deep blk" x="816" y="0" width="160" height="112"/>`);
    shapes.push(`<rect class="signal blk" x="640" y="72" width="96" height="24"/>`);
  } else {
    blocksLine = `${brand} 144×264 slab bled off the top · ${tint} 168×176 · ${ink} 128×208 off the right edge · ${signal} 64×16 once`;
    shapes.push(`<rect class="brand blk" x="16" y="-24" width="144" height="264"/>`);
    shapes.push(`<rect class="signal blk" x="16" y="248" width="64" height="16"/>`);
    shapes.push(`<rect class="tint blk" x="176" y="88" width="168" height="176"/>`);
    shapes.push(`<rect class="deep blk" x="360" y="56" width="136" height="208"/>`);
  }
  const [px, py, pw, ph] = nameFit.band ? [336, 16, 288, 80] : [176, 88, 168, 176];
  if (row === 'pills') {
    patternLine = `pills over the ${tint} block, half-round ends (${why})`;
    for (let y = py + 16; y + 24 <= py + ph - 8; y += 40) {
      for (let x = px + 16, i = 0; x + 40 <= px + pw - 8; i++) {
        const w = i % 2 ? 40 : 64;
        if (x + w > px + pw - 8) break;
        shapes.push(`<rect class="${i % 3 === 1 ? 'deep' : 'brand'} pill" x="${x}" y="${y}" width="${w}" height="24"/>`);
        x += w + 16;
      }
    }
  } else if (row === 'dots') {
    patternLine = `dot grid at a 24px pitch over the ${tint} block (${why})`;
    for (let y = py + 16; y < py + ph - 8; y += 24) for (let x = px + 16; x < px + pw - 8; x += 24) shapes.push(`<circle class="dot" cx="${x}" cy="${y}" r="3"/>`);
  } else if (row === 'rules') {
    patternLine = `four ${hairline} hairlines crossing the blocks (${why})`;
    for (let i = 0; i < 4; i++) {
      const y = (nameFit.band ? 20 : 72) + i * (nameFit.band ? 24 : 48);
      shapes.push(`<line class="rule" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
    }
  } else {
    patternLine = `tiles cut by the radius scale over the ${tint} block, some two-wide (${why})`;
    let n = 0;
    for (let y = py + 16; y + 24 <= py + ph - 8; y += 32) {
      for (let x = px + 16; x + 24 <= px + pw - 8; n++) {
        const wide = n % 5 === 2 && x + 56 <= px + pw - 8;
        shapes.push(`<rect class="${n % 4 === 1 ? 'deep' : 'brand'} tile" x="${x}" y="${y}" width="${wide ? 56 : 24}" height="24"/>`);
        x += (wide ? 56 : 24) + 8;
      }
    }
  }
  const words = nameFit.band ? 'left:var(--space-6, 24px); right:var(--space-6, 24px); bottom:var(--space-6, 24px);' : 'left:var(--space-6, 24px); bottom:var(--space-6, 24px); max-width:440px;';
  return `<!-- @dsCard height=288 -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(c.name)}</title>
<style>
  html, body { margin:0; height:100%; }
  body { background:var(--${ground}); color:var(--${ink}); font-family:${fontVar}; overflow:hidden; }
  .cover { position:relative; height:288px; overflow:hidden; }
  .art { position:absolute; top:0; left:${nameFit.band ? 0 : 480}px; width:${W}px; height:${H}px; overflow:hidden; }
  .art svg { display:block; width:${W}px; height:${H}px; }
  .brand { fill:var(--${brand}); }
  .deep { fill:var(--${ink}); }
  .tint { fill:var(--${tint}); }
  .signal { fill:var(--${signal}); }
  .dot { fill:var(--${brand}); }
  .rule { stroke:var(--${hairline}); stroke-width:1; }
  .blk { rx:${rx}; }
  .tile { rx:${corner === 'radius-sm' || !c.hasRadius('radius-sm') ? rx : 'var(--radius-sm)'}; }
  .pill { rx:12px; }
  .words { position:absolute; ${words} }
  .name { margin:0; font-size:${nameFit.size}px; line-height:${nameFit.lines.length > 1 ? '.95' : '.92'}; font-weight:600; letter-spacing:-.02em; color:var(--${ink}); }
  .tag { margin:${Math.max(8, Math.round(nameFit.size * 0.18))}px 0 0 2px; font-size:14px; line-height:20px; color:var(--${muted}); }
</style>
</head>
<body>
<div class="cover">
<div class="art" aria-hidden="true">
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<!--
  blocks      ${blocksLine}
  arrangement ${nameFit.band ? 'a strip of unequal bands across the top, the name beneath it' : 'one tall brand slab with satellites, bottoms on one line'}
  pattern     ${patternLine}
  scales      gaps space-4; corners ${corner ?? 'square'}${row === 'pills' ? '; pills 24px tall, rx half of that' : ''}
-->
${shapes.join('\n')}
</svg>
</div>
<div class="words">
<h1 class="name">${nameFit.lines.map(escapeHtml).join('<br>')}</h1>
${c.tagline ? `<p class="tag">${escapeHtml(c.tagline)}</p>` : ''}
</div>
</div>
</body>
</html>
`;
}

// ---------- Claude → Open Design ----------

export interface FromClaudeDesignSystemInput {
  /** The index's `title`, or a name the caller chose. */
  title: string;
  tokensJson?: ClaudeTokensJson;
  readme?: string;
}

export interface OpenDesignDesignSystemFiles {
  designMd: string;
  tokensCss: string;
  notes: string[];
}

// Name patterns, best first, used to bind Claude token names onto contract colour slots.
const COLOR_SLOTS: ReadonlyArray<[string, RegExp[]]> = [
  ['accent', [/^accent$/, /^(brand|primary)$/, /^(accent|brand|primary)[-_.]?(500|600|default|base|main)?$/, /^(accent|brand|primary)/]],
  ['accent-on', [/^on[-_.]?(accent|brand|primary)/, /^(accent|brand|primary)[-_.](on|fg|foreground|contrast|text)/]],
  ['bg', [/^bg$/, /^background$/, /^(canvas|page)/, /^(bg|background)[-_.]?(page|base|default|0+|50|100)?$/, /^surface[-_.]?(0+|50|100|base|page)$/]],
  ['surface', [/^surface$/, /^(card|panel)/, /^surface[-_.]?(raised|elevated|1|200|card)$/, /^surface/]],
  ['fg', [/^fg$/, /^(ink|text|foreground)$/, /^(ink|text|fg|foreground)[-_.]?(primary|default|base|strong|900)?$/]],
  ['muted', [/^muted$/, /^(ink|text|fg|foreground)[-_.]?(muted|subtle|secondary|weak|2|600|500)$/, /muted|subtle/]],
  ['border', [/^border$/, /^(line|divider|hairline|stroke|rule)$/, /^(border|line|divider|hairline|stroke|outline)/]],
  ['success', [/success|positive/, /^(green|leaf)/]],
  ['warn', [/warn|caution/, /^(amber|yellow)/]],
  ['danger', [/danger|error|destructive|negative|critical/, /^red/]],
];

/** Picks `count` entries spread evenly across an ascending list (repeating when short). */
function spread<T>(sorted: T[], count: number): T[] {
  if (sorted.length === 0) return [];
  return Array.from({ length: count }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / Math.max(1, count - 1))]);
}

function cssColor(value: string): string | undefined {
  const alias = /^\{([A-Za-z0-9_.-]+)\}$/.exec(value)?.[1];
  if (alias) return `var(--${cssName(alias)})`;
  return isPlainColor(value) ? value : undefined;
}

const cssName = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, '-');

export function fromClaudeDesignSystem(input: FromClaudeDesignSystemInput): OpenDesignDesignSystemFiles {
  const notes: string[] = [];
  const t = input.tokensJson ?? {};
  const themes = t.color?.themes?.length ? t.color.themes : [{ id: 'light', name: 'Light' }];
  const first = themes[0].id;
  const root = new Map<string, string>();
  const themed = new Map<string, Map<string, string>>();
  const set = (name: string, value: string): void => {
    if (isSafeCssValue(value)) root.set(cssName(name), value);
    else notes.push(`${name}: value rejected as unsafe CSS.`);
  };

  // Colours, as named in Claude, per theme.
  const colorNames: string[] = [];
  const firstValues = new Map<string, string>();
  for (const token of t.color?.tokens ?? []) {
    const values = typeof token.value === 'string' ? { [first]: token.value } : token.value;
    const base = values[first] ?? Object.values(values)[0];
    const css = base !== undefined ? cssColor(base) : undefined;
    if (!css) {
      notes.push(`Colour ${token.name}: ${String(base)} skipped (not a colour value Open Design can use).`);
      continue;
    }
    set(token.name, css);
    colorNames.push(token.name);
    firstValues.set(token.name, base!);
    for (const theme of themes.slice(1)) {
      const v = values[theme.id];
      const themedCss = v !== undefined ? cssColor(v) : undefined;
      if (themedCss && themedCss !== css) {
        if (!themed.has(theme.id)) themed.set(theme.id, new Map());
        themed.get(theme.id)!.set(cssName(token.name), themedCss);
      }
    }
  }

  // Bind the contract's colour slots to the closest-named Claude tokens.
  const bound = new Set<string>();
  const slotNotes: string[] = [];
  for (const [slot, patterns] of COLOR_SLOTS) {
    if (root.has(slot)) {
      bound.add(slot);
      continue;
    }
    let match = patterns.map((p) => colorNames.find((n) => !bound.has(n) && p.test(n.toLowerCase()))).find(Boolean);
    // Brand-named accents ("ember", "acme-500"): the system's own name, else its most chromatic plain colour.
    if (!match && slot === 'accent') {
      const own = input.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0];
      match = colorNames.find((n) => own !== undefined && n.toLowerCase() === own) ?? mostChromatic(colorNames.filter((n) => !bound.has(n) && !TINT_NAME.test(n)), firstValues);
    }
    const accent = /^var\(--(.+)\)$/.exec(root.get('accent') ?? '')?.[1];
    if (!match && slot === 'accent-on' && accent) match = colorNames.find((n) => [`on-${accent}`, `${accent}-on`, `on${accent}`].includes(n.toLowerCase()));
    // Claude systems often call the page colour `surface`; then the canvas is that surface.
    if (!match && slot === 'bg' && root.has('surface')) match = 'surface';
    if (match) {
      root.set(slot, `var(--${cssName(match)})`);
      bound.add(match);
      slotNotes.push(`--${slot} ← ${match}`);
    } else if (['bg', 'surface', 'fg', 'muted', 'border', 'accent'].includes(slot)) {
      notes.push(`No Claude colour matched --${slot}; Open Design will guess it from DESIGN.md.`);
    }
  }
  if (!root.has('surface') && root.has('bg')) root.set('surface', 'var(--bg)');

  // Fonts.
  const fam = t.type?.families ?? {};
  const famKey = (re: RegExp): string | undefined => Object.keys(fam).find((k) => re.test(k.toLowerCase()));
  const bodyKey = famKey(/^body$/) ?? famKey(/body|sans|text|base|ui/) ?? Object.keys(fam)[0];
  const displayKey = famKey(/^display$/) ?? famKey(/display|heading|headline|title|serif/) ?? bodyKey;
  const monoKey = famKey(/mono|code/);
  for (const [k, v] of Object.entries(fam)) set(`font-${k}`, v);
  if (bodyKey && !root.has('font-body')) root.set('font-body', `var(--font-${cssName(bodyKey)})`);
  if (displayKey && !root.has('font-display')) root.set('font-display', `var(--font-${cssName(displayKey)})`);
  if (monoKey && !root.has('font-mono')) root.set('font-mono', `var(--font-${cssName(monoKey)})`);
  if (!bodyKey) notes.push('No font families: Open Design will guess fonts from DESIGN.md.');

  // Type scale → text-xs … text-4xl.
  const styles = (t.type?.groups ?? []).flatMap((g) => g.styles ?? []);
  const steps = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const named = styles.filter((s) => /^text-/.test(s.name));
  if (named.length) for (const s of named) set(s.name, s.fontSize);
  else {
    const bySize = [...new Map(styles.filter((s) => toPx(s.fontSize) !== undefined).map((s) => [toPx(s.fontSize)!, s])).values()].sort(
      (a, b) => toPx(a.fontSize)! - toPx(b.fontSize)!,
    );
    // Anchor text-base on the body style, then spread the smaller and larger styles around it.
    const bodyAt = Math.max(0, bySize.findIndex((s) => /body|base/i.test(s.name)) >= 0 ? bySize.findIndex((s) => /body|base/i.test(s.name)) : bySize.findIndex((s) => toPx(s.fontSize)! >= 14));
    const body = bySize[bodyAt];
    const below = bySize.slice(0, bodyAt);
    const above = bySize.slice(bodyAt + 1);
    if (body) {
      [...spread(below.length ? below : [body], 2), body, ...spread(above.length ? above : [body], 5)].forEach((s, i) => set(`text-${steps[i]}`, s.fontSize));
    }
    if (bySize.length) slotNotes.push(`type scale ← ${bySize.length} Claude text styles`);
    else notes.push('No text styles: the type scale is missing.');
  }
  const metrics = new Map(((t[TYPE_METRICS_FAMILY] as { tokens?: ClaudeToken[] } | undefined)?.tokens ?? []).map((m) => [m.name, String(m.value)]));
  const ratio = (s: ClaudeTypeStyle | undefined): string | undefined => {
    if (!s || s.lineHeight === undefined) return undefined;
    const lh = s.lineHeight;
    if (typeof lh === 'number' || /^[\d.]+$/.test(String(lh))) return String(lh);
    const px = toPx(String(lh));
    const fs = toPx(s.fontSize);
    return px && fs ? (px / fs).toFixed(2).replace(/\.?0+$/, '') : undefined;
  };
  const sortedStyles = [...styles].sort((a, b) => (toPx(a.fontSize) ?? 0) - (toPx(b.fontSize) ?? 0));
  const bodyStyle = styles.find((s) => /body|base/i.test(s.name)) ?? sortedStyles[Math.floor(sortedStyles.length / 3)];
  const bigStyle = sortedStyles[sortedStyles.length - 1];
  set('leading-body', metrics.get('leading-body') ?? ratio(bodyStyle) ?? '1.5');
  set('leading-tight', metrics.get('leading-tight') ?? ratio(bigStyle) ?? '1.15');
  set('tracking-display', metrics.get('tracking-display') ?? bigStyle?.letterSpacing ?? '0');
  for (const [k, v] of metrics) if (!root.has(k)) set(k, v);

  // Spacing, radius, shadow and any other list-shaped family.
  const familyTokens = (key: string): ClaudeToken[] => ((t[key] as { tokens?: ClaudeToken[] } | undefined)?.tokens ?? []);
  const fill = (key: string, contract: Array<[string, number]>): void => {
    const list = familyTokens(key).filter((tok) => typeof tok.value === 'string');
    for (const tok of list) set(tok.name, tok.value as string);
    const lengths = list.filter((tok) => toPx(tok.value as string) !== undefined).sort((a, b) => toPx(a.value as string)! - toPx(b.value as string)!);
    for (const [slot, target] of contract) {
      if (root.has(slot) || lengths.length === 0) continue;
      const nearest = lengths.reduce((best, tok) => (Math.abs(toPx(tok.value as string)! - target) < Math.abs(toPx(best.value as string)! - target) ? tok : best));
      root.set(slot, `var(--${cssName(nearest.name)})`);
    }
  };
  fill('spacing', [['space-1', 4], ['space-2', 8], ['space-3', 12], ['space-4', 16], ['space-5', 20], ['space-6', 24], ['space-8', 32], ['space-12', 48]]);
  fill('radius', [['radius-sm', 4], ['radius-md', 8], ['radius-lg', 16], ['radius-pill', 9999]]);
  for (const tok of familyTokens('shadow')) {
    const v = typeof tok.value === 'string' ? tok.value : tok.value[first] ?? Object.values(tok.value)[0];
    if (v) set(tok.name, v);
  }
  const firstShadow = familyTokens('shadow')[0];
  if (!root.has('elev-raised') && firstShadow) root.set('elev-raised', `var(--${cssName(firstShadow.name)})`);
  const defaults: Array<[string, string]> = [
    ['section-y-desktop', '96px'], ['section-y-tablet', '64px'], ['section-y-phone', '48px'],
    ['container-max', '1200px'], ['container-gutter-desktop', '32px'], ['container-gutter-tablet', '24px'], ['container-gutter-phone', '16px'],
  ];
  const defaulted = defaults.filter(([k]) => !root.has(k));
  for (const [k, v] of defaulted) root.set(k, v);
  if (defaulted.length) notes.push(`Layout tokens defaulted (Claude has no equivalent): ${defaulted.map(([k]) => `--${k}`).join(', ')}.`);
  for (const key of Object.keys(t)) {
    if (['name', 'version', 'meta', 'color', 'type', 'spacing', 'radius', 'shadow', TYPE_METRICS_FAMILY].includes(key)) continue;
    const list = familyTokens(key);
    if (list.length) notes.push(`Family "${key}" (${list.length} tokens) not carried: no Open Design slot.`);
  }

  const lines = (m: Map<string, string>): string => [...m].map(([k, v]) => `  --${k}: ${v};`).join('\n');
  const source = t.meta?.source === 'open-design' ? `round-tripped from Open Design (${String(t.meta.id ?? 'unknown')})` : 'imported from Claude Design';
  let tokensCss = `/* ${input.title} — ${source}.\n * Generated by Open Design's one-off Claude Design import; edit freely.\n */\n\n:root {\n${lines(root)}\n}\n`;
  for (const [id, m] of themed) tokensCss += `\n[data-theme="${id}"] {\n${lines(m)}\n}\n`;

  return { designMd: designMdFrom(input.title, input.readme ?? '', slotNotes, notes), tokensCss, notes };
}

/** Claude's README minus the sections the page generates, shaped for Open Design's `# Name` + blockquote parser. */
function designMdFrom(title: string, readme: string, mapping: string[], notes: string[]): string {
  let text = readme.replace(/\r\n/g, '\n');
  // Drop the page-generated tail (`---` then "Consuming this system" / "Index") and our own export note.
  text = text.replace(/\n-{3,}\s*\n+## (Consuming this system|Index)[\s\S]*$/, '\n');
  text = text.replace(/\n## Not synced from Open Design\n[\s\S]*?(?=\n## |\s*$)/, '\n');
  text = text.trim();
  const lines = text.split('\n');
  const headingAt = lines.findIndex((l) => l.trim() !== '');
  const hasHeading = headingAt >= 0 && /^#\s/.test(lines[headingAt]);
  const afterHeading = lines.slice(hasHeading ? headingAt + 1 : 0);
  const firstBody = afterHeading.findIndex((l) => l.trim() !== '');
  const hasQuote = firstBody >= 0 && afterHeading[firstBody].trim().startsWith('>');
  let out: string;
  if (hasHeading && hasQuote) out = text;
  // Our own exports drop the title (Claude's brand-book rule) but keep the summary quote.
  else if (hasQuote) out = `# ${title}\n\n> Category: Imported from Claude Design\n${text}`;
  else {
    const para = afterHeading.join('\n').split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#')) ?? '';
    const summary = (/^[^.!?]*[.!?]/.exec(para.replace(/\s+/g, ' '))?.[0] ?? para.replace(/\s+/g, ' ')).slice(0, 240);
    const heading = hasHeading ? lines[headingAt] : `# ${title}`;
    const rest = afterHeading.join('\n').trim();
    out = `${heading}\n\n> Category: Imported from Claude Design\n${summary ? `> ${summary}\n` : ''}\n${rest}`.trimEnd();
  }
  const report = [...mapping.map((m) => `- Mapped ${m}`), ...notes.map((n) => `- ${n}`)];
  return `${out}\n\n## Imported from Claude Design\n\n${report.length ? report.join('\n') : '- Tokens carried across by name.'}\n`;
}

/** The README's Charts section: the derived chart colours with values (openspec add-chart-tokens). */
function chartReadmeSection(base: ReadonlyMap<string, string>): string {
  const full = withChartVocabulary(new Map([...base].map(([k, v]) => [`--${k}`, v])));
  const rows = CHART_VOCABULARY_NAMES.filter((n) => full.has(n)).map((n) => `| \`${n}\` | \`${full.get(n)}\` |`);
  if (rows.length === 0) return '';
  return `\n\n## Charts\n\nChart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.\n\n| Token | Value |\n| --- | --- |\n${rows.join('\n')}`;
}

/** The README's Motion section: core motion tokens and the derived vocabulary, with values (openspec add-motion-vocabulary). */
function motionReadmeSection(base: ReadonlyMap<string, string>): string {
  const full = withMotionVocabulary(new Map([...base].filter(([k]) => /^(motion|ease)-/.test(k)).map(([k, v]) => [`--${k}`, v])));
  const rows = [...MOTION_CORE_NAMES, ...MOTION_VOCABULARY_NAMES]
    .filter((n) => full.has(n))
    .map((n) => `| \`${n}\` | ${n === '--ease-spring' && full.get(n)!.startsWith('linear(') ? 'a `linear()` spring' : `\`${full.get(n)}\``} |`);
  if (rows.length === 0) return '';
  return `\n\n## Motion\n\nDurations and easings for this system. Use these for every transition, animation delay and easing; don't invent others.\n\n| Token | Value |\n| --- | --- |\n${rows.join('\n')}`;
}
