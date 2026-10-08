import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import * as ts from 'typescript';
import { findBrowser } from '../../export/browserDiscovery';
import { adaptArtifact, formatAdaptResult } from '../../generation/adaptInstructions';
import * as posterPageScripts from '../../poster/pageScripts';
import { createArtifactQrCode, decodeQrPng, formatQrCodeResult } from '../../poster/qr';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import { listCollections } from '../../workspace/collectionScan';

const ENTRY = '.open-design/launch/launch.html';

async function workspace(manifest: Record<string, unknown> | null = { kind: 'html', renderer: 'html', exports: ['html'], title: 'Launch' }): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-poster-tools-'));
  await fs.mkdir(path.join(root, '.open-design', 'launch'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), '<!doctype html><div data-od-card><h1 data-od-field="name">Hi</h1></div>');
  if (manifest) await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: manifest });
  return root;
}

describe('create_open_design_qr_code', () => {
  it('writes an SVG asset, lists it once in supportingFiles, and returns inline markup', async () => {
    const root = await workspace();
    const result = await createArtifactQrCode({ workspaceRoot: root, entryPath: ENTRY, text: 'https://example.com/register', name: 'Register QR' });
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.workspacePath, '.open-design/launch/assets/register-qr.svg');
    const svg = await fs.readFile(path.join(root, result.workspacePath), 'utf8');
    assert.match(svg, /^<svg data-od-qr="https:\/\/example.com\/register"/);
    await createArtifactQrCode({ workspaceRoot: root, entryPath: ENTRY, text: 'https://example.com/register', name: 'register-qr' });
    const manifest = JSON.parse(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'));
    assert.deepStrictEqual(manifest.supportingFiles, ['assets/register-qr.svg']);
    const text = formatQrCodeResult(result);
    assert.match(text, /errorCorrection "H"/);
    assert.ok(text.includes(result.svg));
  });

  it('rejects unregistered artifacts and bad options', async () => {
    const root = await workspace(null);
    const unregistered = await createArtifactQrCode({ workspaceRoot: root, entryPath: ENTRY, text: 'x' });
    assert.ok(!unregistered.ok && /isn't registered/.test(unregistered.error));
    const empty = await createArtifactQrCode({ workspaceRoot: root, entryPath: ENTRY, text: '' });
    assert.ok(!empty.ok);
    const escape = await createArtifactQrCode({ workspaceRoot: root, entryPath: '../outside.html', text: 'x' });
    assert.ok(!escape.ok && /escapes the workspace/.test(escape.error));
  });

  describe('with a real browser (skipped when none is installed)', function () {
    this.timeout(60000);
    it('round-trips: the rendered SVG decodes to its text', async function () {
      const found = await findBrowser();
      if (!found.ok) return this.skip();
      const root = await workspace();
      const result = await createArtifactQrCode({ workspaceRoot: root, entryPath: ENTRY, text: 'https://example.com/a?b=1&c=ü' });
      assert.ok(result.ok);
      const { default: puppeteer } = await import('puppeteer-core');
      const browser = await puppeteer.launch({ executablePath: found.executablePath, headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(`<body style="margin:0"><div style="width:240px">${result.svg}</div></body>`);
        const handle = await page.$('svg');
        assert.strictEqual(decodeQrPng(Buffer.from(await handle!.screenshot({ type: 'png' }))), 'https://example.com/a?b=1&c=ü');
      } finally {
        await browser.close();
      }
    });
  });
});

describe('adapt_open_design_artifact', () => {
  it('returns one recomposition per format and puts the master in a new collection', async () => {
    const root = await workspace({ kind: 'html', renderer: 'html', exports: ['html'], title: 'Launch', sourceSkillId: 'od:prototype:poster-hero', metadata: { format: 'a3' } });
    const result = await adaptArtifact({ workspaceRoot: root, outputDir: '.open-design', entryPath: ENTRY, formats: ['ig-portrait', 'story', 'a2'], notes: 'Keep the orange.' });
    assert.ok(result.ok && result.mode === 'new-file', JSON.stringify(result));
    assert.strictEqual(result.collectionId, 'launch-formats');
    assert.ok(result.adaptations.every((a) => a.mode === 'new-file'));
    assert.deepStrictEqual(
      result.adaptations.map((a) => a.suggestedEntryPath),
      ['.open-design/launch/launch-ig-portrait.html', '.open-design/launch/launch-story.html', '.open-design/launch/launch-a2.html'],
    );
    const story = result.adaptations[1];
    assert.deepStrictEqual(story.registerArgs, {
      entryPath: '.open-design/launch/launch-story.html',
      kind: 'html',
      title: 'Launch — Story / Reels / TikTok cover',
      collectionId: 'launch-formats',
      collectionName: 'Launch',
      screenIndex: 2,
      screenRole: 'story',
      format: 'story',
      sourceSkillId: 'od:prototype:poster-hero',
    });
    for (const needle of ['Keep the orange.', '1080×1920 px', 'Re-compose, don\'t scale', 'data-od-field', 'Print to screen', 'data-od-field="name"']) {
      assert.ok(story.instructions.includes(needle), needle);
    }
    assert.ok(!result.adaptations[2].instructions.includes('Print to screen'));
    const master = JSON.parse(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'));
    assert.deepStrictEqual([master.collectionId, master.screenRole, master.screenIndex], ['launch-formats', 'master', 0]);

    // Register the adaptations as instructed: the collection scan sees master + three.
    for (const a of result.adaptations) {
      await fs.writeFile(path.join(root, a.suggestedEntryPath!), '<!doctype html>');
      const { entryPath, format, ...rest } = a.registerArgs as Record<string, unknown> & { entryPath: string; format: string };
      await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { ...rest, renderer: 'html', exports: ['html'], metadata: { format } } });
    }
    const collections = await listCollections(root, '.open-design');
    assert.deepStrictEqual(collections.map((c) => [c.collectionId, c.screens.length]), [['launch-formats', 4]]);
    assert.match(formatAdaptResult(result), /role "master"/);
  });

  it('reuses an existing collection without touching the master manifest', async () => {
    const root = await workspace({ kind: 'html', renderer: 'html', exports: ['html'], title: 'Launch', collectionId: 'campaign', collectionName: 'Campaign', screenRole: 'hero' });
    const before = await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8');
    const result = await adaptArtifact({ workspaceRoot: root, outputDir: '.open-design', entryPath: ENTRY, formats: ['x-image'] });
    assert.ok(result.ok && result.mode === 'new-file' && !result.assignedCollection);
    assert.strictEqual(result.adaptations[0].registerArgs!.collectionId, 'campaign');
    assert.strictEqual(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'), before);
  });

  it('returns in-place tuning for a fluid master and leaves its manifest alone', async () => {
    const root = await workspace();
    await fs.writeFile(path.join(root, ENTRY), '<!doctype html><div data-od-card data-od-fluid><h1 data-od-field="name">Hi</h1></div>');
    const before = await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8');
    const result = await adaptArtifact({ workspaceRoot: root, outputDir: '.open-design', entryPath: ENTRY, formats: ['story', 'x-image'], notes: 'Bigger headline on Stories.' });
    assert.ok(result.ok && result.mode === 'tune', JSON.stringify(result));
    const [story, x] = result.adaptations;
    assert.deepStrictEqual([story.mode, story.suggestedEntryPath, story.registerArgs], ['tune', undefined, undefined]);
    for (const needle of ["Don't create a new file", '"preset": "story", "checkOnly": true', '@container (aspect-ratio < 0.6)', 'tall band', 'Bigger headline on Stories.', '"shapeSheet": true, "checkOnly": true', 'data-od-field="name"']) {
      assert.ok(story.instructions.includes(needle), needle);
    }
    assert.ok(x.instructions.includes('@container (aspect-ratio > 1.2)') && x.instructions.includes('`yt-thumbnail`'));
    assert.strictEqual(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'), before);
    assert.match(formatAdaptResult(result), /no new files/);
  });

  it('rejects unregistered masters, unknown, duplicate or too many formats', async () => {
    const root = await workspace(null);
    const unregistered = await adaptArtifact({ workspaceRoot: root, outputDir: '.open-design', entryPath: ENTRY, formats: ['story'] });
    assert.ok(!unregistered.ok && /register_open_design_artifact first/.test(unregistered.error));
    const r2 = await workspace();
    for (const [formats, re] of [
      [['a7'], /Valid format ids/],
      [['story', 'story'], /listed twice/],
      [[], /1–6/],
      [['a0', 'a1', 'a2', 'a3', 'a4', 'story', 'x-image'], /1–6/],
    ] as Array<[string[], RegExp]>) {
      const r = await adaptArtifact({ workspaceRoot: r2, outputDir: '.open-design', entryPath: ENTRY, formats });
      assert.ok(!r.ok && re.test(r.error), JSON.stringify(r));
    }
  });
});

// Same check as the deck page scripts: functions serialized into the page may only reference browser globals.
const ALLOWED_GLOBALS = new Set([
  'document', 'window', 'getComputedStyle', 'Image', 'parseFloat', 'Array', 'Number', 'Promise', 'Math', 'JSON', 'Object', 'String', 'Boolean',
  'undefined', 'NaN', 'Infinity', 'Set', 'Map',
]);

function freeIdentifiers(source: string): string[] {
  const file = ts.createSourceFile('fn.js', `(${source})`, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const declared = new Set<string>();
  const referenced = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) declared.add(node.name.text);
    if (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) {
      const collect = (n: ts.BindingName): void => {
        if (ts.isIdentifier(n)) declared.add(n.text);
        else n.elements.forEach((e) => !ts.isOmittedExpression(e) && collect(e.name));
      };
      collect(node.name);
    }
    if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) declared.add(node.variableDeclaration.name.text);
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isPropertyName = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node) || (ts.isBindingElement(p) && p.propertyName === node);
      if (!isPropertyName) referenced.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...referenced].filter((name) => !declared.has(name) && !ALLOWED_GLOBALS.has(name));
}

describe('poster page scripts', () => {
  const fns = Object.entries(posterPageScripts).filter(([, v]) => typeof v === 'function') as unknown as Array<[string, () => void]>;

  it('exports the seven page scripts', () => {
    assert.deepStrictEqual(fns.map(([n]) => n).sort(), ['applyShape', 'bindRow', 'collectHorizontalScroll', 'collectPreflight', 'fitBoundText', 'isolateCardForPrint', 'measureScalables']);
  });

  for (const [name, fn] of fns) {
    it(`${name} is self-contained once serialized`, () => {
      assert.deepStrictEqual(freeIdentifiers(fn.toString()), []);
    });
  }

  it('binds a row: text with line breaks, img src, a href and QR markup', async function () {
    this.timeout(60000);
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath: found.executablePath, headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<p data-od-field="when">x</p><img data-od-field="photo" srcset="a.png 2x"><a data-od-field="url" href="#">Link</a><div data-od-qr-field="url"></div>');
      const bound = await page.evaluate(posterPageScripts.bindRow, { when: 'Friday\n7 pm <b>', photo: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', url: 'https://example.com' }, { url: '<svg></svg>' });
      assert.strictEqual(bound, 4);
      const html = await page.evaluate('document.body.innerHTML');
      assert.match(String(html), /<p data-od-field="when">Friday<br>7 pm &lt;b&gt;<\/p>/);
      assert.match(String(html), /<img data-od-field="photo" src="data:image\/gif[^"]*" loading="eager">/);
      assert.match(String(html), /<a data-od-field="url" href="https:\/\/example.com">Link<\/a>/);
      assert.match(String(html), /<div data-od-qr-field="url" data-od-qr="https:\/\/example.com"><svg><\/svg><\/div>/);
    } finally {
      await browser.close();
    }
  });

  it('stays self-contained after esbuild minification (as in the VS Code bundle)', () => {
    const entry = path.resolve(__dirname, '..', '..', '..', 'src', 'poster', 'pageScripts.ts');
    const out = esbuild.buildSync({ entryPoints: [entry], bundle: true, minify: true, format: 'cjs', platform: 'node', write: false });
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
    const minified = Object.entries(mod.exports).filter(([, v]) => typeof v === 'function');
    assert.strictEqual(minified.length, 7);
    for (const [name, fn] of minified) assert.deepStrictEqual(freeIdentifiers((fn as () => void).toString()), [], name);
  });
});
