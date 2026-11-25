// Chart colours (openspec add-chart-tokens). Resolving a design system's
// tokens appends a chart family derived from the system's own colours, the
// same way the motion vocabulary is derived, so every system (bundled,
// custom or extracted) gets chart colours without hand-written values:
//
//   --chart-1 … --chart-6      categorical series, from --accent by hue steps
//   --chart-seq-1 … -5         a sequential ramp from --bg to --chart-1
//   --chart-pos, --chart-neg   change up and down, from --success and --danger
//   --chart-grid, --chart-axis gridlines and axis text, from --border-soft and --muted
//
// Series, up and down are at least 3:1 against --bg (WCAG 1.4.11 non-text
// contrast) and adjacent series are kept apart. A name the system declares
// keeps its value; the vendored token files and schema are unchanged.

import { contrastRatio, deltaE2000, formatColor, oklabToRgb, parseColor, resolveColorValue, rgbToOklab } from './colorMix';

export const CHART_SERIES_NAMES = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'] as const;
export const CHART_SEQUENTIAL_NAMES = ['--chart-seq-1', '--chart-seq-2', '--chart-seq-3', '--chart-seq-4', '--chart-seq-5'] as const;
export const CHART_VOCABULARY_NAMES = [...CHART_SERIES_NAMES, ...CHART_SEQUENTIAL_NAMES, '--chart-pos', '--chart-neg', '--chart-grid', '--chart-axis'] as const;

/** Least contrast of a series, up or down colour against the background. */
export const MIN_SERIES_CONTRAST = 3;
/** Least CIEDE2000 difference between adjacent series. */
export const MIN_SERIES_DISTANCE = 12;

// Hue steps from the accent, ordered so neighbours are far apart on the wheel.
const HUE_STEPS = [0, 150, 60, 210, 300, 105];
const MIN_CHROMA = 0.09;
const MAX_CHROMA = 0.2;

const DEFAULTS: Record<string, string> = {
  '--accent': '#2f6feb',
  '--bg': '#ffffff',
  '--fg': '#111111',
  '--success': '#1a7f37',
  '--danger': '#cf222e',
  '--border-soft': '#e5e7eb',
  '--muted': '#6b7280',
};

function literal(tokens: ReadonlyMap<string, string>, name: string): string {
  const raw = tokens.get(name);
  const lookup = (n: string) => tokens.get(`--${n}`);
  const value = raw === undefined ? undefined : resolveColorValue(raw, lookup);
  return value && parseColor(value) && parseColor(value)!.a >= 1 ? value : DEFAULTS[name];
}

type Lch = [number, number, number];

function toLch(hex: string): Lch {
  const [L, a, b] = rgbToOklab(parseColor(hex)!);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function fromLch([L, C, h]: Lch): string {
  const H = (h * Math.PI) / 180;
  return formatColor(oklabToRgb(Math.min(1, Math.max(0, L)), C * Math.cos(H), C * Math.sin(H), 1));
}

/** The colour with its lightness moved away from `bg` until it reaches `min` contrast. */
export function withContrast(hex: string, bg: string, min: number): string {
  if ((contrastRatio(hex, bg) ?? 0) >= min) return hex;
  const bgLight = (toLch(bg)[0] ?? 1) > 0.6;
  const lch = toLch(hex);
  for (let i = 1; i <= 50; i++) {
    const next: Lch = [lch[0] + (bgLight ? -0.02 : 0.02) * i, lch[1], lch[2]];
    const out = fromLch(next);
    if ((contrastRatio(out, bg) ?? 0) >= min) return out;
  }
  return bgLight ? '#000000' : '#ffffff';
}

function mixOklab(a: string, b: string, t: number): string {
  const p = rgbToOklab(parseColor(a)!);
  const q = rgbToOklab(parseColor(b)!);
  return formatColor(oklabToRgb(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, 1));
}

/** Six categorical series from the accent, readable on `bg` and apart from their neighbours. */
export function deriveSeries(accent: string, bg: string): string[] {
  const [aL, C, aH] = toLch(accent);
  const bgIsLight = toLch(bg)[0] > 0.6;
  // A black, white or grey accent has no hue to step from: start the other series from blue at mid lightness.
  const achromatic = C < 0.03;
  const h = achromatic ? 255 : aH;
  const L = Math.min(0.78, Math.max(0.45, achromatic ? (bgIsLight ? 0.55 : 0.75) : aL));
  const chroma = Math.min(MAX_CHROMA, Math.max(MIN_CHROMA, C));
  const out: string[] = [];
  HUE_STEPS.forEach((step, i) => {
    let colour = i === 0 ? withContrast(accent, bg, MIN_SERIES_CONTRAST) : withContrast(fromLch([L, chroma, (h + step) % 360]), bg, MIN_SERIES_CONTRAST);
    // Keep each series apart from the one before it: step its lightness away, staying readable.
    const bgLight = bgIsLight;
    for (let k = 1; i > 0 && k <= 6 && deltaE2000(colour, out[i - 1]) < MIN_SERIES_DISTANCE; k++) {
      const [l2, c2, h2] = toLch(colour);
      colour = withContrast(fromLch([l2 + (bgLight ? -0.06 : 0.06), c2, h2]), bg, MIN_SERIES_CONTRAST);
    }
    out.push(colour);
  });
  return out;
}

/** The derived chart names still unset in `tokens`, with their values. */
export function deriveChartVocabulary(tokens: ReadonlyMap<string, string>): Map<string, string> {
  const bg = literal(tokens, '--bg');
  const series = deriveSeries(literal(tokens, '--accent'), bg);
  const values = new Map<string, string>();
  CHART_SERIES_NAMES.forEach((n, i) => values.set(n, series[i]));
  CHART_SEQUENTIAL_NAMES.forEach((n, i) => values.set(n, i === 4 ? series[0] : mixOklab(bg, series[0], 0.2 * (i + 1))));
  values.set('--chart-pos', withContrast(literal(tokens, '--success'), bg, MIN_SERIES_CONTRAST));
  values.set('--chart-neg', withContrast(literal(tokens, '--danger'), bg, MIN_SERIES_CONTRAST));
  values.set('--chart-grid', literal(tokens, '--border-soft'));
  values.set('--chart-axis', withContrast(literal(tokens, '--muted'), bg, 4.5));
  const out = new Map<string, string>();
  for (const name of CHART_VOCABULARY_NAMES) if (!tokens.has(name)) out.set(name, values.get(name)!);
  return out;
}

/** The token set with the chart vocabulary added (declared names win). */
export function withChartVocabulary(tokens: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(tokens);
  for (const [name, value] of deriveChartVocabulary(tokens)) out.set(name, value);
  return out;
}

const CHART_ID = /(^|[:/_-])(dashboard|data-report|finance-report|chart|charts|kpi|analytics|metrics|weekly-report)([:/_-]|$)/i;

/** Whether a skill draws charts, so its brief gets the Charts section. */
export function skillCharts(skill: { id: string; name?: string; category?: string }): boolean {
  // The live templates are rebuilt as data-file dashboards here (hostOverrides.ts), so they chart too.
  if (/^live-(artifact|dashboard)$/.test(skill.id)) return true;
  if (/data|finance/i.test(skill.category ?? '') && !/diagram/i.test(skill.category ?? '')) return true;
  return CHART_ID.test(skill.id) || CHART_ID.test(skill.name ?? '');
}

/**
 * The brief's Charts section (openspec add-data-bound-charts, add-chart-tokens):
 * draw charts with data-od-chart from the data file, and the chart colours.
 */
export function composeChartSection(input: { tokens: ReadonlyMap<string, string>; designSystemName?: string }): string {
  const full = withChartVocabulary(input.tokens);
  const v = (n: string) => `\`${full.get(n) ?? ''}\``;
  return [
    '## Charts',
    '',
    "Draw every chart with the kit's `data-od-chart` element. The kit draws it as an inline SVG from the data file when the page is served, checked and exported, so the numbers always match the data and next period's data redraws the same chart. Don't load Chart.js, ECharts or any other chart library from a CDN, and don't hand-draw a chart of numbers that are in the data.",
    '',
    '- **The data:** put the data in the design\'s data file (`<name>.data.json` beside the page, or `_shared/data.json`), as `{ "locale": "en-US", "currency": "USD", "asOf": "2026-11-30", "sales": { "from": "data/sales.csv" } }`. A collection given as `{ "from": "<workspace path>" }` (`.csv`, `.xlsx` with `"sheet"`, or a `.json` array) is read from that file, and cells that are numbers become numbers. Don\'t copy the user\'s rows into the page.',
    '- **A chart:** `<figure data-od-chart="line" data-od-data="sales" data-od-x="month" data-od-y="revenue,cost" data-od-labels="Revenue,Cost" data-od-format="currency"><figcaption>Revenue and cost, Jan to Sep 2026</figcaption></figure>`. Size it with CSS on the figure; the SVG fills its width.',
    '- **Types:** `bar` (add `data-od-orientation="horizontal"` for long category names, `data-od-stacked` for parts of a total), `line` (trends), `area` (volume over time, `data-od-stacked` for parts), `donut` (shares of one total, at most 5 parts), `sparkline` (a small trend in a KPI card) and `kpi` (the last row\'s value and its change from the previous row; `data-od-compare="first"` or a row number to compare with another). Formats: `currency`, `number`, `percent`.',
    '- **KPI cards:** a `kpi` chart for the number and change, a label, and the period it compares with; the kit writes "▲ 4% vs Aug" with the sign in text, never colour alone.',
    '- **Other text:** bind headline numbers with `data-od-bind="sales[8].revenue" data-od-format="currency"` and the date with `data-od-bind="asOf" data-od-format="date"`, so nothing on the page is typed by hand.',
    '',
    `**Chart colours${input.designSystemName ? ` for ${input.designSystemName}` : ''}.** Declare these in the page's \`:root\` (the kit's charts read them) and use them for any chart detail you add. Series in order: ${CHART_SERIES_NAMES.map((n) => `\`${n}\` ${v(n)}`).join(', ')}. Sequential ramp (heatmaps, ordered values): ${CHART_SEQUENTIAL_NAMES.map((n) => `\`${n}\` ${v(n)}`).join(', ')}. Up and down: \`--chart-pos\` ${v('--chart-pos')} and \`--chart-neg\` ${v('--chart-neg')}, for change only. Gridlines \`--chart-grid\` ${v('--chart-grid')}; axis text \`--chart-axis\` ${v('--chart-axis')}.`,
    '',
    'The check reports a chart whose collection or column is missing (`chart-data-missing`), a chart with no rows (`chart-empty`) and an unknown type or option (`chart-unsupported`).',
  ].join('\n');
}
