/// <reference lib="dom" />
// Brand findings for designs on the user's own brand (openspec
// connect-brand-design-systems): `brand-off-palette` for a large painted area
// in a colour the brand doesn't have, `brand-font` for text in a family
// outside the brand's stacks, `brand-mark-missing` for a poster, social post
// or deck with no logo, and the `slop-glow` indigo exemption for a brand
// whose accent really is that indigo. Warnings and notes only; `data-od-allow`
// suppresses them like the taste checks.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'puppeteer-core';
import { readBrandRecord } from '../generation/brandKit';
import type { Finding } from '../poster/preflight';

/** Painted colours under this share of the page aren't reported. */
export const OFF_PALETTE_MIN_SHARE = 0.01;
/** CIELAB ΔE (1976) within which a colour counts as the brand's, or a tint or shade of it. */
export const OFF_PALETTE_MAX_DELTA_E = 6;

export interface OwnBrandContext {
  id: string;
  /** Colour tokens by name, `#rrggbb`. */
  colors: Array<{ name: string; hex: string }>;
  /** Font families named in the brand's --font-* tokens (fallbacks included), lower case. */
  fonts: string[];
  accent?: string;
  hasLogo: boolean;
}

/** The active own-brand context for a design, or undefined when its design system isn't an own brand. */
export async function loadOwnBrandContext(workspaceRoot: string, outputDir: string, designSystemId: string | undefined): Promise<OwnBrandContext | undefined> {
  if (!designSystemId?.startsWith('user:')) return undefined;
  const dir = path.join(workspaceRoot, outputDir, 'design-systems', designSystemId.slice('user:'.length));
  const brand = await readBrandRecord(dir);
  if (brand?.kind !== 'own') return undefined;
  const css = await fs.readFile(path.join(dir, 'tokens.css'), 'utf8').catch(() => '');
  const { colors, fonts } = brandTokensFromCss(css);
  const assets = await fs.readdir(path.join(dir, 'assets')).catch(() => [] as string[]);
  return {
    id: designSystemId,
    colors,
    fonts,
    accent: colors.find((c) => c.name === '--accent')?.hex,
    hasLogo: (brand.marks ?? []).some((m) => m.role.startsWith('logo')) || assets.some((f) => /logo/i.test(f)),
  };
}

const HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i;
const RGB = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i;

function toHex(value: string): string | undefined {
  const h = HEX.exec(value);
  if (h) {
    const v = h[1].toLowerCase();
    return v.length === 3 ? `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}` : `#${v}`;
  }
  const m = RGB.exec(value);
  if (!m) return undefined;
  return `#${[m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('')}`;
}

/** Colour and font tokens declared anywhere in a tokens.css (light and dark blocks alike). */
export function brandTokensFromCss(css: string): { colors: Array<{ name: string; hex: string }>; fonts: string[] } {
  const colors: Array<{ name: string; hex: string }> = [];
  const fonts = new Set<string>();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    const [, name, value] = m;
    if (name.startsWith('--font')) {
      for (const f of value.split(',')) {
        const family = f.trim().replace(/^["']|["']$/g, '').toLowerCase();
        if (family) fonts.add(family);
      }
      continue;
    }
    // A value that is one colour (not a shadow or a gradient with several).
    const hex = toHex(value);
    if (hex && !/gradient|\d+px/.test(value) && !colors.some((c) => c.name === name && c.hex === hex)) colors.push({ name, hex });
  }
  return { colors, fonts: [...fonts] };
}

interface BrandPageOptions {
  colors: Array<{ name: string; hex: string }>;
  fonts: string[];
  minShare: number;
  maxDeltaE: number;
  checkLogo: boolean;
}

/** In-page: off-palette areas, off-brand fonts and whether a logo is shown. Self-contained, for page.evaluate. */
export function collectBrandFindings(opts: BrandPageOptions): Array<{ check: string; severity: 'warning' | 'info'; message: string; selector?: string }> {
  const out: Array<{ check: string; severity: 'warning' | 'info'; message: string; selector?: string }> = [];
  const allowed = (el: Element | null, code: string): boolean => {
    for (let e = el; e; e = e.parentElement) {
      const v = e.getAttribute('data-od-allow');
      if (v && v.split(/\s+/).includes(code)) return true;
    }
    return false;
  };
  const describe = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const cls = Array.from(el.classList).slice(0, 2);
    return el.tagName.toLowerCase() + cls.map((c) => `.${c}`).join('');
  };
  const lab = (rgb: number[]): number[] => {
    const lin = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const parse = (c: string): { rgb: number[]; a: number } | undefined => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return undefined;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const hexRgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // The brand's colours, with tints towards white and shades towards black, in Lab.
  const palette: Array<{ name: string; hex: string; lab: number[] }> = [];
  for (const c of opts.colors) {
    const rgb = hexRgb(c.hex);
    for (let t = 0; t <= 1.0001; t += 0.05) {
      palette.push({ name: c.name, hex: c.hex, lab: lab(rgb.map((v) => v + (255 - v) * t)) });
      palette.push({ name: c.name, hex: c.hex, lab: lab(rgb.map((v) => v * (1 - t))) });
    }
  }
  const nearest = (rgb: number[]): { name: string; hex: string; d: number } => {
    const l = lab(rgb);
    let best = { name: '', hex: '', d: Infinity };
    for (const p of palette) {
      const d = Math.hypot(l[0] - p.lab[0], l[1] - p.lab[1], l[2] - p.lab[2]);
      if (d < best.d) best = { name: p.name, hex: p.hex, d };
    }
    return best;
  };
  const hex = (rgb: number[]): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const doc = document;
  const pageArea = Math.max(1, doc.documentElement.scrollWidth * Math.max(doc.documentElement.scrollHeight, innerHeight));
  const media = 'img, video, canvas, svg, picture, iframe';

  if (palette.length > 0) {
    const areas = new Map<string, { area: number; el: Element; elArea: number; rgb: number[] }>();
    const els = Array.from(doc.body.querySelectorAll('*')).slice(0, 4000);
    for (const el of els) {
      if (el.closest(media)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.1 || /url\(/.test(s.backgroundImage)) continue;
      const bg = parse(s.backgroundColor);
      if (!bg || bg.a < 0.5) continue;
      const r = el.getBoundingClientRect();
      const a = r.width * r.height;
      if (a <= 0) continue;
      const key = hex(bg.rgb);
      const cur = areas.get(key);
      if (cur) {
        cur.area += a;
        if (a > cur.elArea) Object.assign(cur, { el, elArea: a });
      } else areas.set(key, { area: a, el, elArea: a, rgb: bg.rgb });
    }
    const off = [...areas.entries()]
      .filter(([, v]) => v.area / pageArea >= opts.minShare && !allowed(v.el, 'brand-off-palette'))
      .map(([key, v]) => ({ key, ...v, near: nearest(v.rgb) }))
      .filter((v) => v.near.d > opts.maxDeltaE)
      .sort((a, b) => b.area - a.area)
      .slice(0, 3);
    for (const v of off) {
      out.push({
        check: 'brand-off-palette',
        severity: 'warning',
        message: `${describe(v.el)} is filled with ${v.key}, which isn't one of the brand's colours (${Math.round((v.area / pageArea) * 100)}% of the page). The nearest is ${v.near.name} (${v.near.hex}). Use a brand token, or mark it data-od-allow="brand-off-palette" if it's deliberate.`,
        selector: describe(v.el),
      });
    }
  }

  if (opts.fonts.length > 0) {
    const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'emoji', 'math']);
    const fonts = new Set(opts.fonts);
    const byFamily = new Map<string, { count: number; el: Element }>();
    for (const el of Array.from(doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, a, button, label, td, th, blockquote, figcaption')).slice(0, 2000)) {
      if (!(el.textContent ?? '').trim() || el.closest('code, pre, kbd, samp') || allowed(el, 'brand-font')) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const family = s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (!family || fonts.has(family) || generic.has(family)) continue;
      const cur = byFamily.get(family);
      if (cur) cur.count++;
      else byFamily.set(family, { count: 1, el });
    }
    for (const [family, v] of [...byFamily].sort((a, b) => b[1].count - a[1].count).slice(0, 2)) {
      out.push({
        check: 'brand-font',
        severity: 'warning',
        message: `${v.count} text element${v.count > 1 ? 's are' : ' is'} set in ${family}, which isn't in the brand's fonts (${opts.fonts.slice(0, 4).join(', ')}). Use var(--font-body) or var(--font-display).`,
        selector: describe(v.el),
      });
    }
  }

  if (opts.checkLogo && !allowed(doc.documentElement, 'brand-mark-missing')) {
    const hasLogo = Array.from(doc.querySelectorAll('img, svg, [data-od-logo], [class*="logo" i], [id*="logo" i]')).some((el) => {
      if (el.hasAttribute('data-od-logo')) return true;
      const text = `${el.getAttribute('src') ?? ''} ${el.getAttribute('alt') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.id} ${el.getAttribute('class') ?? ''}`;
      return /logo|brand|wordmark/i.test(text);
    });
    if (!hasLogo) {
      out.push({
        check: 'brand-mark-missing',
        severity: 'info',
        message: "This design shows no logo, and the brand has one in its design system's assets. Add it (an <img> of the logo file, or mark your own with data-od-logo), or mark <html> data-od-allow=\"brand-mark-missing\" if it's left out on purpose.",
      });
    }
  }
  return out;
}

/** Runs the brand pass on the open page and adjusts the other findings for the brand (the indigo exemption). */
export async function applyBrandChecks(page: Page, brand: OwnBrandContext, findings: Finding[], mode: 'page' | 'cards' | 'deck'): Promise<Finding[]> {
  // Posters, social posts and decks (card and slide designs) carry the logo; pages may not need one on every screen.
  const checkLogo = brand.hasLogo && mode !== 'page';
  const extra = (await page
    .evaluate(collectBrandFindings, { colors: brand.colors, fonts: brand.fonts, minShare: OFF_PALETTE_MIN_SHARE, maxDeltaE: OFF_PALETTE_MAX_DELTA_E, checkLogo })
    .catch(() => [])) as Finding[];
  // The brand's own accent isn't a "default AI" indigo.
  const accent = brand.accent?.toLowerCase();
  const kept = accent ? findings.filter((f) => !(f.check === 'slop-glow' && f.message.toLowerCase().includes(accent))) : findings;
  return [...kept, ...extra];
}
