import * as assert from 'node:assert';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import * as ts from 'typescript';
import * as pageScripts from '../../export/deck/pageScripts';

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
    assert.strictEqual(fns.length, 7);
    for (const [name, fn] of fns) assert.deepStrictEqual(freeIdentifiers((fn as () => void).toString()), [], name);
  });

  it('the check catches a closure over module scope', () => {
    assert.deepStrictEqual(freeIdentifiers('function f(a) { return helper(a) + a.x; }'), ['helper']);
  });
});
