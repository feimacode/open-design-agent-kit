// A screenshot as a design system source (openspec
// add-brand-from-screenshot-or-css): k-means in CIELAB over a downscaled
// image, then roles by fixed rules. Edge-dominant is the background, the
// largest other flat block is the surface, small clusters that read at 4.5:1
// on the background are text, and the most saturated cluster over 0.5% of
// the image is the accent. Busy regions (photos) are skipped. Deterministic,
// no model, cheap enough for the hosted server. PNG only.

import { PNG } from 'pngjs';
import { emptyDraft, type SourceDraft } from './sourceExtraction';

export const SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_WIDTH = 400;
const BLOCK = 8;
const K = 10;

type Lab = [number, number, number];
type Rgb = [number, number, number];

function toLab([r, g, b]: Rgb): Lab {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dist = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luminance = ([r, g, b]: Rgb) => {
  const l = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export interface PaletteCluster {
  rgb: Rgb;
  lab: Lab;
  /** Share of the counted (non-photo) pixels. */
  share: number;
  /** Share of the edge band. */
  edgeShare: number;
  chroma: number;
  /** Bounding box of its densest blocks, in source-image pixels. */
  box?: { x: number; y: number; width: number; height: number };
}

export interface ScreenshotPalette {
  width: number;
  height: number;
  clusters: PaletteCluster[];
  roles: Partial<Record<'--bg' | '--surface' | '--fg' | '--muted' | '--accent', PaletteCluster>>;
  /** Share of the image skipped as photo. */
  photoShare: number;
}

/** The palette and roles of a PNG screenshot. Pure. */
export function screenshotPalette(png: Buffer): ScreenshotPalette {
  const img = PNG.sync.read(png);
  const scale = Math.min(1, MAX_WIDTH / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const px: Rgb[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const sy = Math.min(img.height - 1, Math.floor(y / scale));
      const i = (sy * img.width + sx) * 4;
      const a = img.data[i + 3] / 255;
      // Transparent pixels read as white, as a browser shows them.
      px[y * w + x] = [img.data[i] * a + 255 * (1 - a), img.data[i + 1] * a + 255 * (1 - a), img.data[i + 2] * a + 255 * (1 - a)];
    }
  }
  // Photo regions: blocks with many distinct quantised colours.
  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const photo = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const seen = new Set<number>();
      for (let y = by * BLOCK; y < Math.min(h, (by + 1) * BLOCK); y++) for (let x = bx * BLOCK; x < Math.min(w, (bx + 1) * BLOCK); x++) {
        const [r, g, b] = px[y * w + x];
        seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      }
      photo[by * bw + bx] = seen.size > 14 ? 1 : 0;
    }
  }
  // A busy block surrounded by busy blocks is photo; isolated ones (text, icons) stay.
  const isPhoto = (bx: number, by: number) => {
    if (!photo[by * bw + bx]) return false;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx;
      const y = by + dy;
      if (x >= 0 && y >= 0 && x < bw && y < bh && photo[y * bw + x]) n++;
    }
    return n >= 6;
  };
  const counted: number[] = [];
  let skipped = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isPhoto(Math.floor(x / BLOCK), Math.floor(y / BLOCK))) skipped++;
    else counted.push(y * w + x);
  }
  const labs: Lab[] = px.map(toLab);

  // Initial centroids: the most common quantised colours, at least ΔE 12 apart (deterministic).
  const hist = new Map<number, { n: number; idx: number }>();
  for (const i of counted) {
    const [r, g, b] = px[i];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cur = hist.get(key);
    if (cur) cur.n++;
    else hist.set(key, { n: 1, idx: i });
  }
  const centroids: Lab[] = [];
  for (const { idx } of [...hist.values()].sort((a, b) => b.n - a.n)) {
    const lab = labs[idx];
    if (centroids.every((c) => dist(c, lab) > 12)) centroids.push(lab);
    if (centroids.length >= K) break;
  }
  const assign = new Int16Array(px.length).fill(-1);
  for (let iter = 0; iter < 8 && centroids.length > 0; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (const i of counted) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = dist(labs[i], centroids[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += labs[i][0];
      s[1] += labs[i][1];
      s[2] += labs[i][2];
      s[3]++;
    }
    for (let c = 0; c < centroids.length; c++) if (sums[c][3] > 0) centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
  }
  // Each cluster's colour is its most common actual pixel (exact brand values survive), its shares and its densest region.
  const edge = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const clusters: PaletteCluster[] = centroids.map((_, c) => {
    const tally = new Map<string, { n: number; rgb: Rgb }>();
    let n = 0;
    let edgeN = 0;
    let edgeAll = 0;
    const blocks = new Map<number, number>();
    for (const i of counted) {
      const x = i % w;
      const y = Math.floor(i / w);
      const onEdge = x < edge || y < edge || x >= w - edge || y >= h - edge;
      if (onEdge) edgeAll++;
      if (assign[i] !== c) continue;
      n++;
      if (onEdge) edgeN++;
      const rgb = px[i].map((v) => Math.round(v)) as Rgb;
      const k = rgb.join(',');
      const cur = tally.get(k);
      if (cur) cur.n++;
      else tally.set(k, { n: 1, rgb });
      const b = Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK);
      blocks.set(b, (blocks.get(b) ?? 0) + 1);
    }
    const rgb = [...tally.values()].sort((a, b) => b.n - a.n)[0]?.rgb ?? [0, 0, 0];
    const lab = toLab(rgb);
    // The densest block and its dense neighbours, as a crop box.
    let box: PaletteCluster['box'];
    const dense = [...blocks].filter(([, v]) => v >= BLOCK * BLOCK * 0.3);
    if (dense.length > 0) {
      const [seed] = dense.sort((a, b) => b[1] - a[1])[0];
      const set = new Set(dense.map(([b]) => b));
      const stack = [seed];
      const region = new Set<number>([seed]);
      while (stack.length && region.size < 400) {
        const b = stack.pop()!;
        for (const nb of [b - 1, b + 1, b - bw, b + bw]) if (set.has(nb) && !region.has(nb) && Math.abs((nb % bw) - (b % bw)) <= 1) {
          region.add(nb);
          stack.push(nb);
        }
      }
      const xs = [...region].map((b) => b % bw);
      const ys = [...region].map((b) => Math.floor(b / bw));
      const x0 = Math.min(...xs) * BLOCK;
      const y0 = Math.min(...ys) * BLOCK;
      const x1 = (Math.max(...xs) + 1) * BLOCK;
      const y1 = (Math.max(...ys) + 1) * BLOCK;
      box = { x: Math.round(x0 / scale), y: Math.round(y0 / scale), width: Math.round(Math.min(w - x0, x1 - x0) / scale), height: Math.round(Math.min(h - y0, y1 - y0) / scale) };
    }
    return { rgb, lab, share: counted.length ? n / counted.length : 0, edgeShare: edgeAll ? edgeN / edgeAll : 0, chroma: Math.hypot(lab[1], lab[2]), box };
  }).filter((c) => c.share > 0);

  const roles: ScreenshotPalette['roles'] = {};
  const bg = [...clusters].sort((a, b) => b.edgeShare - a.edgeShare || b.share - a.share)[0];
  if (bg) roles['--bg'] = bg;
  const rest = clusters.filter((c) => c !== bg);
  const surface = rest.filter((c) => c.share >= 0.03 && c.chroma < 18 && dist(c.lab, bg.lab) > 2.5 && contrast(c.rgb, bg.rgb) < 1.6).sort((a, b) => b.share - a.share)[0];
  if (surface) roles['--surface'] = surface;
  const text = rest.filter((c) => c !== surface && c.chroma < 25 && c.share >= 0.002 && contrast(c.rgb, bg.rgb) >= 4.5).sort((a, b) => contrast(b.rgb, bg.rgb) - contrast(a.rgb, bg.rgb));
  if (text[0]) roles['--fg'] = text[0];
  const muted = rest.filter((c) => c !== surface && c !== text[0] && c.chroma < 25 && c.share >= 0.002 && contrast(c.rgb, bg.rgb) >= 3 && dist(c.lab, (text[0] ?? bg).lab) > 8).sort((a, b) => b.share - a.share)[0];
  if (muted) roles['--muted'] = muted;
  const accent = rest.filter((c) => c.share >= 0.005 && c.chroma >= 30).sort((a, b) => b.chroma * Math.sqrt(b.share) - a.chroma * Math.sqrt(a.share))[0];
  if (accent) roles['--accent'] = accent;
  return { width: img.width, height: img.height, clusters: clusters.sort((a, b) => b.share - a.share), roles, photoShare: px.length ? skipped / px.length : 0 };
}

/** A crop of the source PNG, as PNG bytes. */
export function cropPng(png: Buffer, box: NonNullable<PaletteCluster['box']>): Buffer {
  const img = PNG.sync.read(png);
  const x = Math.max(0, Math.min(img.width - 1, box.x));
  const y = Math.max(0, Math.min(img.height - 1, box.y));
  const width = Math.max(1, Math.min(img.width - x, box.width));
  const height = Math.max(1, Math.min(img.height - y, box.height, 600));
  const out = new PNG({ width, height });
  PNG.bitblt(img, out, x, y, width, height, 0, 0);
  return PNG.sync.write(out);
}

/** A screenshot's draft: sampled roles with crops (written by the caller), other clusters as candidates. */
export function screenshotDraft(palette: ScreenshotPalette, source: string, cropName: (token: string) => string | undefined): SourceDraft {
  const draft = emptyDraft(source, 'sampled');
  const used = new Set<PaletteCluster>();
  for (const [token, c] of Object.entries(palette.roles) as Array<[string, PaletteCluster]>) {
    used.add(c);
    draft.tokens[token] = { value: hex(c.rgb), where: `${source}: ${Math.round(c.share * 100)}% of the image${token === '--bg' ? ', at the edges' : ''}`, crop: cropName(token) };
  }
  for (const c of palette.clusters) if (!used.has(c) && c.share >= 0.002) draft.candidates.push({ value: hex(c.rgb), label: `${Math.round(c.share * 1000) / 10}% of ${source}` });
  draft.notes.push(`${source}: colours were sampled from pixels, so antialiasing and compression can shift them a little. Fonts can't be read from a screenshot: confirm them with the user.`);
  if (palette.photoShare > 0.15) draft.notes.push(`${source}: ${Math.round(palette.photoShare * 100)}% of the image looked like photos and was skipped.`);
  return draft;
}
