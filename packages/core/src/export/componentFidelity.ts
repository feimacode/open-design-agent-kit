/// <reference lib="dom" />
// Component replicas in the design-system review (openspec
// add-component-restyle-review). Each captured component (buttons, badge,
// input, card, nav) is rebuilt as a plain element whose every measured
// property is snapped to the nearest token in the design system's tokens.css;
// a property no token family covers takes a neutral value and is reported as
// unmapped. Checking the review diffs each button and badge replica against
// the site's crop, pixel by pixel, and restores one token family at a time to
// say which family costs the most.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import type { Page } from 'puppeteer-core';
import type { BrandComponents, ComponentSpec } from '../generation/brandKit';
import type { Finding } from '../poster/preflight';

export const FIDELITY_THRESHOLD = 90;
export const COMPONENT_FAMILIES = ['colour', 'radius', 'spacing', 'type', 'shadow', 'border'] as const;
export type ComponentFamily = (typeof COMPONENT_FAMILIES)[number];

const LABELS: Record<string, string> = {
  'button-primary': 'Primary button',
  'button-secondary': 'Secondary button',
  'button-ghost': 'Ghost button',
  badge: 'Badge',
  input: 'Input',
  card: 'Card',
  nav: 'Navigation',
};

/** The components to rebuild, in band order. Buttons and the badge are scored; the input, card and nav hold content the spec doesn't capture, so they are shown only. */
export function replicaSpecs(components: BrandComponents | undefined): Array<{ key: string; label: string; scored: boolean; spec: ComponentSpec }> {
  if (!components) return [];
  const out: Array<{ key: string; label: string; scored: boolean; spec: ComponentSpec }> = [];
  for (const k of ['primary', 'secondary', 'ghost'] as const) {
    const spec = components.button?.[k];
    if (spec) out.push({ key: `button-${k}`, label: LABELS[`button-${k}`], scored: true, spec });
  }
  if (components.badge) out.push({ key: 'badge', label: LABELS.badge, scored: true, spec: components.badge });
  for (const k of ['input', 'card', 'nav'] as const) if (components[k]) out.push({ key: k, label: LABELS[k], scored: false, spec: components[k]! });
  return out;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The Components band for review.html: each crop beside its replica, plus the specs and the script that builds the replicas from tokens.css. */
export function renderComponentBand(components: BrandComponents | undefined, cropBase: string): string {
  const specs = replicaSpecs(components);
  if (specs.length === 0) return '';
  const rows = specs
    .map(({ key, label, spec }) => {
      const crop = spec.crop ? `<img src="${esc(path.posix.join(cropBase, spec.crop))}" alt="${esc(label)} on the site">` : '<span class="none">No crop</span>';
      const size = spec.width && spec.height ? ` style="width:${spec.width}px;height:${Math.min(spec.height, 600)}px"` : '';
      return `<figure class="od-component" data-od-component-key="${key}">
      <figcaption>${esc(label)} <span data-od-replica-note="${key}"></span></figcaption>
      <div class="od-pair"><div class="od-crop">${crop}</div><div class="od-replica-cell" data-od-replica-cell="${key}"${size}><span data-od-replica="${key}">${esc(spec.label ?? label)}</span></div></div>
    </figure>`;
    })
    .join('\n    ');
  const json = JSON.stringify(specs).replace(/</g, '\\u003c');
  return `<section class="od-components">
    <h2 class="label">Components: the site's (left) and rebuilt from the tokens (right)</h2>
    ${rows}
  </section>
  <script type="application/json" id="od-components">${json}</script>
  <script>(${applyComponentReplicas.toString()})({});</script>`;
}

export const COMPONENT_BAND_CSS = `
  .od-components { grid-column: 1 / -1; display: grid; gap: 16px; }
  .od-component { margin: 0; }
  .od-component figcaption { font: 13px/1.4 system-ui, sans-serif; color: #444; margin-bottom: 6px; }
  .od-component figcaption span { color: #777; }
  .od-pair { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
  .od-crop img { display: block; max-width: 600px; }
  .od-replica-cell { position: relative; overflow: hidden; background: var(--bg, #fff); }
  [data-od-replica] { position: absolute; left: 0; top: 0; box-sizing: border-box; border-style: solid; white-space: nowrap; }`;

export interface ReplicaInfo {
  key: string;
  label: string;
  scored: boolean;
  /** Families with no token for a measured property, and what was measured. */
  unmapped: string[];
  /** Per family: the site's values and the tokens' values, for messages. */
  values: Partial<Record<ComponentFamily, { site: string; tokens: string }>>;
}

/**
 * In-page: builds (or rebuilds) every replica from the specs in #od-components,
 * snapping each measured property to the nearest token; families listed in
 * `restore[key]` use the site's measured values instead. Self-contained, for
 * page.evaluate and for review.html's own script.
 */
export function applyComponentReplicas(restore: Record<string, string[]>): ReplicaInfo[] {
  const data = document.getElementById('od-components');
  if (!data) return [];
  const specs = JSON.parse(data.textContent || '[]') as Array<{ key: string; label: string; scored: boolean; spec: Record<string, unknown> }>;
  const root = getComputedStyle(document.documentElement);
  const rootPx = parseFloat(root.fontSize) || 16;
  const raw = (name: string): string => root.getPropertyValue(name).trim();
  const lengthPx = (v: string): number | undefined => {
    const n = parseFloat(v);
    if (!isFinite(n)) return undefined;
    return /rem$/.test(v) ? n * rootPx : n;
  };
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgbOf = (v: string): number[] | undefined => {
    if (!ctx || !v) return undefined;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = v;
    if (String(ctx.fillStyle) === '#010203' && v.toLowerCase() !== '#010203') return undefined;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return d[3] < 128 ? undefined : [d[0], d[1], d[2]];
  };
  const oklab = (c: number[]): number[] => {
    const [r, g, b] = c.map((n) => {
      const v = n / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const hex = (c: number[]): string => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
  const COLOURS = ['--accent', '--accent-on', '--accent-hover', '--accent-light', '--bg', '--surface', '--surface-warm', '--fg', '--fg-2', '--muted', '--meta', '--border', '--border-soft', '--success', '--warn', '--danger'];
  const SPACE = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7', '--space-8', '--space-12', '--space-16', '--space-18', '--space-20', '--space-22'];
  const RADIUS = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill'];
  const TEXT = ['--text-xs', '--text-sm', '--text-base', '--text-md', '--text-lg', '--text-xl', '--text-2xl', '--text-3xl', '--text-4xl'];
  const ELEV = ['--elev-raised', '--elev-ring', '--elev-ring-accent'];
  const scale = (names: string[]) =>
    names.map((n) => ({ name: n, px: lengthPx(raw(n)) })).filter((t): t is { name: string; px: number } => t.px !== undefined);
  const nearest = (list: Array<{ name: string; px: number }>, value: number) =>
    list.length === 0 ? undefined : list.reduce((best, t) => (Math.abs(t.px - value) < Math.abs(best.px - value) ? t : best));
  const colourTokens = COLOURS.map((n) => ({ name: n, rgb: rgbOf(raw(n)) })).filter((t): t is { name: string; rgb: number[] } => !!t.rgb);
  const nearestColour = (value: string) => {
    const c = rgbOf(value);
    if (!c || colourTokens.length === 0) return undefined;
    const p = oklab(c);
    let best = colourTokens[0];
    let bestD = Infinity;
    for (const t of colourTokens) {
      const q = oklab(t.rgb);
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  };
  const first = (stack: string): string => stack.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const space = scale(SPACE);
  const radii = scale(RADIUS);
  const text = scale(TEXT);
  const out: ReplicaInfo[] = [];

  for (const { key, label, scored, spec } of specs) {
    const el = document.querySelector(`[data-od-replica="${key}"]`) as HTMLElement | null;
    if (!el) continue;
    const keep = restore[key] || [];
    const num = (k: string): number | undefined => (typeof spec[k] === 'number' ? (spec[k] as number) : undefined);
    const str = (k: string): string | undefined => (typeof spec[k] === 'string' ? (spec[k] as string) : undefined);
    const unmapped: string[] = [];
    const values: ReplicaInfo['values'] = {};
    const st = el.style;

    // Colour: background, text and border colours.
    const colourOf = (v: string | undefined) => {
      if (!v) return { css: 'transparent', name: 'none' };
      const t = nearestColour(v);
      return t ? { css: `var(${t.name})`, name: `${t.name} ${hex(t.rgb)}` } : { css: v, name: v };
    };
    const bg = str('background');
    const fg = str('color');
    const bc = str('borderColor');
    const tb = colourOf(bg);
    const tf = colourOf(fg);
    const tc = colourOf(bc);
    const site = keep.indexOf('colour') >= 0;
    st.background = site ? bg || 'transparent' : tb.css;
    st.color = site ? fg || 'inherit' : tf.css;
    st.borderColor = site ? bc || 'transparent' : bc ? tc.css : 'transparent';
    values.colour = { site: [bg, fg, bc].filter(Boolean).join(' / '), tokens: [bg ? tb.name : '', fg ? tf.name : '', bc ? tc.name : ''].filter(Boolean).join(' / ') };

    // Radius.
    const r = num('radius') || 0;
    const tr = r >= 999 ? radii.find((t) => t.name === '--radius-pill') || nearest(radii, r) : nearest(radii, r);
    st.borderRadius = keep.indexOf('radius') >= 0 ? `${r}px` : r === 0 ? '0' : tr ? `var(${tr.name})` : '0';
    if (r > 0 && !tr) unmapped.push(`radius ${r}px (no --radius-* token)`);
    values.radius = { site: `${r >= 999 ? 'pill' : `${r}px`}`, tokens: r === 0 ? '0' : tr ? `${tr.name} ${tr.px >= 999 ? 'pill' : `${tr.px}px`}` : '0 (no token)' };

    // Spacing: padding.
    const py = num('paddingY') || 0;
    const px = num('paddingX') || 0;
    const sy = nearest(space, py);
    const sx = nearest(space, px);
    st.padding = keep.indexOf('spacing') >= 0 ? `${py}px ${px}px` : `${py ? (sy ? `var(${sy.name})` : '0') : '0'} ${px ? (sx ? `var(${sx.name})` : '0') : '0'}`;
    values.spacing = { site: `${py}px ${px}px`, tokens: `${py ? (sy ? `${sy.px}px` : '0') : '0'} ${px ? (sx ? `${sx.px}px` : '0') : '0'}${sy || sx ? ` (${[sy?.name, sx?.name].filter(Boolean).join(', ')})` : ''}` };
    if ((py || px) && space.length === 0) unmapped.push('padding (no --space-* tokens)');

    // Type: size, weight, family, tracking.
    const size = num('fontSize') || 16;
    const ts = nearest(text, size);
    const weight = num('fontWeight') || 400;
    const neutralWeight = weight >= 550 ? 700 : 400;
    const family = str('fontFamily') || '';
    const display = raw('--font-display');
    const familyToken = display && first(display) === first(family) ? '--font-display' : '--font-body';
    const tracking = num('letterSpacing') || 0;
    const typeSite = keep.indexOf('type') >= 0;
    st.fontSize = typeSite ? `${size}px` : ts ? `var(${ts.name})` : `${size}px`;
    st.fontWeight = String(typeSite ? weight : neutralWeight);
    st.fontFamily = typeSite ? family || 'inherit' : `var(${familyToken}, inherit)`;
    st.letterSpacing = typeSite ? `${tracking}px` : 'normal';
    const transform = str('textTransform');
    st.textTransform = transform || 'none';
    if (weight !== neutralWeight) unmapped.push(`font weight ${weight} (no weight token; the replica uses ${neutralWeight})`);
    if (tracking) unmapped.push(`letter spacing ${tracking}px (no token for component tracking)`);
    values.type = { site: `${size}px ${weight} ${first(family) || 'inherit'}${tracking ? ` ${tracking}px tracking` : ''}`, tokens: `${ts ? `${ts.px}px (${ts.name})` : `${size}px`} ${neutralWeight} ${first(raw(familyToken)) || 'inherit'} (${familyToken})` };

    // Shadow.
    const shadow = str('shadow');
    const elev = ELEV.find((n) => raw(n) && raw(n) !== 'none');
    st.boxShadow = keep.indexOf('shadow') >= 0 ? shadow || 'none' : shadow ? (elev ? `var(${elev})` : 'none') : 'none';
    if (shadow && !elev) unmapped.push('shadow (no --elev-* token)');
    values.shadow = { site: shadow || 'none', tokens: shadow ? (elev ? `${elev} ${raw(elev)}` : 'none (no --elev-* token)') : 'none' };

    // Border width: no token family; the contract's hairline is 1px.
    const bw = num('borderWidth') || 0;
    st.borderWidth = keep.indexOf('border') >= 0 ? `${bw}px` : bw ? '1px' : '0';
    if (bw > 1) unmapped.push(`border width ${bw}px (the contract's hairline is 1px)`);
    values.border = { site: `${bw}px`, tokens: bw ? '1px' : '0' };

    // The site's line box, so the height follows the padding as on the site.
    const height = num('height');
    if (height) st.lineHeight = `${Math.max(1, height - 2 * py - 2 * bw)}px`;
    const note = document.querySelector(`[data-od-replica-note="${key}"]`);
    if (note) note.textContent = unmapped.length ? `· no token for: ${unmapped.join('; ')}` : '';
    out.push({ key, label, scored, unmapped, values });
  }
  return out;
}

/** Share (0–100) of the crop's pixels the replica matches: CIE76 under 10, anti-aliasing tolerant (a 1 px neighbour may match). */
export function pixelFidelity(a: PNG, b: PNG): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (w === 0 || h === 0) return 0;
  const lab = (png: PNG, x: number, y: number): number[] => {
    const i = (y * png.width + x) * 4;
    const lin = [png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const cache = (png: PNG) => {
    const out: number[][] = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = lab(png, x, y);
    return out;
  };
  const la = cache(a);
  const lb = cache(b);
  const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  let ok = 0;
  // Outside a 1px frame, a pixel also matches a neighbour, which absorbs anti-aliasing and half-pixel text shifts.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = la[y * w + x];
      if (d(p, lb[y * w + x]) < 10) {
        ok++;
        continue;
      }
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (d(p, lb[ny * w + nx]) < 10) hit = true;
        }
      }
      if (hit) ok++;
    }
  }
  return Math.round((ok / (w * h)) * 1000) / 10;
}

const FAMILY_WORDS: Record<ComponentFamily, string> = { colour: 'colour', radius: 'radius', spacing: 'spacing', type: 'type', shadow: 'shadow', border: 'border' };

/** One component's finding text: "Primary button 81%: spacing. The site pads 14px 28px; nearest tokens give 12px 24px." */
export function fidelityMessage(label: string, fidelity: number, family: ComponentFamily, values: { site: string; tokens: string }): string {
  const site = family === 'spacing' ? `pads ${values.site}` : `has ${values.site}`;
  return `${label} ${Math.round(fidelity)}%: ${FAMILY_WORDS[family]}. The site ${site}; nearest tokens give ${values.tokens}. Rebuilt from tokens.css only, the ${label.toLowerCase()} doesn't look like the site's.`;
}

/** The components pass for a review page: fidelity, the family that costs the most, and unmapped properties as notes. */
export async function componentFidelityFindings(page: Page, bundleDir: string, warnings: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const info = (await page.evaluate(applyComponentReplicas, {})) as ReplicaInfo[];
  if (info.length === 0) return findings;
  const specs = (await page.evaluate(() => JSON.parse(document.getElementById('od-components')?.textContent || '[]'))) as Array<{ key: string; spec: ComponentSpec }>;
  const shot = async (key: string): Promise<PNG | undefined> => {
    const cell = await page.$(`[data-od-replica-cell="${key}"]`);
    if (!cell) return undefined;
    const buf = (await cell.screenshot({ type: 'png' })) as Uint8Array;
    return PNG.sync.read(Buffer.from(buf));
  };
  for (const r of info) {
    if (r.unmapped.length > 0) findings.push({ check: 'brand-fidelity', severity: 'info', message: `${r.label}: no token for ${r.unmapped.join('; ')}. Add a token, or say it in DESIGN.md.`, selector: `[data-od-replica="${r.key}"]` });
    if (!r.scored) continue;
    const spec = specs.find((s) => s.key === r.key)?.spec;
    if (!spec?.crop) continue;
    let crop: PNG;
    try {
      crop = PNG.sync.read(await fs.readFile(path.join(bundleDir, spec.crop)));
    } catch {
      warnings.push(`${r.label}: its crop ${spec.crop} couldn't be read, so its fidelity wasn't measured.`);
      continue;
    }
    const base = await shot(r.key);
    if (!base) continue;
    const fidelity = pixelFidelity(crop, base);
    if (fidelity >= FIDELITY_THRESHOLD) continue;
    let best: { family: ComponentFamily; gain: number } | undefined;
    for (const family of COMPONENT_FAMILIES) {
      await page.evaluate(applyComponentReplicas, { [r.key]: [family] });
      const restored = await shot(r.key);
      const gain = restored ? pixelFidelity(crop, restored) - fidelity : 0;
      if (gain > 0 && (!best || gain > best.gain)) best = { family, gain };
    }
    await page.evaluate(applyComponentReplicas, {});
    const family = best?.family;
    findings.push({
      check: 'brand-fidelity',
      severity: 'warning',
      message: family ? fidelityMessage(r.label, fidelity, family, r.values[family]!) : `${r.label} ${Math.round(fidelity)}%: no single token family explains it (the site's font may not be loaded here). Compare the crops in review.html.`,
      selector: `[data-od-replica="${r.key}"]`,
    });
  }
  return findings;
}
