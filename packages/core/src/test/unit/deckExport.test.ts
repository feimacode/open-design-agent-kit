import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
// jszip ships with pptxgenjs (it is how a .pptx is zipped); used here only to inspect the output.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');
import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'puppeteer-core';
import { findBrowser } from '../../export/browserDiscovery';
import { resolveExportMode, validateSlideNumbers } from '../../export/deck/captureDeck';
import { exportArtifact } from '../../export/exportArtifact';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

describe('resolveExportMode', () => {
  const base = { slideCount: 5 };
  it('routes registered decks to deck modes without a flag', () => {
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'pptx', kind: 'deck' }), { ok: true, mode: 'deck-pptx' });
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'pdf', renderer: 'deck-html', kind: 'html' }), { ok: true, mode: 'deck-pdf' });
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'png', kind: 'deck', slides: [2] }), { ok: true, mode: 'deck-images' });
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'png', kind: 'deck' }), { ok: true, mode: 'image' });
  });

  it('treats an html artifact from a deck skill with slides as a deck', () => {
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'pptx', kind: 'html', sourceSkillId: 'od:deck:guizang-ppt' }), { ok: true, mode: 'deck-pptx' });
  });

  it('keeps pages with .slide markup as pages, and refuses PPTX for them unless deck: true', () => {
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'pdf', kind: 'html', sourceSkillId: 'od:prototype:saas-landing' }), { ok: true, mode: 'page-pdf' });
    const pptx = resolveExportMode({ ...base, format: 'pptx', kind: 'html' });
    assert.ok(!pptx.ok && pptx.code === 'not-a-deck' && /deck: true/.test(pptx.error));
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'pptx', kind: 'html', deck: true }), { ok: true, mode: 'deck-pptx' });
    assert.deepStrictEqual(resolveExportMode({ ...base, format: 'pdf', kind: 'deck', deck: false }), { ok: true, mode: 'page-pdf' });
  });

  it('fails clearly for decks with no slides and for formats a kind cannot produce', () => {
    const none = resolveExportMode({ slideCount: 0, format: 'pdf', deck: true });
    assert.ok(!none.ok && none.code === 'no-slides');
    const md = resolveExportMode({ ...base, format: 'pdf', kind: 'markdown-document' });
    assert.ok(!md.ok && md.code === 'unsupported-format');
  });

  it('validates slide numbers against the deck', () => {
    assert.strictEqual(validateSlideNumbers([1, 3], 5), undefined);
    assert.match(validateSlideNumbers([7], 5)!, /1–5/);
  });
});

describe('deck export with a real browser (skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  let decoder: Browser | undefined;

  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    browserPath = found.executablePath;
    const { default: puppeteer } = await import('puppeteer-core');
    decoder = await puppeteer.launch({ executablePath: browserPath, headless: true });
  });
  after(async () => decoder?.close());

  /** Reads the RGB of one pixel of a PNG, by letting the browser decode it. */
  async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
    const page = await decoder!.newPage();
    try {
      return (await page.evaluate(
        `new Promise((resolve) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(${x}, ${y}, 1, 1).data; resolve([d[0], d[1], d[2]]); }; img.src = 'data:image/png;base64,${png.toString('base64')}'; })`,
      )) as [number, number, number];
    } finally {
      await page.close();
    }
  }

  const COLORS = ['#e11d48', '#16a34a', '#2563eb', '#f59e0b', '#9333ea'];
  const RGB = [
    [225, 29, 72],
    [22, 163, 74],
    [37, 99, 235],
    [245, 158, 11],
    [147, 51, 234],
  ];
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 3);

  function slidesHtml(style: string, n = 5, attrs = ''): string {
    return COLORS.slice(0, n)
      .map((c, i) => `<section class="slide${i === 0 ? ' active' : ''}"${attrs} style="background:${c}"><h1>Slide ${i + 1}</h1><p>${'Lorem ipsum dolor sit amet. '.repeat(20)}</p></section>`)
      .join('')
      .replace(/^/, `<!doctype html><html><head><style>body{margin:0;font:48px sans-serif;color:#fff}${style}</style></head><body>`)
      .concat('</body></html>');
  }

  async function workspace(html: string, manifest: Record<string, unknown>): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-deck-'));
    await fs.mkdir(path.join(root, '.open-design', 'deck'), { recursive: true });
    await fs.writeFile(path.join(root, '.open-design', 'deck', 'deck.html'), html);
    await writeArtifactManifest({
      workspaceRoot: root,
      entryPath: '.open-design/deck/deck.html',
      artifactManifest: { kind: 'deck', renderer: 'deck-html', exports: ['html'], title: 'Test deck', ...manifest },
    });
    return root;
  }
  const entryPath = '.open-design/deck/deck.html';

  const classToggled = slidesHtml('.slide{width:1920px;height:1080px;display:none}.slide.active{display:block}');

  it('exports a class-toggled 5-slide deck to a 16:9 PPTX with one image per slide', async () => {
    const root = await workspace(classToggled, {});
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'pptx', settleMs: 0, scale: 1 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual([result.mode, result.slideCount, result.viewport], ['deck-pptx', 5, { width: 1920, height: 1080 }]);
    assert.strictEqual(result.files[0].path, '.open-design/deck/exports/deck.pptx');
    const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, result.files[0].path)));
    const names = Object.keys(zip.files);
    assert.strictEqual(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 5);
    assert.strictEqual(names.filter((n) => /^ppt\/media\/.+/.test(n)).length, 5);
    const [, cx, cy] = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(await zip.file('ppt/presentation.xml').async('string'))!;
    assert.ok(Math.abs(Number(cx) / Number(cy) - 16 / 9) < 0.01, `slide size ${cx}x${cy} is not 16:9`);
  });

  it('exports each slide with its own content (class-toggled), numbered by slide', async () => {
    const root = await workspace(classToggled, {});
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'png', slides: [1, 3], settleMs: 0 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.files.map((f) => path.posix.basename(f.path)), ['deck-01.png', 'deck-03.png']);
    assert.ok(near(await pixel(await fs.readFile(path.join(root, result.files[0].path)), 1900, 1060), RGB[0]));
    assert.ok(near(await pixel(await fs.readFile(path.join(root, result.files[1].path)), 1900, 1060), RGB[2]));
  });

  it('rejects out-of-range slide numbers without writing files', async () => {
    const root = await workspace(classToggled, {});
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'png', slides: [7], settleMs: 0 });
    assert.ok(!result.ok && /1–5/.test(result.error));
    await assert.rejects(fs.access(path.join(root, '.open-design/deck/exports')));
  });

  it('keeps a 4:3 deck at 4:3 in the PDF', async () => {
    const root = await workspace(slidesHtml('.slide{width:1024px;height:768px;display:none}.slide.active{display:block}', 3), {});
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'pdf', settleMs: 0, scale: 1 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.viewport, { width: 1024, height: 768 });
    const pdf = await PDFDocument.load(await fs.readFile(path.join(root, result.files[0].path)));
    assert.strictEqual(pdf.getPageCount(), 3);
    const { width, height } = pdf.getPage(0).getSize();
    assert.ok(Math.abs(width / height - 4 / 3) < 0.01, `${width}x${height}`);
  });

  it('captures a carousel-strip deck (slides translated off-screen) slide by slide', async () => {
    const strip = slidesHtml(
      '.strip{display:flex;width:9600px;transform:translateX(0)}.slide{flex:none;width:1920px;height:1080px}',
    ).replace('<body>', '<body><div class="strip">').replace('</body>', '</div></body>');
    const root = await workspace(strip, {});
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'png', deck: true, settleMs: 0 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.files.length, 5);
    for (const [i, f] of result.files.entries()) {
      assert.ok(near(await pixel(await fs.readFile(path.join(root, f.path)), 1900, 1060), RGB[i]), `slide ${i + 1}`);
    }
  });

  it('captures a <deck-stage> deck that ships without its runtime, leaving the file untouched', async () => {
    const html =
      '<!doctype html><html><head><style>body{margin:0;font:48px sans-serif;color:#fff}</style></head><body><deck-stage width="1280" height="720">' +
      COLORS.slice(0, 3)
        .map((c, i) => `<section class="slide" style="width:1280px;height:720px;background:${c}"><h1>Slide ${i + 1}</h1></section>`)
        .join('') +
      '</deck-stage></body></html>';
    const root = await workspace(html, {});
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'png', deck: true, settleMs: 0 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.viewport, { width: 1280, height: 720 });
    for (const [i, f] of result.files.entries()) {
      assert.ok(near(await pixel(await fs.readFile(path.join(root, f.path)), 1270, 710), RGB[i]), `slide ${i + 1}`);
    }
    assert.strictEqual(await fs.readFile(path.join(root, entryPath), 'utf8'), html);
  });

  it('exports an ordinary page to a vector PDF with real text, even with .slide markup', async () => {
    const page = `<!doctype html><html><body><h1>Quarterly report</h1>${'<p>Revenue grew in every region this quarter.</p>'.repeat(80)}
      <div class="testimonials"><div class="slide">Great product</div><div class="slide">Love it</div></div></body></html>`;
    const root = await workspace(page, { kind: 'html', renderer: 'html', sourceSkillId: 'od:prototype:data-report' });
    const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'pdf', settleMs: 0 });
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.mode, 'page-pdf');
    const bytes = await fs.readFile(path.join(root, result.files[0].path));
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 2, 'paginated');
    // Chrome's PDF content streams are Flate-compressed; text is drawn with Tj/TJ operators.
    const raw = bytes.toString('latin1');
    let hasTextOps = false;
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
      try {
        if (/\bT[Jj]\b/.test(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'))) hasTextOps = true;
      } catch {
        // not a Flate stream (e.g. an image or font)
      }
    }
    assert.ok(hasTextOps, 'expected text-drawing operators, i.e. selectable text');
  });
});

describe('deck export smoke test over vendored deck examples (skipped when no browser is installed)', function () {
  this.timeout(300000);
  // One of each convention seen across the 54 vendored decks: `.slide` class
  // toggling, `data-screen-label` sections, <deck-stage>, authored 1280×720
  // stages, `.nav-hint` chrome, and plain decks.
  const EXAMPLES = [
    'deck-guizang-editorial',
    'deck-swiss-international',
    'deck-open-slide-canvas',
    'frontend-slides',
    'html-ppt-pitch-deck',
    'html-ppt-zhangzara-creative-mode',
    'html-ppt-zhangzara-pink-script',
    'html-ppt-zhangzara-retro-windows',
    'ppt-keynote',
    'simple-deck',
  ];
  const assetsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');
  let browserPath: string | undefined;

  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    browserPath = found.executablePath;
  });

  for (const id of EXAMPLES) {
    it(`${id} exports to PPTX with every slide captured and none blank`, async () => {
      const { copyExampleArtifact } = await import('../../workspace/remixExample');
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-deck-smoke-'));
      const entryPath = `.open-design/${id}/${id}.html`;
      await copyExampleArtifact({ assetsRoot, exampleArtifactPath: `examples/${id}/example.html`, workspaceRoot: root, entryPath });
      await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'deck', renderer: 'deck-html', exports: ['html'], title: id } });
      const result = await exportArtifact({ workspaceRoot: root, entryPath, browserPath, format: 'pptx', scale: 1 });
      assert.ok(result.ok, JSON.stringify(result));
      assert.ok(result.slideCount! >= 5, `only ${result.slideCount} slides found`);
      assert.deepStrictEqual(result.warnings.filter((w) => /looks blank/.test(w)), []);
      const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, result.files[0].path)));
      assert.strictEqual(Object.keys(zip.files).filter((n) => /^ppt\/media\/.+/.test(n)).length, result.slideCount);
    });
  }
});
