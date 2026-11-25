// Chart checks (openspec add-dashboard-recipe): the common dashboard mistakes,
// read from the page's HTML with no browser. Kit charts (data-od-chart) are
// read from their attributes and the page's chart colours; hand-drawn SVG bar
// charts get the axis check from their tick labels. Every finding is a note
// ('info') until a calibration run promotes it.

import * as cheerio from 'cheerio';
import type { Finding } from '../poster/preflight';
import { CHART_SERIES_NAMES, MIN_SERIES_CONTRAST, MIN_SERIES_DISTANCE, deriveChartVocabulary } from '../generation/chartVocabulary';
import { contrastRatio, deltaE2000, resolveColorValue } from '../generation/colorMix';
import { parseTokensCss } from '../generation/designSystemTokens';

/** Most lines on one chart, and most parts in a donut. */
export const MAX_LINES = 6;
export const MAX_DONUT_PARTS = 5;

const PERIOD_WORDS = /\b(vs\.?|versus|from|than|since|compared|last|previous|prior|before|mom|yoy|wow|qoq|month|week|quarter|year|period|target|goal|plan)\b|上月|去年|同比|环比/i;
const CHANGE_TEXT = /(?:^|\s|\()[▲▼↑↓+−-]\s?\d+(?:[.,]\d+)?\s?%/;
const CODE_NAME = /_|^[a-z]+[A-Z]|^[a-z0-9]+$/;

/** The colours the page's kit charts draw with: declared --chart-N, else derived from the page's own tokens. */
function pageChartColours($: cheerio.CheerioAPI): { series: string[]; bg: string } | undefined {
  const css = $('style').map((_, el) => $(el).text()).get().join('\n');
  const declared = parseTokensCss(css);
  const lookup = (n: string) => declared.get(`--${n}`);
  const literal = (name: string) => {
    const v = declared.get(name);
    return v ? resolveColorValue(v, lookup) : undefined;
  };
  const bg = literal('--bg') ?? '#ffffff';
  const derived = deriveChartVocabulary(new Map([...declared].filter(([k]) => !k.startsWith('--chart-'))));
  const series = CHART_SERIES_NAMES.map((n) => literal(n) ?? derived.get(n)!);
  return { series, bg };
}

function attrList(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function chartName(node: ReturnType<cheerio.CheerioAPI>, i: number): string {
  const label = node.attr('data-od-title') ?? node.attr('aria-label') ?? node.children('figcaption').first().text().trim();
  return label ? `"${label.slice(0, 60)}"` : `chart ${i + 1}`;
}

function numberOf(text: string): number | undefined {
  const t = text.trim().replace(/[\s$€£¥,]/g, '').replace(/%$/, '');
  const m = /^(-?\d+(?:\.\d+)?)([kKmMbB]?)$/.exec(t);
  if (!m) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return Number(m[1]) * mult;
}

/** Chart findings for a page, after binds and charts are filled. */
export function chartFindings(html: string): Finding[] {
  const $ = cheerio.load(html);
  const findings: Finding[] = [];
  const note = (check: string, message: string, selector?: string) => findings.push({ check, severity: 'info', message, ...(selector ? { selector } : {}) });
  const charts = $('[data-od-chart]');
  const colours = charts.length > 0 ? pageChartColours($) : undefined;

  charts.each((i, el) => {
    const node = $(el);
    const type = (node.attr('data-od-chart') ?? '').trim().toLowerCase();
    const y = attrList(node.attr('data-od-y'));
    const name = chartName(node, i);
    const sel = `[data-od-chart]:nth-of-type(${i + 1})`;
    // Series drawn: one per value column, or one per row for a donut.
    const rendered = node.find('[data-od-chart-render] [data-od-series]');
    const seriesKeys = [...new Set(rendered.map((_, s) => $(s).attr('data-od-series')).get())];
    const count = type === 'donut' ? seriesKeys.length : y.length;

    if (type === 'line' && y.length > MAX_LINES) note('chart-too-many-series', `The line chart ${name} has ${y.length} lines. More than ${MAX_LINES} can't be told apart: show the top few and group the rest, or use small multiples.`, sel);
    if (type === 'donut' && count > MAX_DONUT_PARTS) note('chart-too-many-series', `The donut ${name} has ${count} parts. Use at most ${MAX_DONUT_PARTS}, grouping the rest as "Other", or a sorted bar chart.`, sel);

    if (['bar', 'line', 'area'].includes(type)) {
      const hasUnit = !!node.attr('data-od-format') || /[$€£¥%]|\(|\bin\b|per\b|count|number of/i.test(`${node.attr('data-od-title') ?? ''} ${node.attr('aria-label') ?? ''} ${node.children('figcaption').text()}`);
      if (!hasUnit) note('chart-unlabelled', `The ${type} chart ${name} has no unit: add data-od-format (currency, number, percent) or say the unit in its caption ("Revenue, $ thousands").`, sel);
      if (y.length > 1 && !node.attr('data-od-labels') && y.some((k) => CODE_NAME.test(k))) {
        note('chart-unlabelled', `The ${type} chart ${name} shows its column names (${y.join(', ')}) in the legend: add data-od-labels with names people read.`, sel);
      }
    }

    if (type === 'kpi' && !node.find('.od-kpi-period').length) {
      const card = node.parent();
      if (!PERIOD_WORDS.test(card.text())) note('kpi-no-period', `The KPI ${name} has no comparison period: add an earlier row to the data, or say on the card which period it covers.`, sel);
    }

    if (colours && count > 0 && type !== 'kpi' && type !== 'sparkline') {
      const used = colours.series.slice(0, Math.min(count, colours.series.length));
      const low = used.filter((c) => (contrastRatio(c, colours.bg) ?? 21) < MIN_SERIES_CONTRAST);
      const close = used.slice(1).filter((c, k) => deltaE2000(c, used[k]) < MIN_SERIES_DISTANCE);
      if (low.length) note('chart-series-contrast', `In ${name}, ${low.join(', ')} ${low.length === 1 ? 'is' : 'are'} under ${MIN_SERIES_CONTRAST}:1 against the background ${colours.bg}. Use the design system's --chart-N colours.`, sel);
      if (close.length) note('chart-series-contrast', `In ${name}, neighbouring series colours are too close to tell apart (${close.join(', ')}). Use the design system's --chart-N colours in order.`, sel);
    }
  });

  // Hand-drawn KPI cards: a change like "+12%" with no comparison period nearby.
  $('body *').each((_, el) => {
    const node = $(el);
    if (node.closest('[data-od-chart], [data-od-preview-only], script, style, svg').length) return;
    const own = node.contents().filter((_, c) => c.type === 'text').text();
    if (!CHANGE_TEXT.test(` ${own}`)) return;
    const card = node.parent().parent();
    if (PERIOD_WORDS.test(`${node.parent().text()} ${card.children().length < 8 ? card.text() : ''}`)) return;
    note('kpi-no-period', `"${own.trim().slice(0, 40)}" shows a change with no comparison period: say what it is against ("vs August").`);
  });

  // Hand-drawn bar charts whose value axis starts above zero.
  $('svg').each((i, el) => {
    const svg = $(el);
    if (svg.closest('[data-od-chart]').length) return;
    const rects = svg.find('rect').filter((_, r) => Number($(r).attr('height') ?? 0) > 0 && Number($(r).attr('width') ?? 0) > 0);
    if (rects.length < 3) return;
    const widths = rects.map((_, r) => Math.round(Number($(r).attr('width')))).get();
    const common = widths.filter((w) => w === widths[0]).length;
    if (common < 3) return;
    const ticks = svg
      .find('text')
      .map((_, t) => ({ x: Number($(t).attr('x') ?? NaN), v: numberOf($(t).text()) }))
      .get()
      .filter((t) => t.v !== undefined && Number.isFinite(t.x));
    if (ticks.length < 3) return;
    const minX = Math.min(...ticks.map((t) => t.x));
    const axis = ticks.filter((t) => Math.abs(t.x - minX) < 2).map((t) => t.v as number);
    if (axis.length < 3) return;
    const lowest = Math.min(...axis);
    if (lowest > 0) note('chart-axis-truncated', `A bar chart's value axis starts at ${lowest}, not zero, so the bars exaggerate the differences. Start bars at zero, or use a line chart or a dot plot.`, `svg:nth-of-type(${i + 1})`);
  });

  return findings;
}
