import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveIncludes } from '../../export/flowIncludes';
import {
  applySampleData,
  composeMockDataSection,
  formatValue,
  inferMockTypes,
  promisedCounts,
  resolvePath,
  sampleDataFindings,
  sampleDataForEntry,
  thinStaticTables,
  type SampleData,
} from '../../export/sampleData';
import { composeInstructions } from '../../generation/composeInstructions';
import { composePortToAppInstructions } from '../../generation/portToAppInstructions';

const DATA: SampleData = {
  locale: 'de-DE',
  currency: 'EUR',
  invoices: [
    { id: 'inv-1', customer: 'Bäckerei Klein', total: 1240.5, due: '2026-03-04', lines: [{ item: 'Brot' }, { item: 'Kuchen' }] },
    { id: 'inv-2', customer: 'Großhandel Müller & Söhne Lebensmittel GmbH', total: 0, due: '2026-03-18', lines: [] },
    { id: 'inv-3', customer: 'Ida', total: 1284903.17, due: '2026-04-01', phone: null, lines: [{ item: 'Mehl' }] },
  ],
};

describe('sample data: binds and repeats', () => {
  it('resolves absolute and relative paths', () => {
    assert.strictEqual(resolvePath(DATA, undefined, 'invoices[1].total'), 0);
    assert.strictEqual(resolvePath(DATA, (DATA.invoices as unknown[])[2], '.customer'), 'Ida');
    assert.strictEqual(typeof resolvePath(DATA, undefined, 'invoices[9].total'), 'symbol');
    assert.strictEqual(resolvePath(DATA, (DATA.invoices as unknown[])[2], '.phone'), null);
  });

  it('formats with the file locale and currency', () => {
    assert.strictEqual(formatValue(1240.5, 'currency', DATA), '1.240,50 €');
    assert.strictEqual(formatValue(1284903.17, 'number', DATA), '1.284.903,17');
    assert.strictEqual(formatValue(0.125, 'percent', DATA), '12,5 %');
    assert.strictEqual(formatValue('2026-03-04', 'date', DATA), '04.03.2026');
    assert.strictEqual(formatValue(null, 'currency', DATA), '');
    assert.strictEqual(formatValue('x', undefined, DATA), 'x');
  });

  it('fills binds, renders one preview-only copy per record, and keeps one template', () => {
    const html = `<!doctype html><html><head></head><body>
      <h1 data-od-bind="invoices[0].customer">Customer</h1>
      <table><tbody><tr data-od-repeat="invoices" id="row"><td data-od-bind=".customer">Name</td><td data-od-bind=".total" data-od-format="currency">0</td><td data-od-bind=".phone" data-od-empty="—">x</td>
        <td><ul><li data-od-repeat=".lines" data-od-bind=".item">Line</li></ul></td></tr></tbody></table>
      <a data-od-bind-href=".id" data-od-bind="invoices[1].id">link</a></body></html>`;
    const out = applySampleData(html, DATA);
    assert.deepStrictEqual(out.missing, ['.id']);
    const rows = out.html.match(/<tr\b[^>]*>/g)!;
    assert.strictEqual(rows.length, 3);
    assert.match(rows[0], /data-od-repeat="invoices"/);
    assert.doesNotMatch(rows[0], /data-od-preview-only/);
    assert.match(rows[1], /data-od-preview-only/);
    assert.doesNotMatch(rows[1], /id="row"/, 'copies drop the template id');
    assert.match(out.html, /<h1 data-od-bind="invoices\[0\]\.customer">Bäckerei Klein<\/h1>/);
    assert.match(out.html, /Großhandel Müller &amp; Söhne Lebensmittel GmbH|Großhandel Müller & Söhne Lebensmittel GmbH/);
    assert.match(out.html, /1\.284\.903,17(&nbsp;|\u00a0)€/);
    assert.match(out.html, />—<\/td>/, 'a null value shows data-od-empty');
    // Nested repeats: two lines in the first invoice, none in the second (hidden template), one in the third.
    assert.strictEqual((out.html.match(/>Brot</g) ?? []).length, 1);
    assert.strictEqual((out.html.match(/>Kuchen</g) ?? []).length, 1);
    assert.strictEqual((out.html.match(/>Mehl</g) ?? []).length, 1);
    assert.match(out.html, /data-od-repeat-empty/);
    assert.match(out.html, /<style data-od-preview-only(="")?>\[data-od-repeat-empty\]/);
    assert.deepStrictEqual(
      out.repeats.map((r) => [r.path, r.count, r.tabular]),
      [['invoices', 3, true], ['.lines', 2, true], ['.lines', 0, true], ['.lines', 1, true]],
    );
  });

  it('is served with the shared data file, after shared fragments', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-data-'));
    await fs.mkdir(path.join(root, 'flow/_shared'), { recursive: true });
    await fs.writeFile(path.join(root, 'flow/_shared/data.json'), JSON.stringify(DATA));
    await fs.writeFile(path.join(root, 'flow/_shared/nav.html'), '<nav><span data-od-bind="invoices[2].customer">x</span></nav>');
    const html = '<!doctype html><html><head></head><body><template data-od-include="_shared/nav.html"></template><p data-od-bind="invoices[1].total" data-od-format="currency">1</p></body></html>';
    const out = await resolveIncludes(html, path.join(root, 'flow/list.html'), root);
    assert.match(out.html, />Ida</);
    assert.match(out.html, />0,00(&nbsp;|\u00a0)€</);
    assert.deepStrictEqual(out.included, ['_shared/nav.html']);
    // A screen's own <name>.data.json wins over the shared one.
    await fs.writeFile(path.join(root, 'flow/list.data.json'), JSON.stringify({ invoices: [{ total: 5 }, { total: 7 }] }));
    const own = await resolveIncludes('<body><p data-od-bind="invoices[1].total">1</p></body>', path.join(root, 'flow/list.html'), root);
    assert.match(own.html, />7</);
    assert.deepStrictEqual((await sampleDataForEntry(root, 'flow/list.html', '<p data-od-bind="a">'))?.path, 'flow/list.data.json');
  });
});

describe('sample data: findings', () => {
  it('reports missing paths, thin lists and broken promises', () => {
    const thin = applySampleData('<body><ul><li data-od-repeat="invoices" data-od-bind=".nope">x</li></ul></body>', { invoices: [{ name: 'A' }, { name: 'B' }] });
    const findings = sampleDataFindings(thin, ['A grid of 6 invoices with totals']);
    assert.deepStrictEqual(findings.map((f) => f.check).sort(), ['items-promised', 'sample-data-missing', 'sample-data-thin']);
    assert.match(findings.find((f) => f.check === 'items-promised')!.message, /6 invoices.*renders 2/);
    const ok = applySampleData('<body><ul><li data-od-repeat="rows" data-od-bind=".name">x</li></ul></body>', {
      rows: Array.from({ length: 12 }, (_, i) => ({ name: i === 3 ? 'A very long customer name that keeps on going' : `R${i}` })),
    });
    assert.deepStrictEqual(sampleDataFindings(ok), []);
    // A segmented control (not a table or list) isn't held to table rules.
    assert.deepStrictEqual(sampleDataFindings(applySampleData('<body><div><button data-od-repeat="tabs" data-od-bind=".l">x</button></div></body>', { tabs: [{ l: 'Day' }, { l: 'Week' }] })), []);
    assert.deepStrictEqual(sampleDataFindings({ html: '', missing: [], repeats: [], error: 'No data file' }).map((f) => f.check), ['sample-data-missing']);
  });

  it('reads promised counts from a brief', () => {
    assert.deepStrictEqual(promisedCounts('A grid of 6 products and three featured categories, 2026 numbers'), [
      { noun: 'product', count: 6 },
      { noun: 'categorie', count: 3 },
    ]);
  });

  it('flags hand-written tables with too few rows', () => {
    const three = '<table aria-label="Orders"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>';
    assert.deepStrictEqual(thinStaticTables(three).map((f) => f.check), ['sample-data-thin']);
    assert.match(thinStaticTables(three)[0].message, /"Orders" table has 3 rows/);
    assert.deepStrictEqual(thinStaticTables(`<section data-od-state="error" hidden>${three}</section>`), []);
    assert.deepStrictEqual(thinStaticTables('<table><tbody><tr data-od-repeat="x"><td></td></tr></tbody></table>'), []);
  });
});

describe('sample data: instructions and promote', () => {
  it('gives app screens the data rules, pointing a flow at its shared file', () => {
    const base = { skillName: 'app-table', skillBody: 'Body', brief: 'Orders list' };
    const app = composeInstructions({ ...base, craftSections: [{ id: 'product-ui', body: 'Rules' }] } as unknown as Parameters<typeof composeInstructions>[0]);
    assert.match(app, /## Sample data/);
    assert.match(app, /orders\.data\.json/);
    const flow = composeInstructions({ ...base, flowContext: { plan: { screens: [{ id: 'list', title: 'List' }], links: [] }, screenId: 'list', collectionDir: '.open-design/orders' } } as unknown as Parameters<typeof composeInstructions>[0]);
    assert.match(flow, /\.open-design\/orders\/_shared\/data\.json/);
    assert.doesNotMatch(composeInstructions(base as unknown as Parameters<typeof composeInstructions>[0]), /## Sample data/);
  });

  it('infers mock types and asks promote for mocks and a data seam', () => {
    const types = inferMockTypes(DATA);
    assert.strictEqual(types.length, 1);
    assert.strictEqual(types[0].typeName, 'Invoice');
    assert.match(types[0].type, /customer: string;/);
    assert.match(types[0].type, /phone\?: null;/);
    assert.match(types[0].type, /lines: Array<\{\n\s+item: string;\n\s+\}>;/);
    const section = composeMockDataSection({ path: 'flow/_shared/data.json', data: DATA });
    assert.match(section, /mocks\/invoices\.ts/);
    assert.match(section, /TODO\(data\): replace with your API/);
    assert.match(section, /de-DE/);
    const promote = composePortToAppInstructions({ artifactEntryPath: 'a.html', artifactContent: '<p data-od-bind="x"></p>', sampleData: { path: 'd.json', data: DATA } });
    assert.match(promote, /## Keep the design's data as mocks/);
    assert.doesNotMatch(composePortToAppInstructions({ artifactEntryPath: 'a.html', artifactContent: '<p></p>' }), /mocks/);
  });
});
