import * as assert from 'node:assert';
import { promises as fs, readdirSync, readFileSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chartFindings } from '../../export/chartChecks';
import { niceTicks, renderChart, type ChartSpec } from '../../export/charts';
import { applySampleData, dataSourcesForEntry, loadSampleData, parseNumberCell, resolveSampleData, sampleDataFindings, type SampleData } from '../../export/sampleData';
import { CHART_SERIES_NAMES, CHART_VOCABULARY_NAMES, MIN_SERIES_CONTRAST, MIN_SERIES_DISTANCE, composeChartSection, deriveChartVocabulary, skillCharts } from '../../generation/chartVocabulary';
import { contrastRatio, deltaE2000 } from '../../generation/colorMix';
import { resolveDesignSystemTokens } from '../../generation/designSystemTokens';
import { checkSourceNumbers, visibleText, withoutBoundText } from '../../generation/sourceNumberCheck';

const DESIGN_SYSTEMS_DIR = path.resolve(__dirname, '../../../../content/assets/open-design/design-systems');

const fmt = (v: number, format: string | undefined, compact: boolean) =>
  format === 'currency' ? `$${compact ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US')}` : String(v);

const SALES = [
  { month: 'Jan', revenue: 82000, cost: 50000 },
  { month: 'Feb', revenue: 90000, cost: 52000 },
  { month: 'Mar', revenue: 121000, cost: 61000 },
];

const spec = (over: Partial<ChartSpec>): ChartSpec => ({ type: 'line', data: 'sales', x: 'month', y: ['revenue'], format: 'currency', ...over });

describe('niceTicks', () => {
  it('covers the range with round steps', () => {
    assert.deepStrictEqual(niceTicks(0, 121000, 5), [0, 50000, 100000, 150000]);
    assert.deepStrictEqual(niceTicks(82, 121, 5), [80, 90, 100, 110, 120, 130]);
  });
  it('handles a flat range', () => {
    assert.ok(niceTicks(5, 5).length >= 2);
    assert.deepStrictEqual(niceTicks(0, 0), [0, 1]);
  });
});

describe('renderChart', () => {
  it('draws a line with one point per row, a title, a summary and a values table', () => {
    const out = renderChart(spec({}), SALES, fmt, 'c1');
    assert.deepStrictEqual(out.problems, []);
    assert.match(out.html, /<svg[^>]+role="img"/);
    assert.strictEqual((out.html.match(/<circle /g) ?? []).length, 3);
    assert.match(out.summary, /revenue rose from \$82,000 in Jan to \$121,000 in Mar/);
    assert.match(out.html, /<desc id="c1-d">revenue rose/);
    assert.match(out.html, /<table class="od-chart-values"[\s\S]*<th scope="row">Mar<\/th><td>\$121,000<\/td>/);
    assert.match(out.html, /var\(--chart-1,/);
  });

  it('draws grouped bars from zero and stacked bars as one column per row', () => {
    const grouped = renderChart(spec({ type: 'bar', y: ['revenue', 'cost'] }), SALES, fmt);
    assert.strictEqual((grouped.html.match(/<rect [^>]*data-od-series/g) ?? []).length, 6);
    assert.match(grouped.html, />\$0k</, 'value axis starts at zero');
    const stacked = renderChart(spec({ type: 'bar', y: ['revenue', 'cost'], stacked: true }), SALES, fmt);
    assert.strictEqual((stacked.html.match(/<rect [^>]*data-od-series/g) ?? []).length, 6);
    const horizontal = renderChart(spec({ type: 'bar', orientation: 'horizontal' }), SALES, fmt);
    assert.match(horizontal.html, /text-anchor="end"[^>]*>Jan</);
  });

  it('draws area, donut and sparkline', () => {
    assert.match(renderChart(spec({ type: 'area' }), SALES, fmt).html, /fill-opacity="0.22"/);
    const donut = renderChart(spec({ type: 'donut' }), SALES, fmt);
    assert.strictEqual((donut.html.match(/<path [^>]*data-od-series/g) ?? []).length, 3);
    assert.match(donut.summary, /Mar is the largest at \$121,000 \(41%\)/);
    assert.match(renderChart(spec({ type: 'sparkline' }), SALES, fmt).html, /viewBox="0 0 160 40"/);
  });

  it('shows a KPI with its change in words and arrow, compared with the previous row', () => {
    const out = renderChart(spec({ type: 'kpi' }), SALES, fmt);
    assert.match(out.html, /\$121,000/);
    assert.match(out.html, /▲<\/span> up 34% <span class="od-kpi-period"[^>]*>vs Feb/);
    assert.deepStrictEqual(out.kpi, { label: 'revenue', value: 121000, previous: 90000 });
    const first = renderChart(spec({ type: 'kpi', compare: 'first' }), SALES, fmt);
    assert.match(first.html, /vs Jan/);
  });

  it('reports missing columns, empty data and unknown types', () => {
    const missing = renderChart(spec({ y: ['revnue'] }), SALES, fmt);
    assert.strictEqual(missing.problems[0].check, 'chart-data-missing');
    assert.match(missing.problems[0].message, /"revnue".*Columns: month, revenue, cost/);
    assert.strictEqual(renderChart(spec({}), undefined, fmt).problems[0].check, 'chart-data-missing');
    assert.strictEqual(renderChart(spec({}), [], fmt).problems[0].check, 'chart-empty');
    assert.strictEqual(renderChart(spec({ type: 'radar' }), SALES, fmt).problems[0].check, 'chart-unsupported');
  });

  it('skips non-numbers and says how many', () => {
    const out = renderChart(spec({}), [...SALES, { month: 'Apr', revenue: 'n/a' }], fmt);
    assert.ok(out.html);
    assert.ok(out.problems.some((p) => /1 value in "revenue" isn't a number/.test(p.message)));
  });
});

describe('charts in sample data', () => {
  const page = (inner: string) => `<html><head></head><body>${inner}</body></html>`;

  it('fills data-od-chart in place, preview-only, keeping the caption', () => {
    const data: SampleData = { locale: 'en-US', currency: 'USD', sales: SALES };
    const out = applySampleData(page('<figure data-od-chart="bar" data-od-data="sales" data-od-x="month" data-od-y="revenue" data-od-format="currency"><figcaption>Revenue</figcaption></figure>'), data);
    assert.match(out.html, /<figcaption>Revenue<\/figcaption><div data-od-preview-only="" data-od-chart-render=""/);
    assert.strictEqual(out.charts?.length, 1);
    assert.match(out.charts![0].summary, /Mar is highest at \$121,000\.00/);
    const again = applySampleData(out.html, data);
    assert.strictEqual((again.html.match(/data-od-chart-render/g) ?? []).length, 1, 're-rendering replaces the old drawing');
  });

  it('turns chart problems into findings', () => {
    const out = applySampleData(page('<div data-od-chart="line" data-od-data="nope" data-od-y="a"></div><div data-od-chart="line"></div>'), {});
    const findings = sampleDataFindings(out);
    assert.deepStrictEqual(findings.map((f) => f.check), ['chart-data-missing', 'chart-data-missing']);
  });
});

describe('collections from files', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-charts-'));
    await fs.mkdir(path.join(dir, 'data'));
    await fs.writeFile(path.join(dir, 'data', 'sales.csv'), 'month,revenue,code\nJan,"82,000",007\nFeb,90000.5,010\n');
    await fs.writeFile(path.join(dir, 'dash.data.json'), JSON.stringify({ locale: 'en-US', sales: { from: 'data/sales.csv' } }));
    await fs.writeFile(path.join(dir, 'dash.html'), '<html><body><span data-od-bind="sales[1].revenue" data-od-format="number">1</span><figure data-od-chart="line" data-od-data="sales" data-od-x="month" data-od-y="revenue"></figure></body></html>');
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  it('reads a CSV collection with numbers parsed and identifiers kept as text', async () => {
    const loaded = await loadSampleData(path.join(dir, 'dash.html'), dir);
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    assert.deepStrictEqual(loaded.data.sales, [
      { month: 'Jan', revenue: 82000, code: '007' },
      { month: 'Feb', revenue: 90000.5, code: '010' },
    ]);
    assert.deepStrictEqual(loaded.files.map((f) => path.basename(f)), ['sales.csv']);
  });

  it('binds and charts from it, and lists the files as sources', async () => {
    const html = await fs.readFile(path.join(dir, 'dash.html'), 'utf8');
    const out = await resolveSampleData(html, path.join(dir, 'dash.html'), dir);
    assert.match(out.html, />90,000\.5</);
    assert.match(out.html, /<svg/);
    assert.deepStrictEqual(await dataSourcesForEntry(dir, 'dash.html', html), ['dash.data.json', 'data/sales.csv']);
  });

  it('reports a collection file that is missing', async () => {
    await fs.writeFile(path.join(dir, 'dash.data.json'), JSON.stringify({ sales: { from: 'data/none.csv' } }));
    const loaded = await loadSampleData(path.join(dir, 'dash.html'), dir);
    assert.ok(!loaded.ok);
    if (!loaded.ok) assert.match(loaded.error, /reads data\/none\.csv, which isn't a file/);
  });
});

describe('parseNumberCell', () => {
  it('reads numbers in the locale and leaves everything else', () => {
    assert.strictEqual(parseNumberCell('1,284.50'), 1284.5);
    assert.strictEqual(parseNumberCell('1.284,50', 'de-DE'), 1284.5);
    assert.strictEqual(parseNumberCell('-12'), -12);
    assert.strictEqual(parseNumberCell('007'), '007');
    assert.strictEqual(parseNumberCell('2026-03-04'), '2026-03-04');
    assert.strictEqual(parseNumberCell('Q3'), 'Q3');
    assert.strictEqual(parseNumberCell('1.5', 'de-DE'), '1.5');
  });
});

describe('number check on data-bound pages', () => {
  it("ignores the template's example values in binds and charts", () => {
    const html = '<p>Revenue <span data-od-bind="sales[2].revenue">$999</span></p><figure data-od-chart="kpi"><span>$777</span></figure><p>Target $121,000</p>';
    const result = checkSourceNumbers(visibleText(withoutBoundText(html)), ['month,revenue\nMar,"121,000"']);
    assert.deepStrictEqual(result.unmatched, []);
    assert.ok(checkSourceNumbers(visibleText(html), ['121,000']).unmatched.length >= 2);
  });
});

describe('chart vocabulary', () => {
  it('derives all names, keeps declared ones and leaves tokens.css alone', () => {
    const tokens = new Map([['--accent', '#e11d48'], ['--bg', '#ffffff'], ['--chart-2', '#00aa77']]);
    const derived = deriveChartVocabulary(tokens);
    assert.ok(!derived.has('--chart-2'));
    assert.strictEqual(derived.size, CHART_VOCABULARY_NAMES.length - 1);
    const resolved = resolveDesignSystemTokens({ designMd: '# X', tokensCss: ':root { --accent: #e11d48; --chart-2: #00aa77; }' });
    assert.strictEqual(resolved.tokens.get('--chart-2'), '#00aa77');
    assert.ok(resolved.derivedChart.includes('--chart-1'));
  });

  it('darkens a pale accent to 3:1', () => {
    const derived = deriveChartVocabulary(new Map([['--accent', '#ffd6e0'], ['--bg', '#ffffff']]));
    assert.ok((contrastRatio(derived.get('--chart-1')!, '#ffffff') ?? 0) >= MIN_SERIES_CONTRAST);
  });

  it('is readable and distinct in every bundled system', () => {
    const ids = readdirSync(DESIGN_SYSTEMS_DIR).filter((id) => existsSync(path.join(DESIGN_SYSTEMS_DIR, id, 'tokens.css')));
    assert.ok(ids.length > 100);
    const failures: string[] = [];
    for (const id of ids) {
      const read = (f: string) => (existsSync(path.join(DESIGN_SYSTEMS_DIR, id, f)) ? readFileSync(path.join(DESIGN_SYSTEMS_DIR, id, f), 'utf8') : undefined);
      const { tokens } = resolveDesignSystemTokens({ designMd: read('DESIGN.md') ?? '', tokensCss: read('tokens.css'), overrideCss: read('tokens.override.css') });
      const derived = deriveChartVocabulary(new Map([...tokens].filter(([k]) => !k.startsWith('--chart-'))));
      const bg = derived.get('--chart-seq-1') ? undefined : undefined;
      void bg;
      const series = CHART_SERIES_NAMES.map((n) => derived.get(n)!);
      const ground = tokens.get('--bg') && /^#/.test(tokens.get('--bg')!) ? tokens.get('--bg')! : undefined;
      if (ground) {
        for (const c of [...series, derived.get('--chart-pos')!, derived.get('--chart-neg')!]) {
          const r = contrastRatio(c, ground) ?? 0;
          if (r < MIN_SERIES_CONTRAST - 0.01) failures.push(`${id}: ${c} on ${ground} is ${r.toFixed(2)}:1`);
        }
      }
      for (let i = 1; i < series.length; i++) {
        if (deltaE2000(series[i], series[i - 1]) < MIN_SERIES_DISTANCE - 0.5) failures.push(`${id}: ${series[i - 1]} and ${series[i]} too close`);
      }
    }
    assert.deepStrictEqual(failures, []);
  });

  it('adds a Charts section only for skills that draw charts', () => {
    assert.ok(skillCharts({ id: 'dashboard' }));
    assert.ok(skillCharts({ id: 'data-report' }));
    assert.ok(skillCharts({ id: 'finance-report' }));
    assert.ok(skillCharts({ id: 'live-dashboard' }));
    assert.ok(!skillCharts({ id: 'poster-swiss' }));
    const section = composeChartSection({ tokens: new Map([['--accent', '#e11d48']]), designSystemName: 'Acme' });
    assert.match(section, /^## Charts/);
    assert.match(section, /data-od-chart/);
    assert.match(section, /Don't load Chart\.js/);
    assert.match(section, /`--chart-1` `#/);
  });
});

describe('chart checks', () => {
  const checks = (html: string) => chartFindings(html).map((f) => f.check);
  const data: SampleData = { locale: 'en-US', currency: 'USD', sales: SALES, regions: ['N', 'S', 'E', 'W', 'C', 'X'].map((r, i) => ({ region: r, v: i + 1 })) };
  const filled = (inner: string, css = '') => applySampleData(`<html><head><style>:root{--bg:#ffffff;--accent:#2f6feb;${css}}</style></head><body>${inner}</body></html>`, data).html;

  it('passes a well-made dashboard', () => {
    const html = filled('<figure data-od-chart="line" data-od-data="sales" data-od-x="month" data-od-y="revenue,cost" data-od-labels="Revenue,Cost" data-od-format="currency"></figure><div class="card"><div data-od-chart="kpi" data-od-data="sales" data-od-x="month" data-od-y="revenue" data-od-format="currency"></div></div>');
    assert.deepStrictEqual(checks(html), []);
  });

  it('flags too many series, no unit, column-name legends and low-contrast series', () => {
    const html = filled(
      '<figure data-od-chart="line" data-od-data="sales" data-od-x="month" data-od-y="a,b,c,d,e,f,g"></figure>' +
        '<figure data-od-chart="donut" data-od-data="regions" data-od-x="region" data-od-y="v"></figure>' +
        '<figure data-od-chart="bar" data-od-data="sales" data-od-x="month" data-od-y="revenue,cost_usd"></figure>',
      '--chart-1:#eeeeee;--chart-2:#efefef;',
    );
    const found = checks(html);
    assert.ok(found.filter((c) => c === 'chart-too-many-series').length === 2, found.join());
    assert.ok(found.includes('chart-unlabelled'));
    assert.ok(found.includes('chart-series-contrast'));
    assert.ok(chartFindings(html).every((f) => f.severity === 'info'));
  });

  it('flags a KPI change with no period, and a hand-drawn bar axis that starts above zero', () => {
    assert.deepStrictEqual(checks('<div class="kpi"><b>$1.2M</b><span>+12%</span></div>'), ['kpi-no-period']);
    assert.deepStrictEqual(checks('<div class="kpi"><b>$1.2M</b><span>+12% vs last month</span></div>'), []);
    const bars = '<svg><text x="10" y="10">120</text><text x="10" y="50">100</text><text x="10" y="90">80</text><rect x="30" y="20" width="20" height="70"/><rect x="60" y="40" width="20" height="50"/><rect x="90" y="60" width="20" height="30"/></svg>';
    assert.deepStrictEqual(checks(bars), ['chart-axis-truncated']);
    assert.deepStrictEqual(checks(bars.replace('>80<', '>0<')), []);
  });

  it('flags a kit KPI with nothing to compare with', () => {
    const one: SampleData = { s: [{ m: 'Sep', v: 5 }] };
    const html = applySampleData('<html><body><div><div data-od-chart="kpi" data-od-data="s" data-od-x="m" data-od-y="v"></div></div></body></html>', one).html;
    assert.deepStrictEqual(checks(html), ['kpi-no-period']);
  });
});
