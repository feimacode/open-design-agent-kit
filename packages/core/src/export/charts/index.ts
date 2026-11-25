// Kit-drawn charts (openspec add-data-bound-charts). An element marked
// `data-od-chart` is filled with an inline SVG chart drawn from a collection
// in the design's data file, in the same pass that fills data-od-bind:
//
//   <figure data-od-chart="line" data-od-data="sales" data-od-x="month"
//           data-od-y="revenue,cost" data-od-format="currency"></figure>
//
// Six types: bar, line, area, donut, sparkline and kpi. Charts are drawn on
// the server, not by a script in the page, so the preview, the check, the
// PDF and a Claude artifact all show the same chart with no network access.
// Colours come from the design system's chart tokens (add-chart-tokens),
// written as var(--chart-N, fallback) so a theme change follows.

export const CHART_TYPES = ['bar', 'line', 'area', 'donut', 'sparkline', 'kpi'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** Most series a chart draws; more are reported and left out. */
export const MAX_SERIES = 8;
/** Most categories (rows) a chart draws. */
export const MAX_POINTS = 200;

export interface ChartSpec {
  type: string;
  /** Collection path in the data file. */
  data: string;
  /** Category column (the x axis, or donut slice labels). */
  x?: string;
  /** Value columns. */
  y: string[];
  format?: string;
  /** Bars only: "horizontal" or "vertical" (default). */
  orientation?: string;
  /** Bars and areas: stack series. */
  stacked?: boolean;
  /** KPI only: "previous" (default), "first", or a row index to compare with. */
  compare?: string;
  /** Short title for the chart's <title>. */
  title?: string;
  /** Series display names, comma-separated in the same order as y. */
  labels?: string[];
}

export interface ChartProblem {
  check: 'chart-data-missing' | 'chart-empty' | 'chart-unsupported';
  severity: 'error' | 'warning';
  message: string;
}

export interface ChartOutput {
  /** Markup to place inside the chart element (preview-only). */
  html: string;
  /** One-sentence summary, also the chart's accessible name. */
  summary: string;
  problems: ChartProblem[];
  /** KPI only: the value shown and the value compared with. */
  kpi?: { label: string; value: number; previous?: number };
}

export type Formatter = (value: number, format: string | undefined, compact: boolean) => string;

const FALLBACK_SERIES = [
  'var(--accent, #2f6feb)',
  'oklch(from var(--accent, #2f6feb) l c calc(h + 150))',
  'oklch(from var(--accent, #2f6feb) l c calc(h + 75))',
  'oklch(from var(--accent, #2f6feb) l c calc(h + 225))',
  'oklch(from var(--accent, #2f6feb) calc(l * 0.7) c h)',
  'oklch(from var(--accent, #2f6feb) l c calc(h + 300))',
];

export function seriesColour(i: number): string {
  const n = (i % 6) + 1;
  return `var(--chart-${n}, ${FALLBACK_SERIES[i % 6]})`;
}
const POS = 'var(--chart-pos, var(--success, #1a7f37))';
const NEG = 'var(--chart-neg, var(--danger, #cf222e))';
const GRID = 'var(--chart-grid, var(--border-soft, #e5e7eb))';
const AXIS = 'var(--chart-axis, var(--muted, #6b7280))';

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rounds a number to a "nice" value (1, 2, 2.5, 5 × 10^n). */
function niceNumber(range: number, round: boolean): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/** Axis ticks covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    if (min === 0) return [0, 1];
    const pad = Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const step = niceNumber(niceNumber(max - min, false) / Math.max(1, count - 1), true);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

interface Series {
  key: string;
  label: string;
  values: Array<number | null>;
}

interface Prepared {
  categories: string[];
  series: Series[];
  problems: ChartProblem[];
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function prepare(spec: ChartSpec, rows: unknown): Prepared | { problems: ChartProblem[] } {
  const where = `The ${spec.type} chart on "${spec.data}"`;
  if (!Array.isArray(rows)) {
    return { problems: [{ check: 'chart-data-missing', severity: 'error', message: `${where} names a collection the data file doesn't have (or that isn't a list). Add it to the data file or fix data-od-data.` }] };
  }
  const list = rows.slice(0, MAX_POINTS).filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Array<Record<string, unknown>>;
  if (list.length === 0) {
    return { problems: [{ check: 'chart-empty', severity: 'warning', message: `${where} has no rows to draw. Add rows to the data, or show the chart's empty state instead.` }] };
  }
  const columns = [...new Set(list.flatMap((r) => Object.keys(r)))];
  const problems: ChartProblem[] = [];
  const missing = [spec.x, ...spec.y].filter((c): c is string => !!c && !columns.includes(c));
  if (missing.length > 0) {
    return {
      problems: [
        {
          check: 'chart-data-missing',
          severity: 'error',
          message: `${where} uses ${missing.map((m) => `"${m}"`).join(', ')}, which ${missing.length === 1 ? 'isn\'t a column' : 'aren\'t columns'} in the data. Columns: ${columns.join(', ')}.`,
        },
      ],
    };
  }
  if (spec.y.length === 0) {
    return { problems: [{ check: 'chart-data-missing', severity: 'error', message: `${where} has no data-od-y: name the value column(s) to plot. Columns: ${columns.join(', ')}.` }] };
  }
  let keys = spec.y;
  if (keys.length > MAX_SERIES) {
    problems.push({ check: 'chart-unsupported', severity: 'warning', message: `${where} has ${keys.length} series; only the first ${MAX_SERIES} are drawn.` });
    keys = keys.slice(0, MAX_SERIES);
  }
  const categories = list.map((r, i) => (spec.x ? cellText(r[spec.x]) : String(i + 1)));
  const series: Series[] = keys.map((key, i) => {
    const values = list.map((r) => {
      const v = r[key];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
      return Number.isFinite(n) ? n : NaN;
    });
    return { key, label: spec.labels?.[i]?.trim() || key, values: values.map((v) => (Number.isNaN(v) ? null : v)) as Array<number | null> };
  });
  for (const key of keys) {
    const bad = list.filter((r) => {
      const v = r[key];
      if (typeof v === 'number') return false;
      if (v === null || v === undefined || v === '') return false;
      return !Number.isFinite(typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN);
    }).length;
    if (bad > 0) problems.push({ check: 'chart-data-missing', severity: 'warning', message: `${where}: ${bad} value${bad === 1 ? '' : 's'} in "${key}" ${bad === 1 ? 'isn\'t a number' : 'aren\'t numbers'} and ${bad === 1 ? 'is' : 'are'} left out.` });
  }
  return { categories, series, problems };
}

function summarise(type: ChartType, p: Prepared, fmt: (v: number) => string): string {
  const s = p.series[0];
  const pts = s.values.map((v, i) => ({ v, c: p.categories[i] })).filter((x): x is { v: number; c: string } => x.v !== null);
  if (pts.length === 0) return `${s.label}: no values.`;
  if (type === 'line' || type === 'area' || type === 'sparkline') {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dir = b.v > a.v ? 'rose' : b.v < a.v ? 'fell' : 'stayed';
    const more = p.series.length > 1 ? ` (${p.series.length} series: ${p.series.map((x) => x.label).join(', ')})` : '';
    return dir === 'stayed'
      ? `${s.label} stayed at ${fmt(a.v)} from ${a.c} to ${b.c}${more}.`
      : `${s.label} ${dir} from ${fmt(a.v)} in ${a.c} to ${fmt(b.v)} in ${b.c}${more}.`;
  }
  const top = pts.reduce((m, x) => (x.v > m.v ? x : m), pts[0]);
  if (type === 'donut') {
    const total = pts.reduce((t, x) => t + Math.max(0, x.v), 0);
    const share = total > 0 ? Math.round((top.v / total) * 100) : 0;
    return `${s.label} by ${pts.length} parts: ${top.c} is the largest at ${fmt(top.v)} (${share}%).`;
  }
  const low = pts.reduce((m, x) => (x.v < m.v ? x : m), pts[0]);
  const more = p.series.length > 1 ? ` Series: ${p.series.map((x) => x.label).join(', ')}.` : '';
  return `${s.label} across ${pts.length} ${pts.length === 1 ? 'item' : 'items'}: ${top.c} is highest at ${fmt(top.v)}, ${low.c} lowest at ${fmt(low.v)}.${more}`;
}

const SR_ONLY = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

function valuesTable(p: Prepared, fmt: (v: number) => string, xLabel: string): string {
  const head = `<tr><th scope="col">${escapeXml(xLabel)}</th>${p.series.map((s) => `<th scope="col">${escapeXml(s.label)}</th>`).join('')}</tr>`;
  const body = p.categories
    .map((c, i) => `<tr><th scope="row">${escapeXml(c)}</th>${p.series.map((s) => `<td>${s.values[i] === null ? '' : escapeXml(fmt(s.values[i] as number))}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="od-chart-values" style="${SR_ONLY}"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

let currentId = 'od-chart';

function svgOpen(w: number, h: number, title: string, summary: string, extraStyle = ''): { open: string; id: string } {
  const id = currentId;
  return {
    id,
    open: `<svg class="od-chart-svg" role="img" aria-labelledby="${id}-t ${id}-d" viewBox="0 0 ${w} ${h}" width="100%" style="display:block;height:auto;overflow:visible;font-size:12px;${extraStyle}" xmlns="http://www.w3.org/2000/svg"><title id="${id}-t">${escapeXml(title)}</title><desc id="${id}-d">${escapeXml(summary)}</desc>`,
  };
}

function legend(p: Prepared, x: number, y: number): string {
  if (p.series.length < 2) return '';
  let cx = x;
  return p.series
    .map((s, i) => {
      const item = `<g transform="translate(${cx},${y})"><rect width="10" height="10" rx="2" fill="${seriesColour(i)}"/><text x="14" y="9" fill="${AXIS}">${escapeXml(s.label)}</text></g>`;
      cx += 24 + s.label.length * 7;
      return item;
    })
    .join('');
}

function shortLabel(s: string, max = 14): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function cartesian(type: 'bar' | 'line' | 'area', spec: ChartSpec, p: Prepared, title: string, summary: string, axisFmt: (v: number) => string): string {
  const horizontal = type === 'bar' && spec.orientation === 'horizontal';
  const stacked = !!spec.stacked && (type === 'bar' || type === 'area');
  const n = p.categories.length;
  const W = 640;
  const H = horizontal ? Math.max(160, 36 + n * 28) : 320;
  const legendH = p.series.length > 1 ? 24 : 0;
  const longestCat = Math.max(...p.categories.map((c) => shortLabel(c, 18).length));
  const left = horizontal ? Math.min(160, 12 + longestCat * 7) : 56;
  const right = 16;
  const top = 12 + legendH;
  const bottom = horizontal ? 28 : 36;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  // Value extent: bars and areas start at zero; lines fit the data.
  const totals = p.categories.map((_, i) => p.series.reduce((t, s) => t + Math.max(0, s.values[i] ?? 0), 0));
  const negTotals = p.categories.map((_, i) => p.series.reduce((t, s) => t + Math.min(0, s.values[i] ?? 0), 0));
  const all = p.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  let lo = stacked ? Math.min(0, ...negTotals) : Math.min(...all);
  let hi = stacked ? Math.max(...totals) : Math.max(...all);
  if (type !== 'line') {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  const ticks = niceTicks(lo, hi, 5);
  const vMin = ticks[0];
  const vMax = ticks[ticks.length - 1];
  const scale = (v: number) => (vMax === vMin ? 0 : (v - vMin) / (vMax - vMin));
  const { open } = svgOpen(W, H, title, summary);
  const parts: string[] = [open, legend(p, left, 4)];

  // Grid and value axis labels.
  for (const t of ticks) {
    if (horizontal) {
      const x = left + scale(t) * plotW;
      parts.push(`<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + plotH}" stroke="${GRID}" stroke-width="1"/>`);
      parts.push(`<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${AXIS}">${escapeXml(axisFmt(t))}</text>`);
    } else {
      const y = top + plotH - scale(t) * plotH;
      parts.push(`<line x1="${left}" y1="${y.toFixed(1)}" x2="${W - right}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
      parts.push(`<text x="${left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${AXIS}">${escapeXml(axisFmt(t))}</text>`);
    }
  }

  // Category labels: every one when they fit, otherwise every k-th.
  const band = (horizontal ? plotH : plotW) / n;
  const every = horizontal ? 1 : Math.max(1, Math.ceil((longestCat * 7 + 8) / band));
  p.categories.forEach((c, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    const mid = (horizontal ? top : left) + band * (i + 0.5);
    const label = escapeXml(shortLabel(c, 18));
    parts.push(
      horizontal
        ? `<text x="${left - 8}" y="${(mid + 4).toFixed(1)}" text-anchor="end" fill="${AXIS}">${label}</text>`
        : `<text x="${mid.toFixed(1)}" y="${H - 12}" text-anchor="middle" fill="${AXIS}">${label}</text>`,
    );
  });

  const zero = scale(Math.max(vMin, Math.min(0, vMax)));
  if (type === 'bar') {
    const groups = stacked ? 1 : p.series.length;
    const inner = band * 0.72;
    const barW = inner / groups;
    const posAcc = new Array(n).fill(0);
    const negAcc = new Array(n).fill(0);
    p.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        if (v === null) return;
        let a: number;
        let b: number;
        if (stacked) {
          const acc = v >= 0 ? posAcc : negAcc;
          a = scale(acc[i]);
          acc[i] += v;
          b = scale(acc[i]);
        } else {
          a = zero;
          b = scale(v);
        }
        const start = (horizontal ? top : left) + band * i + (band - inner) / 2 + (stacked ? 0 : barW * si);
        const len = Math.abs(b - a) * (horizontal ? plotW : plotH);
        const from = Math.min(a, b);
        const rect = horizontal
          ? `x="${(left + from * plotW).toFixed(1)}" y="${start.toFixed(1)}" width="${len.toFixed(1)}" height="${Math.max(1, barW - 2).toFixed(1)}"`
          : `x="${start.toFixed(1)}" y="${(top + plotH - (from * plotH + len)).toFixed(1)}" width="${Math.max(1, barW - 2).toFixed(1)}" height="${len.toFixed(1)}"`;
        parts.push(`<rect ${rect} rx="2" fill="${seriesColour(si)}" data-od-series="${escapeXml(s.key)}"><title>${escapeXml(`${p.categories[i]}, ${s.label}: ${axisFmt(v)}`)}</title></rect>`);
      });
    });
  } else {
    const xAt = (i: number) => left + band * (i + 0.5);
    const yAt = (v: number) => top + plotH - scale(v) * plotH;
    const acc = new Array(n).fill(0);
    p.series.forEach((s, si) => {
      const base = acc.slice();
      const pts: Array<[number, number] | null> = s.values.map((v, i) => {
        if (v === null) return null;
        const level = stacked ? base[i] + v : v;
        if (stacked) acc[i] = level;
        return [xAt(i), yAt(level)];
      });
      const runs: Array<Array<[number, number]>> = [];
      let run: Array<[number, number]> = [];
      pts.forEach((pt) => {
        if (pt) run.push(pt);
        else if (run.length) {
          runs.push(run);
          run = [];
        }
      });
      if (run.length) runs.push(run);
      const colour = seriesColour(si);
      for (const r of runs) {
        const d = r.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
        if (type === 'area') {
          const startIdx = pts.indexOf(r[0]);
          const baseline = r
            .map((_, k) => {
              const i = startIdx + k;
              return [xAt(i), stacked ? yAt(base[i]) : yAt(Math.max(vMin, Math.min(0, vMax)))] as [number, number];
            })
            .reverse();
          const back = baseline.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join('');
          parts.push(`<path d="${d}${back}Z" fill="${colour}" fill-opacity="0.22" stroke="none" data-od-series="${escapeXml(s.key)}"/>`);
        }
        parts.push(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" data-od-series="${escapeXml(s.key)}"/>`);
      }
      if (n <= 24) {
        pts.forEach((pt, i) => {
          if (!pt) return;
          parts.push(`<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3" fill="${colour}"><title>${escapeXml(`${p.categories[i]}, ${s.label}: ${axisFmt(s.values[i] as number)}`)}</title></circle>`);
        });
      }
    });
  }
  parts.push('</svg>');
  return parts.join('');
}

function donut(p: Prepared, title: string, summary: string, fmt: (v: number) => string): string {
  const s = p.series[0];
  const slices = s.values.map((v, i) => ({ v: Math.max(0, v ?? 0), c: p.categories[i], i })).filter((x) => x.v > 0);
  const total = slices.reduce((t, x) => t + x.v, 0);
  const W = 480;
  const H = Math.max(220, 40 + slices.length * 22);
  const cx = 110;
  const cy = H / 2;
  const R = 96;
  const r = 60;
  const { open } = svgOpen(W, H, title, summary);
  const parts = [open];
  let a = -Math.PI / 2;
  slices.forEach((sl, k) => {
    const frac = total > 0 ? sl.v / total : 0;
    const b = a + frac * Math.PI * 2;
    const large = b - a > Math.PI ? 1 : 0;
    const pt = (rad: number, ang: number) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    const d =
      frac >= 0.9999
        ? `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}L${cx - 0.01},${cy - r}A${r},${r} 0 1 0 ${cx},${cy - r}Z`
        : `M${pt(R, a)}A${R},${R} 0 ${large} 1 ${pt(R, b)}L${pt(r, b)}A${r},${r} 0 ${large} 0 ${pt(r, a)}Z`;
    parts.push(`<path d="${d}" fill="${seriesColour(k)}" stroke="var(--bg, #fff)" stroke-width="2" data-od-series="${escapeXml(sl.c)}"><title>${escapeXml(`${sl.c}: ${fmt(sl.v)}`)}</title></path>`);
    const ly = cy - (slices.length * 22) / 2 + k * 22 + 11;
    const pct = total > 0 ? Math.round(frac * 100) : 0;
    parts.push(`<rect x="232" y="${(ly - 9).toFixed(1)}" width="10" height="10" rx="2" fill="${seriesColour(k)}"/><text x="248" y="${ly.toFixed(1)}" fill="currentColor">${escapeXml(shortLabel(sl.c, 22))}</text><text x="${W - 8}" y="${ly.toFixed(1)}" text-anchor="end" fill="${AXIS}">${escapeXml(fmt(sl.v))} · ${pct}%</text>`);
    a = b;
  });
  parts.push(`<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-weight="600" fill="currentColor">${escapeXml(fmt(total))}</text>`);
  parts.push('</svg>');
  return parts.join('');
}

function sparkline(p: Prepared, title: string, summary: string): string {
  const s = p.series[0];
  const vals = s.values.map((v) => v ?? NaN);
  const finite = vals.filter((v) => Number.isFinite(v));
  const W = 160;
  const H = 40;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const n = vals.length;
  const x = (i: number) => (n === 1 ? W / 2 : 2 + (i / (n - 1)) * (W - 4));
  const y = (v: number) => (hi === lo ? H / 2 : H - 3 - ((v - lo) / (hi - lo)) * (H - 6));
  const d = vals.map((v, i) => (Number.isFinite(v) ? `${i && Number.isFinite(vals[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}` : '')).join('');
  const lastI = vals.length - 1 - [...vals].reverse().findIndex((v) => Number.isFinite(v));
  const { open } = svgOpen(W, H, title, summary, 'max-width:100%;');
  return `${open}<path d="${d}" fill="none" stroke="${seriesColour(0)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" data-od-series="${escapeXml(s.key)}"/><circle cx="${x(lastI).toFixed(1)}" cy="${y(vals[lastI]).toFixed(1)}" r="2.5" fill="${seriesColour(0)}"/></svg>`;
}

function kpi(spec: ChartSpec, p: Prepared, fmt: (v: number) => string): ChartOutput {
  const s = p.series[0];
  const idx = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const last = idx[idx.length - 1];
  const value = s.values[last] as number;
  let cmpIdx: number | undefined;
  const compare = (spec.compare ?? 'previous').trim();
  if (compare === 'previous') cmpIdx = idx.length > 1 ? idx[idx.length - 2] : undefined;
  else if (compare === 'first') cmpIdx = idx.length > 1 ? idx[0] : undefined;
  else if (compare === 'none') cmpIdx = undefined;
  else if (/^\d+$/.test(compare) && s.values[Number(compare)] !== null && s.values[Number(compare)] !== undefined) cmpIdx = Number(compare);
  const previous = cmpIdx === undefined ? undefined : (s.values[cmpIdx] as number);
  const parts = [`<span class="od-kpi-value" style="font-variant-numeric:tabular-nums">${escapeXml(fmt(value))}</span>`];
  let summary = `${s.label}: ${fmt(value)} in ${p.categories[last]}.`;
  if (previous !== undefined) {
    const diff = value - previous;
    const pct = previous !== 0 ? diff / Math.abs(previous) : undefined;
    const up = diff > 0;
    const flat = diff === 0;
    const arrow = flat ? '→' : up ? '▲' : '▼';
    const word = flat ? 'no change' : `${up ? 'up' : 'down'} ${pct === undefined ? fmt(Math.abs(diff)) : `${Math.abs(pct * 100).toFixed(Math.abs(pct) < 0.1 ? 1 : 0)}%`}`;
    const colour = flat ? AXIS : up ? POS : NEG;
    parts.push(
      `<span class="od-kpi-delta" style="color:${colour}"><span aria-hidden="true">${arrow}</span> ${escapeXml(word)} <span class="od-kpi-period" style="color:${AXIS}">vs ${escapeXml(p.categories[cmpIdx as number])}</span></span>`,
    );
    summary = `${s.label}: ${fmt(value)} in ${p.categories[last]}, ${word} from ${fmt(previous)} in ${p.categories[cmpIdx as number]}.`;
  }
  return {
    html: `<span class="od-kpi" role="group" aria-label="${escapeXml(summary)}" style="display:flex;flex-direction:column;gap:4px">${parts.join('')}</span>`,
    summary,
    problems: [],
    kpi: { label: s.label, value, previous },
  };
}

/** Draws one chart from `rows` (the collection's records). */
export function renderChart(spec: ChartSpec, rows: unknown, format: Formatter, id = 'od-chart-1'): ChartOutput {
  currentId = id;
  const type = spec.type.trim().toLowerCase();
  if (!(CHART_TYPES as readonly string[]).includes(type)) {
    return {
      html: '',
      summary: '',
      problems: [{ check: 'chart-unsupported', severity: 'error', message: `"${spec.type}" isn't a chart type the kit draws. Use one of: ${CHART_TYPES.join(', ')}. Draw anything else by hand (or with the d3-visualization skill).` }],
    };
  }
  const prepared = prepare({ ...spec, type }, rows);
  if (!('series' in prepared)) return { html: '', summary: '', problems: prepared.problems };
  const p = prepared;
  const problems = [...p.problems];
  if (!p.series.some((s) => s.values.some((v) => v !== null))) {
    problems.push({ check: 'chart-empty', severity: 'warning', message: `The ${type} chart on "${spec.data}" has no numeric values to draw.` });
    return { html: '', summary: '', problems };
  }
  if ((type === 'donut' || type === 'sparkline' || type === 'kpi') && p.series.length > 1) {
    problems.push({ check: 'chart-unsupported', severity: 'warning', message: `A ${type} chart draws one value column; only "${p.series[0].key}" is used.` });
    p.series = p.series.slice(0, 1);
  }
  if (spec.orientation && type !== 'bar') problems.push({ check: 'chart-unsupported', severity: 'warning', message: `data-od-orientation applies to bar charts only; it is ignored on this ${type} chart.` });
  if (spec.stacked && type !== 'bar' && type !== 'area') problems.push({ check: 'chart-unsupported', severity: 'warning', message: `data-od-stacked applies to bar and area charts only; it is ignored on this ${type} chart.` });
  const fmt = (v: number) => format(v, spec.format, false);
  const axisFmt = (v: number) => format(v, spec.format, true);
  if (type === 'kpi') {
    const out = kpi(spec, p, fmt);
    return { ...out, problems: [...problems, ...out.problems] };
  }
  const summary = summarise(type as ChartType, p, fmt);
  const title = spec.title?.trim() || `${p.series.map((s) => s.label).join(', ')}${spec.x ? ` by ${spec.x}` : ''}`;
  let svg: string;
  if (type === 'donut') svg = donut(p, title, summary, fmt);
  else if (type === 'sparkline') svg = sparkline(p, title, summary);
  else svg = cartesian(type as 'bar' | 'line' | 'area', spec, p, title, summary, axisFmt);
  return { html: svg + valuesTable(p, fmt, spec.x ?? '#'), summary, problems };
}

/** The chart spec from an element's data-od-* attributes. */
export function chartSpecFromAttributes(attr: (name: string) => string | undefined): ChartSpec {
  const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const stacked = attr('data-od-stacked');
  return {
    type: attr('data-od-chart') ?? '',
    data: (attr('data-od-data') ?? '').trim(),
    x: attr('data-od-x')?.trim() || undefined,
    y: list(attr('data-od-y')),
    format: attr('data-od-format')?.trim() || undefined,
    orientation: attr('data-od-orientation')?.trim().toLowerCase() || undefined,
    stacked: stacked !== undefined && stacked !== 'false',
    compare: attr('data-od-compare')?.trim() || undefined,
    title: attr('data-od-title')?.trim() || attr('aria-label')?.trim() || undefined,
    labels: attr('data-od-labels') ? list(attr('data-od-labels')) : undefined,
  };
}
