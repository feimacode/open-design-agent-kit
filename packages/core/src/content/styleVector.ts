// A design system's look as numbers (openspec add-nearest-design-system):
// about twenty features read from tokens.css (colour, type, space, shape,
// motion), normalised over the bundled set, so any two systems, or an
// extraction's draft, can be compared and the difference said in plain words.

import { parseColor } from '../generation/colorMix';
import { resolveTokenValue } from '../generation/designSystemTokens';

export const STYLE_VECTOR_VERSION = 1;

/** Fewer shared features than this and a comparison says too little. */
export const MIN_FEATURES = 8;

interface Feature {
  id: string;
  axis: 'colour' | 'type' | 'space' | 'shape' | 'motion';
  /** Plain words for "the other one has more of this" and "less of this". */
  more: string;
  less: string;
  /** Plain words for a value far above or below the bundled set's middle. */
  high: string;
  low: string;
  /** Circular features (hue) compare on the circle. */
  circular?: boolean;
}

export const FEATURES: Feature[] = [
  { id: 'bgLightness', axis: 'colour', more: 'lighter background', less: 'darker background', high: 'a very light background', low: 'a dark background' },
  { id: 'textContrast', axis: 'colour', more: 'more text contrast', less: 'softer text contrast', high: 'very high text contrast', low: 'soft, low-contrast text' },
  { id: 'surfaceStep', axis: 'colour', more: 'cards further from the background', less: 'cards closer to the background', high: 'cards that stand well apart from the page', low: 'cards barely distinct from the page' },
  { id: 'accentChroma', axis: 'colour', more: 'a more colourful accent', less: 'a quieter accent', high: 'a vivid accent', low: 'a near-neutral accent' },
  { id: 'accentLightness', axis: 'colour', more: 'a lighter accent', less: 'a darker accent', high: 'a light accent', low: 'a deep, dark accent' },
  { id: 'accentHue', axis: 'colour', more: 'a different accent hue', less: 'a different accent hue', high: 'an unusual accent hue', low: 'an unusual accent hue', circular: true },
  { id: 'displaySerif', axis: 'type', more: 'serif headings', less: 'sans-serif headings', high: 'serif headings', low: 'sans-serif headings' },
  { id: 'displayMono', axis: 'type', more: 'monospaced headings', less: 'non-monospaced headings', high: 'monospaced headings', low: 'non-monospaced headings' },
  { id: 'bodySerif', axis: 'type', more: 'serif body text', less: 'sans-serif body text', high: 'serif body text', low: 'sans-serif body text' },
  { id: 'textBase', axis: 'type', more: 'larger body text', less: 'smaller body text', high: 'large body text', low: 'small body text' },
  { id: 'typeRatio', axis: 'type', more: 'bigger headlines relative to body', less: 'flatter type scale', high: 'very large headlines', low: 'a flat type scale' },
  { id: 'displayTracking', axis: 'type', more: 'looser heading letter spacing', less: 'tighter heading letter spacing', high: 'loosely spaced headings', low: 'tightly spaced headings' },
  { id: 'leadingBody', axis: 'type', more: 'more open line spacing', less: 'denser line spacing', high: 'airy line spacing', low: 'dense line spacing' },
  { id: 'radiusSm', axis: 'shape', more: 'rounder buttons', less: 'squarer buttons', high: 'very round buttons', low: 'square buttons' },
  { id: 'radiusMd', axis: 'shape', more: 'rounder cards', less: 'squarer cards', high: 'very round cards', low: 'square cards' },
  { id: 'shadow', axis: 'shape', more: 'raised, shadowed surfaces', less: 'flat surfaces', high: 'shadowed surfaces', low: 'flat surfaces' },
  { id: 'spaceUnit', axis: 'space', more: 'roomier spacing', less: 'tighter spacing', high: 'generous spacing', low: 'tight spacing' },
  { id: 'sectionY', axis: 'space', more: 'taller sections', less: 'shorter sections', high: 'tall, airy sections', low: 'compact sections' },
  { id: 'containerMax', axis: 'space', more: 'a wider page', less: 'a narrower page', high: 'a wide page', low: 'a narrow page' },
  { id: 'motionFast', axis: 'motion', more: 'slower interactions', less: 'snappier interactions', high: 'slow, deliberate motion', low: 'snappy motion' },
  { id: 'motionBase', axis: 'motion', more: 'slower transitions', less: 'quicker transitions', high: 'long transitions', low: 'quick transitions' },
];

export interface StyleVector {
  version: number;
  /** Raw feature values in FEATURES order; null where the token is missing. */
  raw: Array<number | null>;
}

const SERIF_HINT = /serif|georgia|times|garamond|playfair|fraunces|merriweather|lora|baskerville|caslon|didot|bodoni|crimson|libre|source serif|dm serif|instrument serif|newsreader|spectral|cormorant|tiempos|canela|editorial/i;

function firstFamily(stack: string | undefined): string | undefined {
  return stack?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || undefined;
}
const isSerif = (stack: string | undefined): number | null => {
  const f = firstFamily(stack)?.toLowerCase();
  if (!f) return null;
  return SERIF_HINT.test(f) && !/sans/.test(f) ? 1 : 0;
};
const isMono = (stack: string | undefined): number | null => {
  const f = firstFamily(stack)?.toLowerCase();
  if (!f) return null;
  return /mono|courier|code|terminal|pixel/.test(f) ? 1 : 0;
};

function px(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*(-?[\d.]+)\s*(px|rem|em)?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}
function ms(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(v);
  return m ? (m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1])) : null;
}
function em(v: string | undefined, size: number | null): number | null {
  if (!v) return null;
  if (v.trim() === '0' || v.trim() === 'normal') return 0;
  const m = /^\s*(-?[\d.]+)\s*(em|px)?\s*$/.exec(v);
  if (!m) return null;
  return m[2] === 'px' ? (size ? Number(m[1]) / size : null) : Number(m[1]);
}

/** OKLab lightness, chroma and hue of a CSS colour. */
function oklch(v: string | undefined): { l: number; c: number; h: number } | null {
  if (!v) return null;
  const rgba = parseColor(v);
  if (!rgba) return null;
  const lin = [rgba.r, rgba.g, rgba.b].map((x) => {
    const s = Math.max(0, Math.min(1, x));
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** The raw style vector of a token map (tokens.css parsed, or an extraction's draft). */
export function styleVector(tokens: Map<string, string> | Record<string, string>): StyleVector {
  const map = tokens instanceof Map ? tokens : new Map(Object.entries(tokens));
  const get = (n: string) => resolveTokenValue(map, n)?.trim() || undefined;
  const bg = oklch(get('--bg'));
  const fg = oklch(get('--fg'));
  const surface = oklch(get('--surface'));
  const accent = oklch(get('--accent'));
  const base = px(get('--text-base'));
  const top = px(get('--text-4xl')) ?? px(get('--text-3xl'));
  const shadow = get('--elev-raised');
  const values: Record<string, number | null> = {
    bgLightness: bg ? bg.l : null,
    textContrast: bg && fg ? Math.abs(bg.l - fg.l) : null,
    surfaceStep: bg && surface ? Math.abs(bg.l - surface.l) : null,
    accentChroma: accent ? accent.c : null,
    accentLightness: accent ? accent.l : null,
    // Hue only means something for a coloured accent.
    accentHue: accent && accent.c > 0.04 ? accent.h : null,
    displaySerif: isSerif(get('--font-display')),
    displayMono: isMono(get('--font-display')),
    bodySerif: isSerif(get('--font-body')),
    textBase: base,
    typeRatio: base && top ? top / base : null,
    displayTracking: em(get('--tracking-display'), top),
    leadingBody: (() => {
      const v = get('--leading-body');
      if (!v) return null;
      const n = Number(v);
      if (isFinite(n)) return n;
      const p = px(v);
      return p !== null && base ? p / base : null;
    })(),
    radiusSm: (() => {
      const r = px(get('--radius-sm'));
      return r === null ? null : Math.min(r, 40);
    })(),
    radiusMd: (() => {
      const r = px(get('--radius-md'));
      return r === null ? null : Math.min(r, 48);
    })(),
    shadow: shadow === undefined ? null : shadow === 'none' || shadow === '0' ? 0 : 1,
    spaceUnit: px(get('--space-4')) ?? (px(get('--space-3')) !== null ? (px(get('--space-3')) as number) * (4 / 3) : null),
    sectionY: px(get('--section-y-desktop')),
    containerMax: px(get('--container-max')),
    motionFast: ms(get('--motion-fast')),
    motionBase: ms(get('--motion-base')),
  };
  return { version: STYLE_VECTOR_VERSION, raw: FEATURES.map((f) => (values[f.id] === undefined || values[f.id] === null || !isFinite(values[f.id] as number) ? null : (values[f.id] as number))) };
}

/** Per-feature range over a set (5th to 95th percentile), to normalise against. */
export interface VectorScale {
  version: number;
  lo: number[];
  hi: number[];
  mid: number[];
}

export function vectorScale(vectors: StyleVector[]): VectorScale {
  const lo: number[] = [];
  const hi: number[] = [];
  const mid: number[] = [];
  FEATURES.forEach((f, i) => {
    const xs = vectors.map((v) => v.raw[i]).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const q = (p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))] : 0);
    lo.push(f.circular ? 0 : q(0.05));
    hi.push(f.circular ? 360 : q(0.95));
    mid.push(f.circular ? 180 : q(0.5));
  });
  return { version: STYLE_VECTOR_VERSION, lo, hi, mid };
}

function norm(scale: VectorScale, i: number, x: number): number {
  if (FEATURES[i].circular) return x / 360;
  const span = scale.hi[i] - scale.lo[i];
  return span <= 0 ? 0.5 : Math.max(0, Math.min(1, (x - scale.lo[i]) / span));
}

function featureDiff(scale: VectorScale, i: number, a: number, b: number): number {
  if (FEATURES[i].circular) {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d) / 180;
  }
  return norm(scale, i, b) - norm(scale, i, a);
}

export interface VectorDistance {
  /** Mean absolute normalised difference over the shared features, 0 (same) to 1. */
  distance: number;
  /** How many features both have. */
  compared: number;
  /** Where `b` differs most from `a`, in plain words ("rounder buttons"). */
  differs: string[];
}

/** Distance from `a` to `b`. Throws for vectors of another version, which measure different things. */
export function vectorDistance(a: StyleVector, b: StyleVector, scale: VectorScale): VectorDistance {
  if (a.version !== STYLE_VECTOR_VERSION || b.version !== STYLE_VECTOR_VERSION || scale.version !== STYLE_VECTOR_VERSION) {
    throw new Error(`Style vectors of version ${a.version} and ${b.version} can't be compared (current version ${STYLE_VECTOR_VERSION}).`);
  }
  const diffs: Array<{ i: number; d: number }> = [];
  FEATURES.forEach((_, i) => {
    const x = a.raw[i];
    const y = b.raw[i];
    if (x === null || y === null) return;
    diffs.push({ i, d: featureDiff(scale, i, x, y) });
  });
  const compared = diffs.length;
  const distance = compared === 0 ? 1 : diffs.reduce((s, x) => s + Math.abs(x.d), 0) / compared;
  const differs = diffs
    .filter((x) => Math.abs(x.d) >= 0.2)
    .sort((p, q) => Math.abs(q.d) - Math.abs(p.d))
    .slice(0, 3)
    .map((x) => (x.d > 0 || FEATURES[x.i].circular ? FEATURES[x.i].more : FEATURES[x.i].less));
  return { distance: Math.round(distance * 1000) / 1000, compared, differs: [...new Set(differs)] };
}

/** How many features a vector has. */
export const featureCount = (v: StyleVector): number => v.raw.filter((x) => x !== null).length;

/** The features furthest from the middle of the set, in plain words. */
export function distinctiveFeatures(v: StyleVector, scale: VectorScale, n = 3): string[] {
  return FEATURES.map((f, i) => ({ f, i, x: v.raw[i] }))
    .filter((e): e is { f: Feature; i: number; x: number } => e.x !== null && !e.f.circular)
    .map((e) => ({ ...e, d: norm(scale, e.i, e.x) - norm(scale, e.i, scale.mid[e.i]) }))
    .filter((e) => Math.abs(e.d) >= 0.25)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, n)
    .map((e) => (e.d > 0 ? e.f.high : e.f.low));
}
