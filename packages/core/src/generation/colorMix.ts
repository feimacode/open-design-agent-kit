// Resolves CSS `color-mix()` values to literal sRGB colours, for targets that
// accept only plain colours (Claude Design's tokens.json rejects color-mix()).
// Follows CSS Color 5 mixing: percentages normalised, alpha premultiplied,
// hue interpolated the shorter way in polar spaces, a powerless hue (zero
// chroma) taking the other colour's. Results are clamped to the sRGB gamut.

export interface Rgba {
  /** Gamma-encoded sRGB channels, 0–1 (may stray outside before clamping). */
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const toLinear = (c: number): number => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (Math.abs(c) <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055));

function rgbToOklab({ r, g, b }: Rgba): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb(L: number, A: number, B: number, a: number): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  };
}

const NAMED: Record<string, Rgba> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

/** Function arguments split on spaces/commas, with a `/ alpha` tail. */
function fnArgs(body: string): { parts: string[]; alpha?: string } {
  const [main, alpha] = body.split('/');
  return { parts: main.trim().split(/[\s,]+/).filter(Boolean), alpha: alpha?.trim() };
}

const num = (s: string, percentOf = 1): number => (s === 'none' ? 0 : s.endsWith('%') ? (parseFloat(s) / 100) * percentOf : parseFloat(s));
const hueOf = (s: string): number => (s === 'none' ? 0 : s.endsWith('turn') ? parseFloat(s) * 360 : s.endsWith('rad') ? (parseFloat(s) * 180) / Math.PI : s.endsWith('grad') ? parseFloat(s) * 0.9 : parseFloat(s));

type Vec3 = [number, number, number];
const mul = (m: number[][], v: Vec3): Vec3 => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as Vec3;
const D50_TO_D65 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const XYZ65_TO_LINEAR_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const LINEAR_P3_TO_XYZ65 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];
const LINEAR_REC2020_TO_XYZ65 = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0, 0.028072693049087428, 1.060985057710791],
];

function linearToRgba(lin: Vec3, a: number): Rgba {
  return { r: toGamma(lin[0]), g: toGamma(lin[1]), b: toGamma(lin[2]), a };
}

/** CIE Lab (D50) to sRGB. */
function labToRgb(L: number, A: number, B: number, a: number): Rgba {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const xyz50: Vec3 = [
    (fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * 0.3457 / 0.3585,
    L > k * e ? fy ** 3 : L / k,
    (fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * (1 - 0.3457 - 0.3585) / 0.3585,
  ];
  return linearToRgba(mul(XYZ65_TO_LINEAR_SRGB, mul(D50_TO_D65, xyz50)), a);
}

/** True when a parsed colour lies outside the sRGB gamut (before clamping). */
export function outOfSrgb(c: Rgba): boolean {
  return [c.r, c.g, c.b].some((v) => v < -0.002 || v > 1.002);
}
const alphaOf = (s: string | undefined): number => (s === undefined ? 1 : clamp01(num(s)));

/** Parses a plain colour: hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), color(srgb | srgb-linear | display-p3 | rec2020 | xyz…), black/white/transparent. */
export function parseColor(value: string): Rgba | undefined {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return { ...NAMED[v] };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const ch = [0, 2, 4, 6].map((i) => (i < full.length ? parseInt(full.slice(i, i + 2), 16) / 255 : 1));
    return { r: ch[0], g: ch[1], b: ch[2], a: ch[3] };
  }
  const space = /^color\(\s*([a-z0-9-]+)\s+([^()]*)\)$/.exec(v);
  if (space) {
    const { parts, alpha } = fnArgs(space[2]);
    if (parts.length < 3 || parts.slice(0, 3).some((p) => p !== 'none' && Number.isNaN(parseFloat(p)))) return undefined;
    const c: Vec3 = [num(parts[0]), num(parts[1]), num(parts[2])];
    const a = alphaOf(alpha);
    const decode = (x: Vec3): Vec3 => x.map(toLinear) as Vec3;
    switch (space[1]) {
      case 'srgb':
        return { r: c[0], g: c[1], b: c[2], a };
      case 'srgb-linear':
        return linearToRgba(c, a);
      case 'display-p3':
        return linearToRgba(mul(XYZ65_TO_LINEAR_SRGB, mul(LINEAR_P3_TO_XYZ65, decode(c))), a);
      case 'rec2020': {
        const A = 1.09929682680944;
        const B = 0.018053968510807;
        const lin = c.map((x) => (Math.abs(x) < B * 4.5 ? x / 4.5 : Math.sign(x) * ((Math.abs(x) + A - 1) / A) ** (1 / 0.45))) as Vec3;
        return linearToRgba(mul(XYZ65_TO_LINEAR_SRGB, mul(LINEAR_REC2020_TO_XYZ65, lin)), a);
      }
      case 'xyz':
      case 'xyz-d65':
        return linearToRgba(mul(XYZ65_TO_LINEAR_SRGB, c), a);
      case 'xyz-d50':
        return linearToRgba(mul(XYZ65_TO_LINEAR_SRGB, mul(D50_TO_D65, c)), a);
    }
    return undefined;
  }
  const fn = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(([^()]*)\)$/.exec(v);
  if (!fn) return undefined;
  const { parts, alpha } = fnArgs(fn[2]);
  // Legacy comma syntax carries alpha as a fourth argument.
  const a = alphaOf(alpha ?? parts[3]);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => p !== 'none' && Number.isNaN(parseFloat(p)))) return undefined;
  switch (fn[1]) {
    case 'rgb':
    case 'rgba':
      return { r: num(parts[0], 255) / 255, g: num(parts[1], 255) / 255, b: num(parts[2], 255) / 255, a };
    case 'hsl':
    case 'hsla': {
      const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
      const s = num(parts[1], 100) / 100;
      const l = num(parts[2], 100) / 100;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const hue = (t: number): number => {
        const x = ((t % 1) + 1) % 1;
        return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
      };
      return { r: hue(h + 1 / 3), g: hue(h), b: hue(h - 1 / 3), a };
    }
    case 'hwb': {
      const h = (((hueOf(parts[0]) % 360) + 360) % 360) / 360;
      const w = num(parts[1], 100) / 100;
      const bl = num(parts[2], 100) / 100;
      if (w + bl >= 1) {
        const grey = w / (w + bl);
        return { r: grey, g: grey, b: grey, a };
      }
      const q = 1;
      const p = 0;
      const hue = (t: number): number => {
        const x = ((t % 1) + 1) % 1;
        return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
      };
      const scale = 1 - w - bl;
      return { r: hue(h + 1 / 3) * scale + w, g: hue(h) * scale + w, b: hue(h - 1 / 3) * scale + w, a };
    }
    case 'lab':
      return labToRgb(num(parts[0], 100), num(parts[1], 125), num(parts[2], 125), a);
    case 'lch': {
      const C = num(parts[1], 150);
      const H = (hueOf(parts[2]) * Math.PI) / 180;
      return labToRgb(num(parts[0], 100), C * Math.cos(H), C * Math.sin(H), a);
    }
    case 'oklab':
      return oklabToRgb(num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4), a);
    case 'oklch': {
      const L = num(parts[0]);
      const C = num(parts[1], 0.4);
      const H = (hueOf(parts[2]) * Math.PI) / 180;
      return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), a);
    }
  }
  return undefined;
}

/** Splits on commas that are not inside parentheses. */
function topLevelArgs(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ',' && depth === 0) {
      out.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(body.slice(start).trim());
  return out;
}

/** A colour argument with an optional percentage, in either order. */
function colorStop(arg: string): { color: string; pct?: number } {
  const m = /^(.*?)\s+(-?[\d.]+)%$/.exec(arg) ?? /^(-?[\d.]+)%\s+(.*)$/.exec(arg);
  if (!m) return { color: arg };
  return /%$/.test(arg) ? { color: m[1].trim(), pct: parseFloat(m[2]) } : { color: m[2].trim(), pct: parseFloat(m[1]) };
}

type Lookup = (name: string) => string | undefined;

/** Resolves `var(--x)`, nested `color-mix()` and plain colours to an Rgba. */
function resolveColor(value: string, lookup: Lookup, depth: number): Rgba | undefined {
  if (depth > 16) return undefined;
  const v = value.trim();
  const ref = /^var\(\s*--([a-zA-Z0-9_-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
  if (ref) {
    const target = lookup(ref[1]);
    if (target !== undefined) return resolveColor(target, lookup, depth + 1);
    return ref[2] ? resolveColor(ref[2], lookup, depth + 1) : undefined;
  }
  if (/^color-mix\(/i.test(v)) return mix(v, lookup, depth + 1);
  return parseColor(v);
}

function mix(value: string, lookup: Lookup, depth: number): Rgba | undefined {
  const body = /^color-mix\(([\s\S]*)\)$/i.exec(value.trim())?.[1];
  if (!body) return undefined;
  const args = topLevelArgs(body);
  if (args.length !== 3) return undefined;
  const space = /^in\s+([a-z-]+)(?:\s+(shorter|longer|increasing|decreasing)\s+hue)?$/i.exec(args[0]);
  if (!space) return undefined;
  const method = space[1].toLowerCase();
  if (!['oklab', 'oklch', 'srgb'].includes(method)) return undefined;
  const s1 = colorStop(args[1]);
  const s2 = colorStop(args[2]);
  const c1 = resolveColor(s1.color, lookup, depth);
  const c2 = resolveColor(s2.color, lookup, depth);
  if (!c1 || !c2) return undefined;

  let p1 = s1.pct;
  let p2 = s2.pct;
  if (p1 === undefined && p2 === undefined) [p1, p2] = [50, 50];
  else if (p1 === undefined) p1 = 100 - p2!;
  else if (p2 === undefined) p2 = 100 - p1;
  const sum = p1 + p2!;
  if (sum <= 0) return undefined;
  const alphaScale = sum < 100 ? sum / 100 : 1;
  const t = p2! / sum;

  const a = c1.a * (1 - t) + c2.a * t;
  const coords = (c: Rgba): number[] => {
    if (method === 'srgb') return [c.r, c.g, c.b];
    const lab = rgbToOklab(c);
    if (method === 'oklab') return lab;
    const C = Math.hypot(lab[1], lab[2]);
    return [lab[0], C, C < 1e-4 ? NaN : ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360];
  };
  const x1 = coords(c1);
  const x2 = coords(c2);
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const isHue = method === 'oklch' && i === 2;
    if (isHue) {
      // A powerless hue takes the other colour's, so a mix with grey keeps its hue.
      let h1 = Number.isNaN(x1[2]) ? x2[2] : x1[2];
      let h2 = Number.isNaN(x2[2]) ? x1[2] : x2[2];
      if (Number.isNaN(h1)) {
        out.push(0);
        continue;
      }
      if (h2 - h1 > 180) h1 += 360;
      else if (h2 - h1 < -180) h2 += 360;
      out.push(h1 * (1 - t) + h2 * t);
    } else {
      // Premultiplied: a transparent stop contributes no colour, only alpha.
      const v = a === 0 ? 0 : (x1[i] * c1.a * (1 - t) + x2[i] * c2.a * t) / a;
      out.push(v);
    }
  }
  const alpha = a * alphaScale;
  if (method === 'srgb') return { r: out[0], g: out[1], b: out[2], a: alpha };
  if (method === 'oklab') return oklabToRgb(out[0], out[1], out[2], alpha);
  const H = (out[2] * Math.PI) / 180;
  return oklabToRgb(out[0], out[1] * Math.cos(H), out[1] * Math.sin(H), alpha);
}

/** Serialises an Rgba as `#rrggbb`, or `rgba()` when not opaque. */
export function formatColor(c: Rgba): string {
  const ch = [c.r, c.g, c.b].map((x) => Math.round(clamp01(x) * 255));
  const a = Math.round(clamp01(c.a) * 1000) / 1000;
  if (a >= 1) return `#${ch.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${ch.join(', ')}, ${a})`;
}

/**
 * Resolves a colour value to a literal: `color-mix()`, `var()` and plain
 * colours, looking referenced tokens up (by name without `--`) in `lookup`.
 * Returns undefined when any part can't be resolved.
 */
export function resolveColorValue(value: string, lookup: Lookup): string | undefined {
  const c = resolveColor(value, lookup, 0);
  return c ? formatColor(c) : undefined;
}

/** Replaces every `color-mix()` and colour `var()` inside a composite value (a box-shadow). */
export function resolveColorsIn(value: string, lookup: Lookup): string | undefined {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const rest = value.slice(i);
    const start = /^(color-mix|var)\(/i.exec(rest);
    if (!start) {
      out += value[i++];
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++;
      else if (value[j] === ')' && --depth === 0) break;
    }
    const expr = value.slice(i, j + 1);
    const resolved = resolveColorValue(expr, lookup);
    if (resolved === undefined) {
      // A var() that is not a colour (a length) is resolved as plain text.
      const ref = /^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/.exec(expr)?.[1];
      const text = ref ? lookup(ref) : undefined;
      if (text === undefined || /var\(|color-mix\(/i.test(text)) return undefined;
      out += text;
    } else out += resolved;
    i = j + 1;
  }
  return out;
}

/** WCAG 2 relative luminance of a plain colour, composited over white when translucent. */
export function relativeLuminance(value: string): number | undefined {
  const c = parseColor(value);
  if (!c) return undefined;
  const over = (x: number): number => clamp01(x) * c.a + (1 - c.a);
  return 0.2126 * toLinear(over(c.r)) + 0.7152 * toLinear(over(c.g)) + 0.0722 * toLinear(over(c.b));
}

/** WCAG 2 contrast ratio of two plain colours. */
export function contrastRatio(a: string, b: string): number | undefined {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
