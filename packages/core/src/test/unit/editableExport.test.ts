import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { assembleEditablePptx, editableReport, formatEditableReport, textBoxRect } from '../../export/deck/assembleEditable';
import { isUniformPng, resolveExportMode } from '../../export/deck/captureDeck';
import type { EditableSlide, SlideScene } from '../../export/deck/slideScene';
import { exportArtifact } from '../../export/exportArtifact';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

function png(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Buffer {
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

async function slideXml(zip: any, n: number): Promise<string> {
  return zip.file(`ppt/slides/slide${n}.xml`).async('string');
}
async function slideRels(zip: any, n: number): Promise<string> {
  return zip.file(`ppt/slides/_rels/slide${n}.xml.rels`).async('string');
}

describe('editable PPTX: writer', () => {
  const black = { hex: '111111', alpha: 1 };
  const scene = (over: Partial<SlideScene>): SlideScene => ({
    background: { hex: 'FFFFFF', alpha: 1 },
    boxes: [],
    pictures: [],
    texts: [],
    flattened: [],
    uncovered: [],
    fonts: [],
    ...over,
  });

  it('writes native text, shapes, pictures, a background picture and notes on a widescreen slide', async () => {
    const slides: EditableSlide[] = [
      {
        number: 1,
        notes: 'Source: Q3 report',
        plate: { buffer: png(16, 9, (x) => [x * 10, 0, 0]), jpeg: false },
        scene: scene({
          texts: [
            {
              rect: { x: 100, y: 100, w: 400, h: 77 },
              runs: [{ text: 'Q3 results', font: 'Inter', size: 64, weight: 700, italic: false, underline: false, strike: false, color: black, letterSpacing: 2 }],
              align: 'left',
              lineHeight: 77,
              lines: 1,
            },
            {
              rect: { x: 100, y: 300, w: 800, h: 120 },
              runs: [
                { text: 'First line', font: 'Inter', size: 24, weight: 400, italic: true, underline: true, strike: false, color: black, letterSpacing: 0 },
                { text: 'Second line', breakBefore: true, font: 'Inter', size: 24, weight: 400, italic: false, underline: false, strike: false, color: { hex: '2563EB', alpha: 0.5 }, letterSpacing: 0 },
              ],
              align: 'center',
              lineHeight: 36,
              lines: 2,
            },
          ],
          boxes: [
            { z: 1, rect: { x: 80, y: 80, w: 600, h: 300 }, fill: { hex: 'F5F1EA', alpha: 1 }, radius: 12, line: { width: 1, color: black, dash: 'dash' } },
            { z: 3, rect: { x: 1000, y: 100, w: 80, h: 80 }, fill: { hex: 'E11D48', alpha: 1 }, radius: 40 },
          ],
          pictures: [{ z: 2, rect: { x: 1200, y: 600, w: 160, h: 90 }, data: `data:image/png;base64,${png(16, 9, () => [0, 200, 0]).toString('base64')}` }],
        }),
      },
    ];
    const buf = await assembleEditablePptx(slides, { title: 'T', stage: { w: 1920, h: 1080 } });
    const zip = await JSZip.loadAsync(buf);
    assert.match(await zip.file('ppt/presentation.xml').async('string'), /<p:sldSz cx="12192000" cy="6858000"/);
    const xml = await slideXml(zip, 1);
    // 64 px on a 1920 px stage across 13.333 in is 32 pt.
    assert.match(xml, /<a:rPr[^>]*sz="3200"[^>]*b="1"[^>]*>(?:(?!<\/a:rPr>).)*typeface="Inter"/s);
    assert.match(xml, /<a:t>Q3 results<\/a:t>/);
    assert.match(xml, /spc="100"/);
    assert.match(xml, /wrap="none"/);
    assert.match(xml, /wrap="square"/);
    assert.match(xml, /algn="ctr"/);
    assert.match(xml, /u="sng"/);
    // Two paragraphs, and never paragraph properties after a break (PowerPoint would offer to repair the file).
    assert.strictEqual((xml.match(/<a:t>(First|Second) line<\/a:t>/g) || []).length, 2);
    assert.ok(!/<a:br\/><a:pPr/.test(xml));
    assert.match(xml, /<a:alpha val="50000"\/>/);
    assert.match(xml, /prst="roundRect"/);
    assert.match(xml, /prst="ellipse"/);
    assert.match(xml, /prstDash val="dash"/);
    // Background picture first, then the box (z 1), the picture (z 2), the circle (z 3), then text.
    const order = ['<p:pic>', 'prst="roundRect"', '<p:pic>', 'prst="ellipse"', 'Q3 results'];
    let at = 0;
    for (const marker of order) {
      const i = xml.indexOf(marker, at);
      assert.ok(i >= at, `${marker} out of order`);
      at = i + 1;
    }
    assert.strictEqual((xml.match(/<p:pic>/g) || []).length, 2);
    const notes = Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    assert.ok((await zip.file(notes[0]).async('string')).includes('Source: Q3 report'));
  });

  it('uses a custom 13.333 in layout for other aspect ratios', async () => {
    const buf = await assembleEditablePptx([{ number: 1, scene: scene({}) }], { stage: { w: 1024, h: 768 } });
    const zip = await JSZip.loadAsync(buf);
    const [, cx, cy] = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(await zip.file('ppt/presentation.xml').async('string'))!;
    assert.ok(Math.abs(Number(cx) / Number(cy) - 4 / 3) < 0.01);
  });

  it('widens single lines and anchors them by alignment; keeps multi-line boxes', () => {
    const base = { runs: [], lineHeight: 20 };
    const round = (r: { x: number; y: number; w: number; h: number }) => ({ x: Math.round(r.x), y: r.y, w: Math.round(r.w), h: r.h });
    assert.deepStrictEqual(round(textBoxRect({ ...base, rect: { x: 100, y: 0, w: 100, h: 20 }, align: 'left', lines: 1 })), { x: 100, y: 0, w: 120, h: 20 });
    assert.deepStrictEqual(round(textBoxRect({ ...base, rect: { x: 100, y: 0, w: 100, h: 20 }, align: 'center', lines: 1 })), { x: 90, y: 0, w: 120, h: 20 });
    assert.deepStrictEqual(round(textBoxRect({ ...base, rect: { x: 100, y: 0, w: 100, h: 20 }, align: 'right', lines: 1 })), { x: 80, y: 0, w: 120, h: 20 });
    assert.deepStrictEqual(textBoxRect({ ...base, rect: { x: 100, y: 0, w: 300, h: 40 }, align: 'left', lines: 2 }), { x: 100, y: 0, w: 302, h: 40 });
  });

  it('reports counts, flattened parts and web fonts', () => {
    const report = editableReport([
      { number: 1, scene: scene({ texts: [{} as never], fonts: [{ name: 'Space Grotesk', webFont: true }] }) },
      { number: 4, scene: scene({ flattened: [{ reason: 'svg', label: '<svg>' }], fonts: [{ name: 'Arial', webFont: false }] }), plate: { buffer: Buffer.alloc(1), jpeg: true } },
    ]);
    assert.deepStrictEqual(report.slides[1], { number: 4, texts: 0, boxes: 0, pictures: 0, backgroundPicture: true, flattened: ['<svg> (svg)'], uncovered: [] });
    const text = formatEditableReport(report).join('\n');
    assert.match(text, /slide 4: <svg> \(svg\)/);
    assert.match(text, /Space Grotesk \(web font\)/);
  });

  it('tells a flat background picture from a real one', () => {
    assert.strictEqual(isUniformPng(png(200, 100, () => [10, 20, 30])), true);
    assert.strictEqual(isUniformPng(png(200, 100, (x) => (x > 150 ? [200, 0, 0] : [10, 20, 30]))), false);
  });

  it('routes editable PPTX to its own mode and refuses editable for other formats', async () => {
    assert.deepStrictEqual(resolveExportMode({ slideCount: 3, format: 'pptx', kind: 'deck', editable: true }), { ok: true, mode: 'deck-pptx-editable' });
    assert.deepStrictEqual(resolveExportMode({ slideCount: 3, format: 'pptx', kind: 'deck' }), { ok: true, mode: 'deck-pptx' });
    const r = await exportArtifact({ workspaceRoot: os.tmpdir(), entryPath: 'x.html', format: 'pdf', editable: true });
    assert.ok(!r.ok && r.code === 'invalid-args' && /pptx/.test(r.error), JSON.stringify(r));
  });
});

describe('editable PPTX export with a real browser (skipped when none is installed)', function () {
  this.timeout(180000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    browserPath = found.executablePath;
  });

  const photo = `data:image/png;base64,${png(40, 30, (x, y) => [x * 6, y * 8, 120]).toString('base64')}`;
  const deck = `<!doctype html><html><head><style>
    body{margin:0;font-family:Inter,Arial,sans-serif;color:#111}
    .slide{width:1600px;height:900px;position:relative;display:none;overflow:hidden;background:#fff}
    .slide.active{display:block}
    h1{position:absolute;left:80px;top:60px;margin:0;font-size:64px;font-weight:700;line-height:1.1}
    .lede{position:absolute;left:80px;top:200px;width:600px;margin:0;font-size:24px;line-height:36px}
    .faded{position:absolute;left:80px;top:330px;margin:0;font-size:20px;color:#000;opacity:.5}
    ul{position:absolute;left:80px;top:400px;margin:0;font-size:24px}
    .card{position:absolute;left:800px;top:200px;width:300px;height:160px;background:#fff;border:1px solid #333;border-radius:12px;padding:20px;box-sizing:border-box;font-size:22px}
    .accent{position:absolute;left:1150px;top:200px;width:300px;height:160px;border-left:6px solid #e11d48;padding:20px;box-sizing:border-box;font-size:22px}
    .tri{position:absolute;left:1500px;top:250px;width:0;height:0;border-top:18px solid transparent;border-bottom:18px solid transparent;border-left:24px solid #111}
    .grad{background:linear-gradient(135deg,#1e3a8a,#9333ea);color:#fff}
    .stamp{position:absolute;right:80px;top:80px;font-size:40px;transform:rotate(-12deg);border:4px solid #fff;padding:8px 20px}
    .avatar{position:absolute;left:80px;top:500px;width:200px;height:200px;border-radius:50%;overflow:hidden}
    .avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .hero{position:absolute;left:400px;top:500px;width:480px;height:270px;background:url("${photo}") center/cover no-repeat}
    svg{position:absolute;left:1000px;top:450px}
  </style></head><body>
    <section class="slide active">
      <h1>Q3 results</h1>
      <p class="lede">Revenue grew in every region.<br>Churn fell for the third quarter.</p>
      <p class="faded">Draft, not for distribution</p>
      <ul><li>EMEA up 12%</li><li>APAC up 9%</li></ul>
      <div class="card">Card text</div>
      <div class="accent">Accent text</div>
    </section>
    <section class="slide grad">
      <h1>Where we grew</h1>
      <div class="stamp">DRAFT</div>
      <div class="avatar"><img src="${photo}" alt=""></div>
      <div class="hero"></div>
      <svg width="400" height="200"><rect x="10" y="10" width="120" height="60" fill="#fff"/><text x="20" y="45">Node A</text><path d="M130 40 C 200 0, 250 100, 300 40" stroke="#fff" fill="none"/></svg>
    </section>
    <section class="slide"><h1>Thanks</h1><ol start="3"><li>Third step</li></ol><div class="tri"></div><aside class="notes">Close with the ask.</aside></section>
  </body></html>`;

  async function workspace(html: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-editable-'));
    await fs.mkdir(path.join(root, '.open-design', 'deck'), { recursive: true });
    await fs.writeFile(path.join(root, '.open-design', 'deck', 'deck.html'), html);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: '.open-design/deck/deck.html', artifactManifest: { kind: 'deck', renderer: 'deck-html', exports: ['html'], title: 'Editable test' } });
    return root;
  }
  const entryPath = '.open-design/deck/deck.html';

  it('rebuilds a deck as native text, shapes and pictures over background pictures', async () => {
    const root = await workspace(deck);
    await fs.mkdir(path.join(root, '.open-design', 'deck', 'exports'), { recursive: true });
    await fs.writeFile(path.join(root, '.open-design', 'deck', 'exports', 'deck.pptx'), 'picture version');
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'pptx', editable: true, settleMs: 0, scale: 1 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.mode, 'deck-pptx-editable');
    assert.strictEqual(result.files[0].path, '.open-design/deck/exports/deck-editable.pptx');
    assert.strictEqual(await fs.readFile(path.join(root, '.open-design', 'deck', 'exports', 'deck.pptx'), 'utf8'), 'picture version');
    assert.deepStrictEqual(result.warnings, []);
    const report = result.editable!;
    const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, result.files[0].path)));

    // Slide 1: plain colours, so no background picture; text, list bullets, the card and the accent bar are native.
    const s1 = await slideXml(zip, 1);
    for (const t of ['Q3 results', 'Revenue grew in every region.', 'Churn fell for the third quarter.', 'EMEA up 12%', 'Card text', 'Accent text']) assert.ok(s1.includes(`<a:t>${t}</a:t>`), t);
    assert.match(s1, /typeface="Inter"/);
    assert.match(s1, /prst="roundRect"/);
    assert.strictEqual(report.slides[0].boxes, 2);
    assert.strictEqual(report.slides[0].backgroundPicture, false);
    assert.ok(!/<p:pic>/.test(s1));
    assert.match(s1, /<a:buChar char="&#x2022;"\/>/);
    // Faded black text on white is written as the grey it looks like.
    assert.match(s1, /<a:t>Draft, not for distribution<\/a:t>/);
    assert.match(s1.slice(s1.lastIndexOf('<a:rPr', s1.indexOf('Draft, not'))), /^<a:rPr[^]*?srgbClr val="(7F7F7F|808080)"/);

    // Slide 2: gradient, rotated stamp and SVG on the background picture; the photo and the CSS background are pictures.
    const s2 = await slideXml(zip, 2);
    assert.ok(s2.includes('<a:t>Where we grew</a:t>'));
    assert.ok(!s2.includes('DRAFT') && !s2.includes('Node A'));
    assert.strictEqual(report.slides[1].backgroundPicture, true);
    assert.strictEqual(report.slides[1].pictures, 2);
    assert.ok(report.slides[1].flattened.some((f) => /DRAFT.*\(transformed\)/.test(f)), JSON.stringify(report.slides[1]));
    assert.ok(report.slides[1].flattened.some((f) => /\(svg\)/.test(f)));
    assert.strictEqual((s2.match(/<p:pic>/g) || []).length, 3);
    assert.match(await slideRels(zip, 2), /image/);

    // Slide 3: notes kept, not on the slide.
    // Slide 3: a numbered list starting at 3; the CSS triangle stays on the background picture, not a square.
    const s3 = await slideXml(zip, 3);
    assert.ok(!s3.includes('Close with the ask.'));
    assert.match(s3, /<a:buAutoNum type="arabicPeriod" startAt="3"\/>/);
    assert.strictEqual(report.slides[2].boxes, 0);
    assert.strictEqual(report.slides[2].backgroundPicture, true);
    const notes = await Promise.all(Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).map((n) => zip.file(n).async('string')));
    assert.strictEqual(notes.filter((x: string) => x.includes('Close with the ask.')).length, 1);

    assert.ok(report.slides.every((s) => s.uncovered.length === 0));
    assert.ok(report.fonts.some((f) => f.name === 'Inter'));
  });

  it('leaves the page as it was after each slide', async () => {
    const { default: puppeteer } = await import('puppeteer-core');
    const { readSlideScene, hideSceneObjects, restoreSceneObjects } = await import('../../export/deck/editablePageScripts');
    const browser = await puppeteer.launch({ executablePath: browserPath!, headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 900 });
      await page.setContent(deck, { waitUntil: 'load' });
      const before = await page.evaluate('document.body.innerHTML');
      await page.evaluate(readSlideScene, '.slide', '.thumb', 'aside.notes', 0, 1600, 900, 1);
      await page.evaluate(hideSceneObjects);
      assert.notStrictEqual(await page.evaluate('document.body.innerHTML'), before);
      await page.evaluate(restoreSceneObjects);
      assert.strictEqual(await page.evaluate('document.body.innerHTML'), before);
    } finally {
      await browser.close();
    }
  });
});

describe('editable PPTX smoke test over vendored deck examples (skipped when no browser is installed)', function () {
  this.timeout(300000);
  const EXAMPLES = ['deck-guizang-editorial', 'deck-swiss-international', 'html-ppt-zhangzara-creative-mode', 'ppt-keynote', 'simple-deck', 'html-ppt-pitch-deck'];
  const assetsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    browserPath = found.executablePath;
  });

  for (const id of EXAMPLES) {
    it(`${id}: every slide exports, with all visible text editable or listed as flattened`, async () => {
      const { copyExampleArtifact } = await import('../../workspace/remixExample');
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-editable-smoke-'));
      const entryPath = `.open-design/${id}/${id}.html`;
      await copyExampleArtifact({ assetsRoot, exampleArtifactPath: `examples/${id}/example.html`, workspaceRoot: root, entryPath });
      await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'deck', renderer: 'deck-html', exports: ['html'], title: id } });
      const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'pptx', editable: true, scale: 1 });
      assert.ok(result.ok, JSON.stringify(result));
      assert.strictEqual(result.editable!.slides.length, result.slideCount);
      assert.deepStrictEqual(result.warnings.filter((w) => /weren't made editable|looks blank/.test(w)), []);
      assert.ok(result.editable!.slides.reduce((n, s) => n + s.texts, 0) >= result.slideCount!, 'most slides have editable text');
    });
  }
});
