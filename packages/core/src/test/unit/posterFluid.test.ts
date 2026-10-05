import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PDFDocument, PDFName, type PDFArray, type PDFNumber } from 'pdf-lib';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact, formatExportResult } from '../../export/exportArtifact';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/fluid/fluid.html';
const MM_TO_PT = 72 / 25.4;
const mm = (n: number): number => Math.round(n * MM_TO_PT * 100) / 100;

/** The experiment's fluid poster: sizes in cq units, a wide and a tall rule. `headline` overrides the h1 size. */
const fluidPoster = (headline = 'min(22cqw, 14cqh)') => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#ccc;display:flex;justify-content:center;padding:40px}
[data-od-card]{--od-w:297mm;--od-h:420mm;--od-bleed:0mm;width:calc(var(--od-w) + 2*var(--od-bleed));height:calc(var(--od-h) + 2*var(--od-bleed));
  container-type:size;position:relative;overflow:hidden;box-sizing:border-box;flex-shrink:0;font-family:sans-serif;color:#fff;background:#13284a}
.od-safe{position:absolute;inset:calc(var(--od-bleed) + 6cqmin);display:grid;grid-template-rows:auto 1fr auto;gap:3cqmin}
.k{font-size:max(10pt,2.6cqmin);background:#000}
h1{margin:0;font-size:${headline};line-height:.95;align-self:center;background:#000}
.when{margin:0;font-size:max(10pt,4cqmin);background:#000}
@container (aspect-ratio > 1.2){.od-safe{grid-template-columns:1.3fr 1fr;grid-template-rows:auto 1fr}.k{grid-column:1/-1}.when{align-self:center}}
@container (aspect-ratio < 0.6){h1{font-size:20cqw}}
</style></head><body><div data-od-card data-od-fluid><div class="od-safe">
<div class="k">Builders night</div><h1 id="title" data-od-field="title">Hack Night</h1><p class="when" data-od-field="when">Friday 7 pm</p></div></div></body></html>`;

async function workspace(html: string, metadata?: Record<string, unknown>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-fluid-'));
  await fs.mkdir(path.join(root, '.open-design', 'fluid'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), html);
  await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Hack Night', metadata } });
  return root;
}

function box(page: ReturnType<PDFDocument['getPage']>, name: string): number[] {
  const raw = (n: string) => (page.node.get(PDFName.of(n)) as PDFArray).asArray().map((v) => (v as PDFNumber).asNumber());
  const [ox, oy] = raw('BleedBox');
  const [x1, y1, x2, y2] = raw(name);
  return [x1 - ox, y1 - oy, x2 - ox, y2 - oy].map((n) => Math.round(n * 100) / 100);
}

const pngSize = async (file: string): Promise<[number, number]> => {
  const png = await fs.readFile(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe('fluid poster export (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });
  const run = (root: string, o: Record<string, unknown>) => exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, ...o });

  it('adds the bleed at export and passes preflight at A3', async () => {
    const root = await workspace(fluidPoster(), { format: 'a3', fluid: true });
    const r = await run(root, { preset: 'a3' });
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    assert.deepStrictEqual(r.findings?.filter((f) => f.severity !== 'info'), []);
    const page = (await PDFDocument.load(await fs.readFile(path.join(root, r.files[0].path)))).getPage(0);
    assert.deepStrictEqual(box(page, 'TrimBox'), [mm(3), mm(3), mm(300), mm(423)]);
    assert.ok(Math.abs(page.getSize().width - mm(303)) < 0.5);
    assert.match(r.sizeDetail, /reflowed/);
  });

  it('reflows to another print shape and to wide and tall screen shapes, leaving the HTML alone', async () => {
    const html = fluidPoster();
    const root = await workspace(html, { format: 'a3', fluid: true });
    const big = await run(root, { preset: 'poster-24x36' });
    assert.ok(big.ok && !('output' in big), JSON.stringify(big));
    const page = (await PDFDocument.load(await fs.readFile(path.join(root, big.files[0].path)))).getPage(0);
    assert.ok(Math.abs(page.getSize().width - mm(609.6 + 2 * 3.175)) < 0.5, String(page.getSize().width));

    const wide = await run(root, { preset: 'x-image' });
    assert.ok(wide.ok && !('output' in wide), JSON.stringify(wide));
    assert.deepStrictEqual(await pngSize(path.join(root, wide.files[0].path)), [1600, 900]);
    assert.deepStrictEqual(wide.findings?.filter((f) => f.severity === 'error'), []);

    const tall = await run(root, { width: 600, height: 1200 });
    assert.ok(tall.ok && !('output' in tall), JSON.stringify(tall));
    assert.deepStrictEqual(await pngSize(path.join(root, tall.files[0].path)), [600, 1200]);
    assert.strictEqual(await fs.readFile(path.join(root, ENTRY), 'utf8'), html);
  });

  it('flags sizes that do not scale with the poster', async () => {
    const fixedHeadline = await workspace(fluidPoster('96px'), { format: 'a3' });
    const r = await run(fixedHeadline, { preset: 'a3', checkOnly: true });
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    const fixed = (r.findings ?? []).filter((f) => f.check === 'fixed-size');
    assert.strictEqual(fixed.length, 1, JSON.stringify(r.findings));
    assert.match(fixed[0].message, /h1#title "Hack Night" doesn't scale/);

    const clean = await workspace(fluidPoster(), { format: 'a3' });
    const ok = await run(clean, { preset: 'a3', checkOnly: true });
    assert.ok(ok.ok && !('output' in ok) && !(ok.findings ?? []).some((f) => f.check === 'fixed-size'), JSON.stringify(ok));
  });

  it('exports several shapes in one call, each preflighted at its own shape', async () => {
    const root = await workspace(fluidPoster(), { format: 'a3' });
    const r = await run(root, { presets: ['a3', 'ig-portrait', 'story'] });
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    assert.deepStrictEqual(r.files.map((f) => path.posix.basename(f.path)), ['fluid-a3.pdf', 'fluid-ig-portrait.png', 'fluid-story.png']);
    assert.deepStrictEqual(await pngSize(path.join(root, r.files[2].path)), [1080, 1920]);
    assert.deepStrictEqual(r.shapes, ['a3', 'ig-portrait', 'story']);
    assert.strictEqual(r.prints?.length, 1);
    const text = formatExportResult(r);
    assert.match(text, /Print: a3/);
    assert.match(text, /presets a3, ig-portrait, story/);
  });

  it('writes only a shape sheet with checkOnly, covering every catalog shape', async () => {
    const root = await workspace(fluidPoster(), { format: 'a3' });
    const before = await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8');
    const r = await run(root, { shapeSheet: true, checkOnly: true });
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    assert.strictEqual(r.shapeSheet, '.open-design/fluid/exports/fluid-shapes.png');
    assert.deepStrictEqual(await fs.readdir(path.join(root, '.open-design/fluid/exports')), ['fluid-shapes.png']);
    assert.strictEqual(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'), before);
    const [w, h] = await pngSize(path.join(root, r.shapeSheet!));
    assert.ok(w > 1000 && h > 360, `${w}×${h}`);
    const shapes = new Set((r.findings ?? []).map((f) => f.shape).filter(Boolean));
    assert.ok(shapes.size >= 1);
    assert.match(formatExportResult(r), /only the shape sheet was written[\s\S]*Shape sheet:/);
  });

  it('combines rows and shapes, and caps the outputs', async () => {
    const root = await workspace(fluidPoster(), { format: 'a3' });
    await fs.writeFile(path.join(root, 'cities.csv'), 'title,when\nBerlin,Fri\nLisbon,Sat\n');
    const r = await run(root, { data: 'cities.csv', nameField: 'title', presets: ['ig-portrait', 'story'] });
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    assert.deepStrictEqual(
      r.files.map((f) => path.posix.basename(f.path)),
      ['fluid-berlin-ig-portrait.png', 'fluid-lisbon-ig-portrait.png', 'fluid-berlin-story.png', 'fluid-lisbon-story.png'],
    );
    await fs.writeFile(path.join(root, 'many.csv'), `title,when\n${Array.from({ length: 200 }, (_, i) => `T${i},x`).join('\n')}\n`);
    const capped = await run(root, { data: 'many.csv', presets: ['a3', 'a2', 'story'], browserPath: '/not/needed' });
    assert.ok(!capped.ok && /600 outputs, over the limit of 400/.test(capped.error), JSON.stringify(capped));
  });

  it('exports a print default shape as its print PDF when no preset or format is given', async () => {
    const root = await workspace(fluidPoster(), { format: 'poster-18x24', fluid: true });
    const r = await run(root, {});
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    assert.deepStrictEqual([r.mode, r.files[0].format, r.sizeSource], ['print-pdf', 'pdf', 'recorded-format']);
    const page = (await PDFDocument.load(await fs.readFile(path.join(root, r.files[0].path)))).getPage(0);
    assert.ok(Math.abs(page.getSize().width - mm(457.2 + 2 * 3.175)) < 0.5, String(page.getSize().width));
    assert.match(formatExportResult(r), /Print: poster-18x24/);
    const png = await run(root, { format: 'png' });
    assert.ok(png.ok && !('output' in png) && png.files[0].format === 'png', JSON.stringify(png));
  });

  it('resizes a fluid card the author sized some other way (width: 100%, no --od-w)', async () => {
    const html = `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%}
      .poster{width:100%;height:100%;container-type:size;overflow:hidden;background:#111;color:#fff;font-family:sans-serif;padding:8cqmin;box-sizing:border-box}
      h1{margin:0;font-size:10cqmin;background:#000}</style></head>
      <body><div class="poster" data-od-card data-od-fluid><h1>Shanghai Hackathon</h1></div></body></html>`;
    const root = await workspace(html, { format: 'a3' });
    const story = await run(root, { preset: 'story' });
    assert.ok(story.ok && !('output' in story), JSON.stringify(story));
    assert.deepStrictEqual(await pngSize(path.join(root, story.files[0].path)), [1080, 1920]);
    assert.ok(!(story.findings ?? []).some((f) => f.check === 'card-size' || f.check === 'fixed-size'), JSON.stringify(story.findings));
    const a3 = await run(root, { preset: 'a3' });
    assert.ok(a3.ok && !('output' in a3), JSON.stringify(a3));
    const page = (await PDFDocument.load(await fs.readFile(path.join(root, a3.files[0].path)))).getPage(0);
    assert.ok(Math.abs(page.getSize().width - mm(303)) < 0.5, String(page.getSize().width));
  });

  it('keeps fixed designs fixed: presets and shapeSheet are refused, and a different preset gets the adapt hint', async () => {
    const fixed = `<!doctype html><body style="margin:0"><div data-od-card style="width:1080px;height:1350px;background:#e33"><h1 style="margin:100px;font-size:80px">Hi</h1></div></body>`;
    const root = await workspace(fixed, { format: 'ig-portrait' });
    for (const o of [{ presets: ['story'] }, { shapeSheet: true }]) {
      const r = await run(root, o);
      assert.ok(!r.ok && r.code === 'invalid-args' && /adapt_open_design_artifact/.test(r.error), JSON.stringify(r));
    }
    const r = await run(root, { preset: 'story' });
    assert.ok(r.ok && !('output' in r), JSON.stringify(r));
    const size = r.findings?.find((f) => f.check === 'card-size');
    assert.ok(size && /fixed-size; use adapt_open_design_artifact/.test(size.message), JSON.stringify(r.findings));
  });
});
