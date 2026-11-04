import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import * as ts from 'typescript';
import * as pageScripts from '../../export/deck/pageScripts';
import * as editablePageScripts from '../../export/deck/editablePageScripts';
import * as diagramPageScripts from '../../export/diagramPageScripts';
import * as inlinePageScripts from '../../export/inlinePageScripts';
import { findBrowser } from '../../export/browserDiscovery';
import * as posterPageScripts from '../../poster/pageScripts';
import type { PageFinding } from '../../poster/pageScripts';

// Browser/JS globals a page script may reference; anything else free in a
// function's source would be a closure over module scope, which breaks once
// the function is serialized into the page (and once a bundler minifies names).
const ALLOWED_GLOBALS = new Set([
  'document', 'window', 'requestAnimationFrame', 'Array', 'Number', 'Promise', 'Math', 'JSON', 'Object', 'String', 'Boolean',
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
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        (ts.isPropertyAssignment(p) && p.name === node) ||
        (ts.isShorthandPropertyAssignment(p) && false) ||
        (ts.isBindingElement(p) && p.propertyName === node);
      if (!isPropertyName) referenced.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...referenced].filter((name) => !declared.has(name) && !ALLOWED_GLOBALS.has(name));
}

describe('deck page scripts', () => {
  for (const [name, fn] of Object.entries(pageScripts)) {
    if (typeof fn !== 'function') continue;
    it(`${name} is self-contained once serialized`, () => {
      assert.deepStrictEqual(freeIdentifiers(fn.toString()), []);
    });
  }

  it('stays self-contained after esbuild minification (as in the VS Code bundle)', () => {
    const entry = path.resolve(__dirname, '..', '..', '..', 'src', 'export', 'deck', 'pageScripts.ts');
    const out = esbuild.buildSync({ entryPoints: [entry], bundle: true, minify: true, format: 'cjs', platform: 'node', write: false });
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
    const fns = Object.entries(mod.exports).filter(([, v]) => typeof v === 'function');
    assert.strictEqual(fns.length, 10);
    for (const [name, fn] of fns) assert.deepStrictEqual(freeIdentifiers((fn as () => void).toString()), [], name);
  });

  it('the check catches a closure over module scope', () => {
    assert.deepStrictEqual(freeIdentifiers('function f(a) { return helper(a) + a.x; }'), ['helper']);
  });
});

describe('editable PPTX page scripts', () => {
  for (const [name, fn] of Object.entries(editablePageScripts)) {
    if (typeof fn !== 'function') continue;
    it(`${name} is self-contained once serialized`, () => {
      assert.deepStrictEqual(freeIdentifiers(fn.toString()), []);
    });
  }

  it('stays self-contained after esbuild minification (as in the VS Code bundle)', () => {
    const entry = path.resolve(__dirname, '..', '..', '..', 'src', 'export', 'deck', 'editablePageScripts.ts');
    const out = esbuild.buildSync({ entryPoints: [entry], bundle: true, minify: true, format: 'cjs', platform: 'node', write: false });
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
    const fns = Object.entries(mod.exports).filter(([, v]) => typeof v === 'function');
    assert.strictEqual(fns.length, 3);
    for (const [name, fn] of fns) assert.deepStrictEqual(freeIdentifiers((fn as () => void).toString()), [], name);
  });
});

describe('diagram page scripts', () => {
  for (const [name, fn] of Object.entries(diagramPageScripts)) {
    if (typeof fn !== 'function') continue;
    it(`${name} is self-contained once serialized`, () => {
      assert.deepStrictEqual(freeIdentifiers(fn.toString()), []);
    });
  }

  it('stays self-contained after esbuild minification (as in the VS Code bundle)', () => {
    const entry = path.resolve(__dirname, '..', '..', '..', 'src', 'export', 'diagramPageScripts.ts');
    const out = esbuild.buildSync({ entryPoints: [entry], bundle: true, minify: true, format: 'cjs', platform: 'node', write: false });
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
    const fns = Object.entries(mod.exports).filter(([, v]) => typeof v === 'function');
    assert.strictEqual(fns.length, 2);
    for (const [name, fn] of fns) assert.deepStrictEqual(freeIdentifiers((fn as () => void).toString()), [], name);
  });
});

describe('email and paste page scripts', () => {
  for (const [name, fn] of Object.entries(inlinePageScripts)) {
    if (typeof fn !== 'function') continue;
    it(`${name} is self-contained once serialized`, () => {
      assert.deepStrictEqual(freeIdentifiers(fn.toString()), []);
    });
  }

  it('stays self-contained after esbuild minification (as in the VS Code bundle)', () => {
    const entry = path.resolve(__dirname, '..', '..', '..', 'src', 'export', 'inlinePageScripts.ts');
    const out = esbuild.buildSync({ entryPoints: [entry], bundle: true, minify: true, format: 'cjs', platform: 'node', write: false });
    const mod = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
    const fns = Object.entries(mod.exports).filter(([, v]) => typeof v === 'function');
    assert.strictEqual(fns.length, 2);
    for (const [name, fn] of fns) assert.deepStrictEqual(freeIdentifiers((fn as () => void).toString()), [], name);
  });
});

describe('taste checks in preflight (real browser; skipped when none is installed)', function () {
  this.timeout(60000);
  const FIXTURES = path.resolve(__dirname, '../../../src/test/fixtures/taste');
  const TASTE = ['slop-glow', 'card-row', 'uniform-surface', 'type-scale', 'intent'];
  let browser: import('puppeteer-core').Browser | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: found.executablePath, headless: true });
  });
  after(async () => browser?.close());

  const run = async (html: string): Promise<PageFinding[]> => {
    const page = await browser!.newPage();
    try {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'load' });
      return await page.evaluate(posterPageScripts.collectPreflight, { cardSelector: '[data-od-card]', print: false, bleedPx: 0, safeInsetPx: 0 });
    } finally {
      await page.close();
    }
  };
  const fixture = (name: string): Promise<string> => fs.readFile(path.join(FIXTURES, name), 'utf8');
  const codes = (findings: PageFinding[]): string[] => findings.filter((f) => TASTE.includes(f.check)).map((f) => f.check);

  for (const code of TASTE) {
    it(`${code}: the bad fixture reports it as a warning, the good one reports no taste finding`, async () => {
      const bad = await run(await fixture(`${code}-bad.html`));
      const hits = bad.filter((f) => f.check === code);
      assert.ok(hits.length > 0, JSON.stringify(bad));
      assert.ok(hits.every((f) => f.severity === 'warning' && f.selector));
      assert.deepStrictEqual(codes(await run(await fixture(`${code}-good.html`))), []);
    });
  }

  it('reports a row of identical feature cards once, not per card', async () => {
    assert.strictEqual((await run(await fixture('card-row-bad.html'))).filter((f) => f.check === 'card-row').length, 1);
  });

  it('names the size found and the nearest token for a heading off the scale, and the font for one off the families', async () => {
    const found = (await run(await fixture('type-scale-bad.html'))).filter((f) => f.check === 'type-scale');
    assert.match(found[0].message, /h1 "Annual report" is 57px.*nearest step is --text-3xl \(48px\)/);
    assert.match(found[1].message, /h2 "Highlights" is set in Impact/);
  });

  it('flags the destructive button and the primary styled like a secondary', async () => {
    const found = (await run(await fixture('intent-bad.html'))).filter((f) => f.check === 'intent');
    assert.deepStrictEqual(found.map((f) => f.selector), ['button.btn "Delete project"', 'button.btn "Save"']);
  });

  it('data-od-allow silences the listed codes for the element and everything inside it', async () => {
    const html = (await fixture('slop-glow-bad.html')).replace('<html>', '<html data-od-allow="slop-glow">');
    assert.deepStrictEqual(codes(await run(html)), []);
    const rows = (await fixture('card-row-bad.html')).replace('<section>', '<section data-od-allow="card-row">');
    assert.deepStrictEqual(codes(await run(rows)), []);
  });

  it('runs only slop-glow and intent on cards and slides', async () => {
    const html = (await fixture('card-row-bad.html')).replace('<body>', '<body><div data-od-card style="width:1200px;height:800px">').replace('</body>', '</div></body>');
    assert.deepStrictEqual(codes(await run(html)), []);
  });
});
