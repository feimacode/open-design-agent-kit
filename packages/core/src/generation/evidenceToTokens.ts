// Turns what siteExtraction.ts measured on a rendered page into a draft
// token set on the Open Design token contract (openspec
// add-design-system-from-url). Deterministic and pure: the same evidence
// always gives the same draft, so the model doesn't re-guess roles. Every
// value is measured; a contract token with no measurement is left out (its
// contract fallback applies) and listed as unmeasured.
//
// Role sampling and forced hover/active states follow the approach of
// arvindrk/extract-design-system and open-design's brand-extract skill
// (both MIT); the code here is our own.

import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { deltaE2000, outOfSrgb, parseColor as parseCssColor } from './colorMix';
import { observedMotionTokens, type MotionObservation } from './motionCapture';

/** One sampled element for a colour role. */
export interface RoleSample {
  /** Computed CSS colour as the browser reports it (`rgb(…)` / `rgba(…)`). */
  value: string;
  /** A selector that finds the element the value came from. */
  selector: string;
  /** How many sampled elements share the value. */
  count: number;
  /** The role's crop under the evidence bundle, relative to it. */
  crop?: string;
}

export type ColorRole =
  | 'bg'
  | 'surface'
  | 'fg'
  | 'fg-2'
  | 'muted'
  | 'meta'
  | 'border'
  | 'border-soft'
  | 'accent'
  | 'accent-on'
  | 'accent-hover'
  | 'accent-active'
  | 'success'
  | 'warn'
  | 'danger';

export interface TextRoleSample {
  role: 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'small' | 'caption' | 'button' | 'nav' | 'code';
  selector: string;
  fontFamily: string;
  /** px */
  fontSize: number;
  /** px, or undefined for `normal` */
  lineHeight?: number;
  fontWeight: number;
  /** px */
  letterSpacing?: number;
}

export interface LoadedFont {
  family: string;
  weight: string;
  style: string;
  /** The `src` of the matching @font-face rule, when the stylesheet was readable. */
  source?: string;
}

export interface PageEvidence {
  url: string;
  /** Colours the page wrote in a modern format (oklch(), lab(), color(display-p3 …)), by the rgb() value they were read as. */
  colorOriginals?: Record<string, string>;
  /** The page's colour roles; a role nothing matched is absent. */
  roles: Partial<Record<ColorRole, RoleSample>>;
  textRoles: TextRoleSample[];
  fonts: LoadedFont[];
  /** Declared custom properties: `:root` and theme-scoped (`[data-theme=dark]`, `.dark`, `@media (prefers-color-scheme: dark)`). */
  customProperties: { root: Record<string, string>; themes: Record<string, Record<string, string>> };
  /** Distinct non-zero border radii in px with how many elements use each; ≥ 999 counts as pill. `featured` is a large container or hero media. */
  radii: Array<{ px: number; count: number; kind: 'button' | 'input' | 'card' | 'featured' | 'other'; selector?: string; crop?: string }>;
  /** Padding/gap values snapped to 2px, with counts. */
  spacing: Array<{ px: number; count: number }>;
  /** px */
  containerMax?: number;
  /** Transition durations in ms, and easing functions, with counts. */
  transitions: { durations: Array<{ ms: number; count: number }>; easings: Array<{ value: string; count: number }> };
  /** The card shadow, when cards have one. */
  cardShadow?: string;
  /** The primary control's keyboard focus ring with :focus-visible forced, as a box-shadow value. */
  focusRing?: string;
  /** Gradients painted by the primary control, the hero or the main surface. */
  gradients?: Array<{ role: 'accent' | 'hero' | 'surface'; value: string }>;
  /** What paints behind the hero, when there is one. */
  hero?: { background: 'gradient' | 'image' | 'video'; value?: string };
  /** Container gutter and section padding (px) at the desktop and phone widths. */
  layout?: { desktop?: LayoutSample; phone?: LayoutSample };
  /** Overlays (consent banners, chat launchers) hidden before measuring, by selector. */
  hiddenOverlays?: string[];
  /** This page's dark-theme roles, when the site has a dark theme. */
  dark?: SiteEvidence['dark'];
  /** The colours that competed for the accent, best first (at most 4), with crops of their best controls. */
  accentCandidates?: AccentCandidate[];
  /** How clearly the accent won, 0–1, from the gap between the top two candidates. */
  accentConfidence?: number;
  /** Animations seen running on this page during load, hover, focus and scroll (the first page only). */
  motion?: MotionObservation;
}

export interface AccentCandidate {
  /** Computed colour (`rgb(…)`); a hex in the draft's sources. */
  value: string;
  score: number;
  /** OKLCH chroma. */
  chroma: number;
  /** Filled controls painted this colour. */
  controls: number;
  /** Text links in this colour. */
  links: number;
  /** A `:root` custom property named for brand, primary or accent with this value. */
  declared?: string;
  /** The inline SVG logo's main colour is this one. */
  logo?: boolean;
  selector?: string;
  crop?: string;
}

export interface LayoutSample {
  /** The main container's inline padding. */
  gutter?: number;
  /** The most common vertical padding of top-level sections. */
  sectionY?: number;
}

export interface SiteEvidence {
  pages: PageEvidence[];
  /** Dark-theme colour roles, only when the site has a dark theme. */
  dark?: { trigger: 'prefers-color-scheme' | 'toggle'; roles: Partial<Record<ColorRole, RoleSample>> };
}

/** How widely a drafted value is used: on 80% of pages or more, 40% or more, or fewer. */
export type TokenScope = 'site-wide' | 'section' | 'page-local';

export function scopeOf(pages: number, of: number): TokenScope {
  return pages / of >= 0.8 ? 'site-wide' : pages / of >= 0.4 ? 'section' : 'page-local';
}

export interface Consistency {
  /** Share (0–1) of measured values that fall on drafted tokens, per kind. */
  colours?: number;
  radii?: number;
  fonts?: number;
  spacing?: number;
  /** Values used on one page only that no token holds. */
  outliers: Array<{ kind: 'colour' | 'radius' | 'font'; value: string; token?: string; page: string; selector?: string; crop?: string }>;
}

export interface DraftTokens {
  /** Contract name → value, `:root` set. */
  tokens: Record<string, string>;
  /** `[data-theme="dark"]` overrides, only when a dark theme was measured. */
  dark?: Record<string, string>;
  /** Contract tokens with no measurement (left to the contract fallback). */
  unmeasured: string[];
  /** Token → where its value came from (selector and crop), and the site's own custom property with the same value. */
  sources: Record<string, { selector: string; crop?: string; page: string; declared?: string; confidence?: 'measured' | 'declared' | 'stated' | 'sampled'; source?: string; note?: string; original?: string; choiceConfidence?: number; candidates?: Array<Omit<AccentCandidate, 'value'> & { hex: string }>; coverage?: { pages: number; of: number }; scope?: TokenScope; basis?: 'observed' | 'declared' }>;
  /** Values other pages (or their dark themes) gave for a drafted token; the draft keeps the first page's. */
  conflicts: Array<{ token: string; value: string; page: string; selector: string; crop?: string; theme?: 'dark'; confidence?: 'measured' | 'declared' | 'stated' | 'sampled'; coverage?: { pages: number; of: number } }>;
  /** With more than one page: how much of what was measured falls on the drafted tokens, and the one-page outliers. */
  consistency?: Consistency;
  /** Things the model should know when writing DESIGN.md (full gradients, an input radius that differs). */
  notes: string[];
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/**
 * A computed colour as `#rrggbb`, or `#rrggbbaa` when translucent;
 * undefined for fully transparent or unparseable values.
 */
export function cssColorToHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (!m) {
    // oklch(), oklab(), lab(), lch(), hwb(), hsl(), color(display-p3 …): what Chrome reports for colours written that way.
    const c = parseCssColor(v);
    if (!c || c.a === 0) return undefined;
    const ch = (n: number): string => hex2(Math.round(Math.min(1, Math.max(0, n)) * 255));
    const base = `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
    return c.a < 1 ? `${base}${hex2(c.a * 255)}` : base;
  }
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  if (alpha === 0) return undefined;
  const base = `#${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}`;
  return alpha < 1 ? `${base}${hex2(alpha * 255)}` : base;
}

const round = (n: number, places = 2): number => Math.round(n * 10 ** places) / 10 ** places;

/** `"Nunito", Arial, sans-serif` with the first loaded family moved to the front. */
function fontStack(declared: string, loaded: LoadedFont[]): string {
  const families = declared.split(',').map((f) => f.trim()).filter(Boolean);
  const unquote = (f: string): string => f.replace(/^["']|["']$/g, '').toLowerCase();
  const loadedNames = new Set(loaded.map((f) => unquote(f.family)));
  const i = families.findIndex((f) => loadedNames.has(unquote(f)));
  const ordered = i > 0 ? [families[i], ...families.slice(0, i), ...families.slice(i + 1)] : families;
  return ordered.map((f) => (/^["']/.test(f) || !/\s/.test(f) || /^(ui-|system-ui)/.test(f) ? f : `"${f}"`)).join(', ');
}

const TEXT_ABOVE_BASE = ['--text-lg', '--text-xl', '--text-2xl', '--text-3xl', '--text-4xl'];
const TEXT_BELOW_BASE = ['--text-sm', '--text-xs'];
const SPACE_STEPS = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-12'];

/**
 * Text sizes onto `--text-xs … --text-4xl`, anchored on body as
 * `--text-base`: sizes above it fill from `--text-4xl` down (the largest is
 * always the top step), sizes below it from `--text-sm` down.
 */
export function mapTypeScale(bodyPx: number, sizes: number[]): Record<string, string> {
  const out: Record<string, string> = { '--text-base': `${round(bodyPx)}px` };
  const distinct = [...new Set(sizes.map((s) => round(s)))];
  const above = distinct.filter((s) => s > bodyPx).sort((a, b) => b - a);
  const below = distinct.filter((s) => s < bodyPx).sort((a, b) => b - a);
  // More sizes than steps: keep the largest, the smallest and an even spread between.
  const pick = (list: number[], n: number): number[] =>
    list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
  const top = pick(above, TEXT_ABOVE_BASE.length);
  top.forEach((px, i) => (out[TEXT_ABOVE_BASE[TEXT_ABOVE_BASE.length - 1 - i]] = `${px}px`));
  pick(below, TEXT_BELOW_BASE.length).forEach((px, i) => (out[TEXT_BELOW_BASE[i]] = `${px}px`));
  return out;
}

function mostCommon<T extends { count: number }>(list: T[]): T | undefined {
  return [...list].sort((a, b) => b.count - a.count)[0];
}

function mergeCounts<K extends string | number>(lists: Array<Array<{ count: number } & Record<string, unknown>>>, key: string): Array<{ key: K; count: number }> {
  const tally = new Map<K, number>();
  for (const list of lists) for (const item of list) tally.set(item[key] as K, (tally.get(item[key] as K) ?? 0) + item.count);
  return [...tally].map(([k, count]) => ({ key: k, count }));
}

function colorTokens(roles: Partial<Record<ColorRole, RoleSample>>, page: string, sources?: DraftTokens['sources'], originals?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, sample] of Object.entries(roles) as Array<[ColorRole, RoleSample]>) {
    const hex = cssColorToHex(sample.value);
    if (!hex) continue;
    out[`--${role}`] = hex;
    if (sources) {
      sources[`--${role}`] = { selector: sample.selector, crop: sample.crop, page };
      // Wider than sRGB: keep what the site wrote, since the hex is its clipped version.
      const original = originals?.[sample.value] ?? (/^rgba?\(/.test(sample.value) ? undefined : sample.value);
      const parsed = original ? parseCssColor(original) : undefined;
      if (original && parsed && outOfSrgb(parsed)) {
        sources[`--${role}`].original = original;
        sources[`--${role}`].note = `the site writes ${original}, wider than sRGB; ${hex} is its sRGB clip`;
      }
    }
  }
  // A hover or active state that doesn't change the colour isn't a measurement of a distinct state.
  for (const state of ['--accent-hover', '--accent-active']) if (out[state] && out[state] === out['--accent']) delete out[state];
  return out;
}

export function evidenceToTokens(evidence: SiteEvidence): DraftTokens {
  const tokens: Record<string, string> = {};
  const sources: DraftTokens['sources'] = {};
  const conflicts: DraftTokens['conflicts'] = [];
  const notes: string[] = [];
  const [first] = evidence.pages;
  if (!first) return { tokens, unmeasured: TOKEN_SCHEMA.map((t) => t.name), sources, conflicts, notes };

  // Colours elected by coverage (add-coverage-voting): each role takes the
  // value most pages use, counting colours within ΔE 3 as one and drafting the
  // most-used exact value; a tie goes to the earlier page (the URL the person
  // gave comes first). Other values are listed as conflicts with their coverage.
  const n = evidence.pages.length;
  const perPage = evidence.pages.map((page) => {
    const pageSources: DraftTokens['sources'] = {};
    return { page, values: colorTokens(page.roles, page.url, pageSources, page.colorOriginals), sources: pageSources };
  });
  const order: string[] = [];
  for (const p of perPage) for (const name of Object.keys(p.values)) if (!order.includes(name)) order.push(name);
  for (const name of order) {
    const clusters: Array<Array<{ index: number; hex: string }>> = [];
    perPage.forEach((p, index) => {
      const hex = p.values[name];
      if (hex === undefined) return;
      const cluster = clusters.find((c) => deltaE2000(c[0].hex, hex) < 3);
      if (cluster) cluster.push({ index, hex });
      else clusters.push([{ index, hex }]);
    });
    clusters.sort((a, b) => b.length - a.length || a[0].index - b[0].index);
    const exact = (c: Array<{ index: number; hex: string }>) => {
      const counts = new Map<string, number>();
      for (const m of c) counts.set(m.hex, (counts.get(m.hex) ?? 0) + 1);
      return [...counts].sort((x, y) => y[1] - x[1] || c.findIndex((m) => m.hex === x[0]) - c.findIndex((m) => m.hex === y[0]))[0][0];
    };
    const [won, ...lost] = clusters;
    const hex = exact(won);
    const at = won.find((m) => m.hex === hex)!;
    tokens[name] = hex;
    sources[name] = perPage[at.index].sources[name];
    if (n > 1) {
      sources[name].coverage = { pages: won.length, of: n };
      sources[name].scope = scopeOf(won.length, n);
    }
    for (const c of lost) {
      const value = exact(c);
      const m = c.find((x) => x.hex === value)!;
      const src = perPage[m.index].sources[name];
      conflicts.push({ token: name, value, page: perPage[m.index].page.url, selector: src.selector, crop: src.crop, ...(n > 1 ? { coverage: { pages: c.length, of: n } } : {}) });
    }
    const home = clusters.find((c) => c.some((m) => m.index === 0));
    if (home && home !== won) notes.push(`${name}: the first page uses ${exact(home)}, but ${won.length} of ${n} pages use ${hex}, so the draft takes ${hex}. The first page may be a campaign or a different section.`);
  }
  // How the accent was chosen: the page it came from ranked its candidates.
  const accentPage = sources['--accent'] ? evidence.pages.find((p) => p.url === sources['--accent'].page) : undefined;
  if (accentPage?.accentCandidates?.length) {
    const candidates = accentPage.accentCandidates.flatMap(({ value, ...rest }) => {
      const hex = cssColorToHex(value);
      return hex ? [{ hex, ...rest }] : [];
    });
    sources['--accent'].candidates = candidates;
    if (accentPage.accentConfidence !== undefined) sources['--accent'].choiceConfidence = accentPage.accentConfidence;
    if (accentPage.accentConfidence !== undefined && accentPage.accentConfidence < 0.5 && candidates.length > 1) {
      notes.push(`The accent was a close call (confidence ${accentPage.accentConfidence}): ${candidates.slice(0, 4).map((c) => `${c.hex}${c.declared ? ` (${c.declared})` : ''}${c.crop ? ` ${c.crop}` : ''}`).join(', ')}. Show these to the person and ask which is the brand's.`);
    }
  } else if (accentPage?.accentConfidence !== undefined) sources['--accent'].choiceConfidence = accentPage.accentConfidence;

  const textRoles = evidence.pages.flatMap((p) => p.textRoles);
  const fonts = evidence.pages.flatMap((p) => p.fonts);
  const body = first.textRoles.find((r) => r.role === 'body') ?? textRoles.find((r) => r.role === 'body');
  if (body) {
    tokens['--font-body'] = fontStack(body.fontFamily, fonts);
    sources['--font-body'] = { selector: body.selector, page: first.url };
    const sizes = textRoles.filter((r) => r.role !== 'code').map((r) => r.fontSize);
    Object.assign(tokens, mapTypeScale(body.fontSize, sizes));
    if (body.lineHeight) tokens['--leading-body'] = String(round(body.lineHeight / body.fontSize));
  }
  const h1 = textRoles.find((r) => r.role === 'h1') ?? textRoles.find((r) => r.role === 'h2');
  if (h1) {
    tokens['--font-display'] = fontStack(h1.fontFamily, fonts);
    sources['--font-display'] = { selector: h1.selector, page: first.url };
    if (h1.lineHeight) tokens['--leading-tight'] = String(round(h1.lineHeight / h1.fontSize));
    if (h1.letterSpacing !== undefined) tokens['--tracking-display'] = h1.letterSpacing === 0 ? '0' : `${round(h1.letterSpacing / h1.fontSize, 3)}em`;
  }
  const code = textRoles.find((r) => r.role === 'code');
  if (code) tokens['--font-mono'] = fontStack(code.fontFamily, fonts);

  // Radii, as the contract describes the steps: buttons (else inputs) → sm,
  // cards and modals → md, featured containers and hero media → lg; a ≥ 999px
  // radius is the pill.
  const radii = evidence.pages.flatMap((p) => p.radii);
  const byKind = (kind: string): number | undefined => mostCommon(radii.filter((r) => r.kind === kind && r.px < 999))?.px;
  const pill = radii.find((r) => r.px >= 999);
  if (pill) tokens['--radius-pill'] = '9999px';
  const buttonRadius = byKind('button');
  const inputRadius = byKind('input');
  const small = buttonRadius ?? inputRadius;
  if (small !== undefined) tokens['--radius-sm'] = `${small}px`;
  if (buttonRadius !== undefined && inputRadius !== undefined && inputRadius !== buttonRadius) {
    notes.push(`Inputs use a ${inputRadius}px radius and buttons ${buttonRadius}px; --radius-sm takes the button's. Mention the input radius in DESIGN.md.`);
  }
  for (const [kind, name] of [['card', '--radius-md'], ['featured', '--radius-lg']] as const) {
    const px = byKind(kind);
    if (px !== undefined) tokens[name] = `${px}px`;
  }

  // Spacing: the most used values, each onto the contract step whose default
  // is nearest (12px → --space-3), most used first, one value per step.
  const stepDefaults = SPACE_STEPS.map((name) => [name, Number.parseFloat(TOKEN_SCHEMA.find((t) => t.name === name)?.fallback ?? '')] as const);
  const spacing = mergeCounts<number>(evidence.pages.map((p) => p.spacing), 'px')
    .filter((s) => s.key > 0)
    .sort((a, b) => b.count - a.count || a.key - b.key)
    .slice(0, SPACE_STEPS.length);
  for (const { key: px } of spacing) {
    const free = stepDefaults.filter(([name, d]) => !(name in tokens) && Number.isFinite(d));
    const nearest = free.sort((a, b) => Math.abs(a[1] - px) - Math.abs(b[1] - px))[0];
    if (nearest && Math.abs(nearest[1] - px) <= Math.max(4, nearest[1] * 0.25)) tokens[nearest[0]] = `${px}px`;
  }

  if (first.containerMax) tokens['--container-max'] = `${Math.round(first.containerMax)}px`;
  const ring = first.cardShadow ? parseRingShadow(first.cardShadow) : undefined;
  if (ring) tokens['--elev-ring'] = `0 0 0 1px ${ring}`;
  else if (first.cardShadow) tokens['--elev-raised'] = first.cardShadow;
  const focus = evidence.pages.find((p) => p.focusRing)?.focusRing;
  if (focus) tokens['--focus-ring'] = focus;

  // Gutters and section padding at the two widths the pages were measured at.
  const layoutValue = (width: 'desktop' | 'phone', key: keyof LayoutSample): number | undefined =>
    evidence.pages.map((p) => p.layout?.[width]?.[key]).find((v): v is number => typeof v === 'number' && v > 0);
  for (const [width, gutterName, sectionName] of [
    ['desktop', '--container-gutter-desktop', '--section-y-desktop'],
    ['phone', '--container-gutter-phone', '--section-y-phone'],
  ] as const) {
    const gutter = layoutValue(width, 'gutter');
    if (gutter !== undefined) tokens[gutterName] = `${Math.round(gutter)}px`;
    const sectionY = layoutValue(width, 'sectionY');
    if (sectionY !== undefined) tokens[sectionName] = `${Math.round(sectionY)}px`;
  }

  for (const g of evidence.pages.flatMap((p) => p.gradients ?? [])) {
    notes.push(`The ${g.role === 'accent' ? 'primary button' : g.role === 'hero' ? 'hero' : 'main surface'} paints a gradient: ${g.value}.${g.role === 'accent' ? ' --accent is its first colour stop.' : ''} Describe it in DESIGN.md.`);
  }
  const hero = first.hero;
  if (hero) notes.push(`The hero's background is ${hero.background === 'gradient' ? `a gradient (${hero.value})` : `an ${hero.background}`}.`);

  // Motion from what was seen moving (add-runtime-motion); declared transitions only when nothing moved.
  const observed = observedMotionTokens(evidence.pages.find((p) => p.motion)?.motion);
  const durations = observed ? [] : mergeCounts<number>(evidence.pages.map((p) => p.transitions.durations), 'ms').filter((d) => d.key > 0);
  if (observed) {
    const motionPage = evidence.pages.find((p) => p.motion)!.url;
    if (observed.fast) {
      tokens['--motion-fast'] = observed.fast;
      sources['--motion-fast'] = { selector: observed.fastFrom ?? '', page: motionPage, basis: 'observed' };
    }
    if (observed.base) {
      tokens['--motion-base'] = observed.base;
      sources['--motion-base'] = { selector: observed.baseFrom ?? '', page: motionPage, basis: 'observed' };
    }
    if (observed.ease) {
      tokens['--ease-standard'] = observed.ease;
      sources['--ease-standard'] = { selector: observed.fastFrom ?? observed.baseFrom ?? '', page: motionPage, basis: 'observed' };
    }
  }
  if (durations.length > 0) {
    const sorted = durations.map((d) => d.key).sort((a, b) => a - b);
    tokens['--motion-fast'] = `${sorted[0]}ms`;
    // The base duration is the median of the slower ones, so it always differs from the fast one.
    const slower = sorted.filter((ms) => ms > sorted[0]);
    if (slower.length > 0) tokens['--motion-base'] = `${slower[Math.floor((slower.length - 1) / 2)]}ms`;
  }
  const easing = mostCommon(mergeCounts<string>(evidence.pages.map((p) => p.transitions.easings), 'value'));
  if (easing && durations.length > 0) tokens['--ease-standard'] = easing.key;
  for (const name of ['--motion-fast', '--motion-base', '--ease-standard']) if (tokens[name] && !sources[name]) sources[name] = { selector: '', page: first.url, basis: 'declared' };

  matchDeclaredProperties(evidence.pages, tokens, sources);

  let dark: Record<string, string> | undefined;
  const darkPage = evidence.dark ? first : evidence.pages.find((p) => p.dark);
  const darkEvidence = evidence.dark ?? darkPage?.dark;
  if (darkEvidence && darkPage) {
    const measured = colorTokens(darkEvidence.roles, darkPage.url);
    dark = Object.fromEntries(Object.entries(measured).filter(([name, value]) => tokens[name] !== value));
    if (Object.keys(dark).length === 0) dark = undefined;
    for (const page of evidence.pages) {
      if (page === darkPage || !page.dark) continue;
      const other = colorTokens(page.dark.roles, page.url, {});
      for (const [name, value] of Object.entries(other)) {
        const drafted = dark?.[name] ?? tokens[name];
        if (drafted !== undefined && drafted !== value) conflicts.push({ token: name, value, page: page.url, selector: page.dark.roles[name.slice(2) as ColorRole]?.selector ?? '', theme: 'dark' });
      }
    }
  }

  const consistency = n > 1 ? consistencyOf(evidence.pages, tokens, conflicts) : undefined;
  return { tokens, dark, unmeasured: TOKEN_SCHEMA.map((t) => t.name).filter((n) => !(n in tokens)), sources, conflicts, notes, ...(consistency ? { consistency } : {}) };
}

const share = (on: number, total: number): number | undefined => (total > 0 ? Math.round((on / total) * 100) / 100 : undefined);

/** How much of what the pages use falls on the drafted tokens, and what only one page uses. */
function consistencyOf(pages: PageEvidence[], tokens: Record<string, string>, conflicts: DraftTokens['conflicts']): Consistency {
  const drafted = Object.entries(tokens);
  const colourTokens = drafted.filter(([, v]) => /^#[0-9a-f]{6,8}$/i.test(v)).map(([, v]) => v);
  let colourOn = 0;
  let colourAll = 0;
  for (const page of pages) {
    for (const sample of Object.values(page.roles)) {
      const hex = sample ? cssColorToHex(sample.value) : undefined;
      if (!hex) continue;
      colourAll++;
      if (colourTokens.some((t) => deltaE2000(t, hex) < 3)) colourOn++;
    }
  }
  const radiusTokens = drafted.filter(([k]) => k.startsWith('--radius')).map(([, v]) => parseFloat(v));
  const radii = pages.flatMap((p) => p.radii.map((r) => ({ ...r, page: p.url })));
  const radiusAll = radii.reduce((a, r) => a + r.count, 0);
  const radiusOn = radii.filter((r) => radiusTokens.some((t) => Math.abs(t - r.px) <= 1 || (t >= 999 && r.px >= 999))).reduce((a, r) => a + r.count, 0);
  const first = (stack: string) => stack.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const fontTokens = drafted.filter(([k]) => k.startsWith('--font')).map(([, v]) => first(v));
  const texts = pages.flatMap((p) => p.textRoles.map((t) => ({ ...t, page: p.url })));
  const fontOn = texts.filter((t) => fontTokens.includes(first(t.fontFamily))).length;
  const spaceTokens = drafted.filter(([k]) => k.startsWith('--space')).map(([, v]) => parseFloat(v));
  const spacing = pages.flatMap((p) => p.spacing);
  const spaceAll = spacing.reduce((a, s) => a + s.count, 0);
  const spaceOn = spacing.filter((s) => spaceTokens.some((t) => Math.abs(t - s.px) <= 1)).reduce((a, s) => a + s.count, 0);

  const outliers: Consistency['outliers'] = [];
  for (const c of conflicts) if (c.coverage && c.coverage.pages === 1 && !c.theme) outliers.push({ kind: 'colour', value: c.value, token: c.token, page: c.page, selector: c.selector, crop: c.crop });
  const radiusPages = new Map<number, Set<string>>();
  for (const r of radii) radiusPages.set(r.px, (radiusPages.get(r.px) ?? new Set()).add(r.page));
  for (const [px, on] of radiusPages) {
    if (on.size !== 1 || radiusTokens.some((t) => Math.abs(t - px) <= 1 || (t >= 999 && px >= 999))) continue;
    const r = radii.find((x) => x.px === px)!;
    if (r.kind === 'other') continue;
    outliers.push({ kind: 'radius', value: `${px}px`, page: r.page, selector: r.selector, crop: r.crop });
  }
  const fontPages = new Map<string, Set<string>>();
  for (const t of texts) fontPages.set(first(t.fontFamily), (fontPages.get(first(t.fontFamily)) ?? new Set()).add(t.page));
  for (const [font, on] of fontPages) {
    if (on.size !== 1 || fontTokens.includes(font)) continue;
    const t = texts.find((x) => first(x.fontFamily) === font)!;
    outliers.push({ kind: 'font', value: t.fontFamily.split(',')[0].trim(), page: t.page, selector: t.selector });
  }
  return { colours: share(colourOn, colourAll), radii: share(radiusOn, radiusAll), fonts: share(fontOn, texts.length), spacing: share(spaceOn, spaceAll), outliers };
}

/** `rgb(229, 229, 229) 0px 0px 0px 1px` (a hairline ring) → `#e5e5e5`; anything else → undefined. */
export function parseRingShadow(shadow: string): string | undefined {
  if (shadow.replace(/rgba?\([^)]*\)/g, 'C').includes(',')) return undefined;
  const color = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(shadow)?.[1];
  const lengths = shadow.replace(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi, '').replace(/inset/, '').trim().split(/\s+/).map((v) => parseFloat(v));
  if (!color || lengths.length !== 4 || lengths[0] !== 0 || lengths[1] !== 0 || lengths[2] !== 0 || lengths[3] !== 1) return undefined;
  return cssColorToHex(color);
}

const DECLARED_ROLE_NAMES: Array<[string, RegExp]> = [
  ['--success', /success|positive/],
  ['--danger', /danger|error|destructive|negative/],
  ['--warn', /warn|caution/],
  ['--focus-ring', /focus/],
];

/**
 * The site's own custom properties: name each drafted colour's twin (same
 * value), and fill unmeasured status and focus roles from properties whose
 * names say so, but only when every such property agrees on one value.
 */
function matchDeclaredProperties(pages: PageEvidence[], tokens: Record<string, string>, sources: DraftTokens['sources']): void {
  const declared = new Map<string, { value: string; page: string }>();
  for (const page of pages) {
    for (const [name, value] of Object.entries(page.customProperties.root)) if (!declared.has(name)) declared.set(name, { value, page: page.url });
  }
  const byHex = new Map<string, string>();
  for (const [name, { value }] of declared) {
    const hex = cssColorToHex(value);
    if (hex && !byHex.has(hex)) byHex.set(hex, name);
  }
  for (const [token, value] of Object.entries(tokens)) {
    const twin = byHex.get(value.toLowerCase());
    if (twin && sources[token]) sources[token].declared = twin;
  }
  for (const [token, pattern] of DECLARED_ROLE_NAMES) {
    if (token in tokens) continue;
    const matches = [...declared].filter(([name]) => pattern.test(name.toLowerCase()) && !/(^|-)(bg|background|surface|text|fg|on|border|light|subtle|muted)(-|$)/.test(name.toLowerCase()));
    const hexes = new Map<string, string>();
    for (const [name, { value }] of matches) {
      const hex = cssColorToHex(value);
      if (hex && !hexes.has(hex)) hexes.set(hex, name);
    }
    if (hexes.size !== 1) continue;
    const [[hex, name]] = [...hexes];
    tokens[token] = token === '--focus-ring' ? `0 0 0 2px ${hex}` : hex;
    sources[token] = { selector: `declared ${name}`, page: declared.get(name)!.page, declared: name };
  }
}

/** The draft as a tokens.css text, for the model to start from. */
export function draftTokensCss(draft: DraftTokens, header: string): string {
  // The site's own name for a value, so DESIGN.md can use the brand's vocabulary.
  const named = (k: string): string => {
    const src = draft.sources[k];
    const parts = [src?.declared, src?.original ? `site: ${src.original}` : undefined].filter(Boolean);
    return parts.length ? ` /* ${parts.join('; ').replace(/\*\//g, '* /')} */` : '';
  };
  const lines = (set: Record<string, string>, root = false): string => Object.entries(set).map(([k, v]) => `  ${k}: ${v};${root ? named(k) : ''}`).join('\n');
  let css = `/* ${header.replace(/\*\//g, '* /')} */\n:root {\n${lines(draft.tokens, true)}\n}\n`;
  if (draft.dark) css += `\n[data-theme="dark"] {\n${lines(draft.dark)}\n}\n`;
  return css;
}
