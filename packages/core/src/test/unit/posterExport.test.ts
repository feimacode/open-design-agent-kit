import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PDFDocument, PDFName, type PDFArray, type PDFNumber } from 'pdf-lib';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact, formatExportResult } from '../../export/exportArtifact';
import { qrSvg } from '../../poster/qr';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/poster/poster.html';
const MM_TO_PT = 72 / 25.4;

async function workspace(html: string, metadata?: Record<string, unknown>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-poster-'));
  await fs.mkdir(path.join(root, '.open-design', 'poster'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), html);
  await writeArtifactManifest({
    workspaceRoot: root,
    entryPath: ENTRY,
    artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Poster', metadata },
  });
  return root;
}

/** A page box as [x1, y1, x2, y2], relative to the BleedBox's lower-left corner, rounded to 0.01 pt. */
function box(page: ReturnType<PDFDocument['getPage']>, name: string): number[] {
  const raw = (n: string) => (page.node.get(PDFName.of(n)) as PDFArray).asArray().map((v) => (v as PDFNumber).asNumber());
  const [ox, oy] = raw('BleedBox');
  const [x1, y1, x2, y2] = raw(name);
  return [x1 - ox, y1 - oy, x2 - ox, y2 - oy].map((n) => Math.round(n * 100) / 100);
}

const mm = (n: number): number => Math.round(n * MM_TO_PT * 100) / 100;

/** An A3 poster at the bleed box: 303×426 mm, with text well inside the safe area. */
const a3Poster = (extra = '', card = 'width:303mm;height:426mm') => `<!doctype html><html><head><style>
  body{margin:0;background:#888;display:flex;justify-content:center;padding:40px}
  [data-od-card]{${card};position:relative;overflow:hidden;box-sizing:border-box;background:#14213d;color:#fff;font-family:sans-serif}
  h1{position:absolute;left:30mm;top:40mm;margin:0;font-size:60pt}
  p{position:absolute;left:30mm;top:120mm;margin:0;font-size:16pt}
</style></head><body><div data-od-card><h1>Hack Night</h1><p>Friday, 7 pm</p>${extra}</div></body></html>`;

describe('poster export (real browser; skipped when none is installed)', function () {
  this.timeout(90000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });

  it('prints an A3 poster at the bleed box with trim and bleed boxes and vector text', async () => {
    const root = await workspace(a3Poster());
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3' });
    assert.ok(result.ok && !('output' in result), JSON.stringify(result));
    assert.strictEqual(result.mode, 'print-pdf');
    assert.deepStrictEqual(result.files.map((f) => f.path), ['.open-design/poster/exports/poster.pdf']);
    assert.deepStrictEqual(result.findings?.filter((f) => f.severity !== 'info'), []);
    const bytes = await fs.readFile(path.join(root, result.files[0].path));
    const doc = await PDFDocument.load(bytes);
    assert.strictEqual(doc.getPageCount(), 1);
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - 303 * MM_TO_PT) < 1 && Math.abs(height - 426 * MM_TO_PT) < 1, `${width}×${height}`);
    assert.deepStrictEqual(box(page, 'TrimBox'), [mm(3), mm(3), mm(300), mm(423)]);
    assert.deepStrictEqual(box(page, 'BleedBox'), [0, 0, mm(303), mm(426)]);
    assert.ok(page.node.Resources()?.get(PDFName.of('Font')), 'text stays vector (the page has font resources)');
    const text = formatExportResult(result);
    assert.match(text, /trim 297×420 mm, 3 mm bleed/);
    assert.match(text, /RGB/);
  });

  it('honours zero bleed and adds a crop-mark slug', async () => {
    const zero = await workspace(a3Poster('', 'width:297mm;height:420mm'));
    const flat = await exportArtifact({ workspaceRoot: zero, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3', bleed: 0 });
    assert.ok(flat.ok && !('output' in flat), JSON.stringify(flat));
    const flatPage = (await PDFDocument.load(await fs.readFile(path.join(zero, flat.files[0].path)))).getPage(0);
    assert.deepStrictEqual(box(flatPage, 'TrimBox'), [0, 0, mm(297), mm(420)]);

    const root = await workspace(a3Poster());
    const marked = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3', cropMarks: true });
    assert.ok(marked.ok && !('output' in marked), JSON.stringify(marked));
    const page = (await PDFDocument.load(await fs.readFile(path.join(root, marked.files[0].path)))).getPage(0);
    assert.deepStrictEqual(box(page, 'MediaBox'), [mm(-10), mm(-10), mm(313), mm(436)]);
    assert.deepStrictEqual(box(page, 'TrimBox'), [mm(3), mm(3), mm(300), mm(423)]);
  });

  it('uses the recorded format for a plain PDF export, and flags a card authored at trim size', async () => {
    const root = await workspace(a3Poster('', 'width:297mm;height:420mm'), { format: 'a3' });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, format: 'pdf' });
    assert.ok(result.ok && !('output' in result), JSON.stringify(result));
    assert.strictEqual(result.mode, 'print-pdf');
    assert.strictEqual(result.sizeSource, 'recorded-format');
    const bleed = result.findings?.find((f) => f.check === 'bleed-size');
    assert.ok(bleed && bleed.severity === 'error' && /297×420 mm but the bleed box is 303×426 mm/.test(bleed.message), JSON.stringify(result.findings));
  });

  it('reports preflight problems without blocking the export', async () => {
    const tiny = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const extra = `
      <div style="position:absolute;left:30mm;top:200mm;width:40mm;height:10mm;overflow:hidden;font-size:30pt;white-space:nowrap">A headline that is far too long</div>
      <span style="position:absolute;left:1mm;top:300mm;font-size:20pt">Edge</span>
      <span style="position:absolute;left:30mm;top:320mm;font-size:6pt">fine print</span>
      <span style="position:absolute;left:30mm;top:340mm;font-size:20pt;color:#1b2a4a">Low contrast</span>
      <span style="position:absolute;left:30mm;top:360mm;font-size:20pt;background:linear-gradient(#000,#333)">On gradient</span>
      <span style="position:absolute;left:30mm;top:380mm;font-size:20pt">Party 🎉</span>
      <img src="${tiny}" style="position:absolute;left:150mm;top:200mm;width:100mm;height:100mm">
      <div style="position:absolute;left:200mm;top:40mm;width:40mm">${(await qrSvg('https://example.com/b')).replace('data-od-qr="https://example.com/b"', 'data-od-qr="https://example.com/a"')}</div>
      <img src="missing.png" style="position:absolute;left:30mm;top:60mm;width:1mm">
      <span style="position:absolute;left:150mm;top:330mm;font-size:30pt;background:#000">Collides</span>
      <span style="position:absolute;left:155mm;top:333mm;font-size:30pt;background:#000">With this</span>
      <div style="position:absolute;left:150mm;top:380mm;font-size:30pt;line-height:.85;background:#000">Tight<br>leading</div>`;
    const root = await workspace(a3Poster(extra));
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3' });
    assert.ok(result.ok && !('output' in result), JSON.stringify(result));
    assert.strictEqual(result.files.length, 1, 'still written');
    const findings = result.findings ?? [];
    const has = (check: string, severity: string, re: RegExp) =>
      assert.ok(findings.some((f) => f.check === check && f.severity === severity && re.test(f.message)), `${check}/${severity} ${re}\n${JSON.stringify(findings, null, 1)}`);
    has('overflow', 'error', /far too long/);
    has('safe-area', 'error', /Edge.*bleed/);
    has('min-type', 'warning', /fine print.*6pt/);
    has('contrast', 'warning', /Low contrast/);
    has('contrast', 'info', /not checked for 1/);
    has('emoji', 'warning', /Party/);
    has('image-ppi', 'error', /img/);
    has('qr', 'error', /labelled "https:\/\/example.com\/a" actually decodes to "https:\/\/example.com\/b"/);
    has('broken-asset', 'warning', /missing\.png/);
    has('overlap', 'warning', /"Collides" overlaps span "With this"/);
    assert.ok(!findings.some((f) => f.check === 'overlap' && /Tight/.test(f.message)), 'tight leading in one element is not an overlap');
    const text = formatExportResult(result);
    assert.ok(text.indexOf('ERROR') < text.indexOf('WARNING'), 'errors listed first');
  });

  it('checks without writing files', async () => {
    const root = await workspace(a3Poster());
    const before = await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8');
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3', checkOnly: true });
    assert.ok(result.ok && !('output' in result), JSON.stringify(result));
    assert.deepStrictEqual([result.files, result.checkOnly], [[], true]);
    await assert.rejects(fs.access(path.join(root, '.open-design/poster/exports')));
    assert.strictEqual(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'), before);
    assert.match(formatExportResult(result), /checkOnly: no files written[\s\S]*Preflight: passed/);
  });

  it('applies a screen preset: size, card selector and byte budget', async () => {
    const root = await workspace(`<!doctype html><body style="margin:0"><div data-od-card style="width:1080px;height:1920px;background:#e33;position:relative">
      <h1 style="position:absolute;left:100px;top:200px;margin:0;font-size:96px;color:#fff;background:#000">Launch</h1></div></body>`);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'story' });
    assert.ok(result.ok && !('output' in result), JSON.stringify(result));
    assert.strictEqual(result.sizeSource, 'preset');
    assert.deepStrictEqual(result.files.map((f) => [path.posix.basename(f.path), f.width, f.height]), [['poster.png', 1080, 1920]]);
    assert.deepStrictEqual(result.findings, []);
  });

  describe('bulk export from data', () => {
    const card = `<!doctype html><body style="margin:0"><div data-od-card style="width:600px;height:400px;background:#fff;position:relative;font-family:sans-serif">
      <h1 data-od-field="name" style="position:absolute;left:60px;top:60px;margin:0;width:300px;height:60px;overflow:hidden;white-space:nowrap;font-size:40px">Name</h1>
      <p data-od-field="talk" style="position:absolute;left:60px;top:150px;margin:0;font-size:20px">Talk</p>
      <div data-od-qr-field="url" style="position:absolute;left:400px;top:200px;width:150px;height:150px"></div></div></body>`;
    const csv = 'name,talk,url\nAda,Engines,https://example.com/ada\nGrace,Compilers,https://example.com/grace\nAda,Notes on a very long name,https://example.com/ada2\nA very long speaker name indeed,Overflow,https://example.com/long\n';

    it('writes one named image per row, verifies per-row QR codes, and leaves the HTML alone', async () => {
      const root = await workspace(card);
      await fs.writeFile(path.join(root, 'speakers.csv'), csv);
      const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, data: 'speakers.csv', nameField: 'name', selector: '[data-od-card]' });
      assert.ok(result.ok && !('output' in result), JSON.stringify(result));
      assert.deepStrictEqual(
        result.files.map((f) => path.posix.basename(f.path)),
        ['poster-ada.png', 'poster-grace.png', 'poster-ada-2.png', 'poster-a-very-long-speaker-name-indeed.png'],
      );
      assert.strictEqual(result.rows, 4);
      assert.strictEqual(await fs.readFile(path.join(root, ENTRY), 'utf8'), card);
      const findings = result.findings ?? [];
      assert.ok(!findings.some((f) => f.check === 'qr'), JSON.stringify(findings));
      const overflow = findings.filter((f) => f.check === 'overflow');
      assert.deepStrictEqual(overflow.map((f) => [f.row, f.rowName]), [[4, 'A very long speaker name indeed']]);
      assert.match(formatExportResult(result), /row 4 \(A very long speaker name indeed\)/);
    });

    it('fails before rendering when a field has no column', async () => {
      const root = await workspace(card);
      await fs.writeFile(path.join(root, 'bad.csv'), 'name,talk\nAda,Engines\n');
      const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath: '/not/needed', data: 'bad.csv' });
      assert.ok(!result.ok && result.code === 'invalid-args' && /"url"/.test(result.error) && /name, talk/.test(result.error));
    });

    it('merges print rows into one multi-page PDF, or splits them', async () => {
      const cert = a3Poster('<h2 data-od-field="name" style="position:absolute;left:30mm;top:200mm;margin:0;font-size:40pt">Name</h2>');
      const root = await workspace(cert);
      const rows = Array.from({ length: 5 }, (_, i) => `Person ${i + 1}`);
      await fs.writeFile(path.join(root, 'people.csv'), `name\n${rows.join('\n')}\n`);
      const merged = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3', data: 'people.csv' });
      assert.ok(merged.ok && !('output' in merged), JSON.stringify(merged));
      assert.strictEqual(merged.files.length, 1);
      const doc = await PDFDocument.load(await fs.readFile(path.join(root, merged.files[0].path)));
      assert.strictEqual(doc.getPageCount(), 5);
      assert.deepStrictEqual(box(doc.getPage(4), 'TrimBox'), [mm(3), mm(3), mm(300), mm(423)]);

      const split = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, preset: 'a3', data: 'people.csv', nameField: 'name', split: true });
      assert.ok(split.ok && !('output' in split), JSON.stringify(split));
      assert.deepStrictEqual(split.files.map((f) => path.posix.basename(f.path)), rows.map((_, i) => `poster-person-${i + 1}.pdf`));
    });
  });

  it('rejects mismatched options', async () => {
    const root = await workspace(a3Poster());
    const bad = async (o: Record<string, unknown>, re: RegExp) => {
      const r = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, ...o });
      assert.ok(!r.ok && r.code === 'invalid-args' && re.test(r.error), JSON.stringify(r));
    };
    await bad({ preset: 'a7' }, /Valid format ids/);
    await bad({ preset: 'story', cropMarks: true }, /print formats/);
    await bad({ bleed: 50, preset: 'a3' }, /between 0 and 20/);
    await bad({ format: 'standalone', checkOnly: true }, /not "standalone"/);
    await bad({ nameField: 'name' }, /only with data/);
  });
});
