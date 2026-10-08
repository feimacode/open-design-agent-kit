import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inlineLocalFrames, injectPreviewBase, injectScriptNonce, loadExampleHtml, localRelativePath } from '../../content/exampleHtml';

async function makeExample(files: Record<string, string>): Promise<{ assetsRoot: string; entryPath: string }> {
  const assetsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-examplehtml-'));
  const exampleDir = path.join(assetsRoot, 'examples', 'demo');
  await fs.mkdir(exampleDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(exampleDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return { assetsRoot, entryPath: 'examples/demo/example.html' };
}

describe('loadExampleHtml', () => {
  it('returns a self-contained example unchanged', async () => {
    const html = '<!doctype html><html><body><h1>hi</h1></body></html>';
    const { assetsRoot, entryPath } = await makeExample({ 'example.html': html });
    assert.strictEqual(await loadExampleHtml(assetsRoot, entryPath), html);
  });

  it('unwraps an iframe-only shell and serves the referenced file instead', async () => {
    const shell = '<!doctype html><html><body><iframe src="./assets/template.html"></iframe></body></html>';
    const inner = '<!doctype html><html><body><h1>real content</h1></body></html>';
    const { assetsRoot, entryPath } = await makeExample({
      'example.html': shell,
      'assets/template.html': inner,
    });
    assert.strictEqual(await loadExampleHtml(assetsRoot, entryPath), inner);
  });

  it('leaves an iframe shell as-is when the referenced file is missing', async () => {
    const shell = '<!doctype html><html><body><iframe src="./assets/template.html"></iframe></body></html>';
    const { assetsRoot, entryPath } = await makeExample({ 'example.html': shell });
    assert.strictEqual(await loadExampleHtml(assetsRoot, entryPath), shell);
  });

  it('inlines a sibling <script src="assets/*.js"> reference', async () => {
    const html = '<!doctype html><html><head><script src="assets/deck-stage.js"></script></head><body></body></html>';
    const { assetsRoot, entryPath } = await makeExample({
      'example.html': html,
      'assets/deck-stage.js': 'customElements.define("x", class {});',
    });
    const result = await loadExampleHtml(assetsRoot, entryPath);
    assert.ok(result.includes('<script>customElements.define("x", class {});</script>'), result);
    assert.ok(!result.includes('src="assets/deck-stage.js"'), result);
  });

  it('inlines a sibling <link href="assets/*.css"> reference as a <style> tag', async () => {
    const html = '<!doctype html><html><head><link rel="stylesheet" href="assets/styles.css" /></head><body></body></html>';
    const { assetsRoot, entryPath } = await makeExample({
      'example.html': html,
      'assets/styles.css': 'body { color: red; }',
    });
    const result = await loadExampleHtml(assetsRoot, entryPath);
    assert.ok(result.includes('<style>body { color: red; }</style>'), result);
    assert.ok(!result.includes('href="assets/styles.css"'), result);
  });

  it('leaves a sibling script reference as-is when the file is missing', async () => {
    const html = '<script src="assets/missing.js"></script>';
    const { assetsRoot, entryPath } = await makeExample({ 'example.html': html });
    assert.strictEqual(await loadExampleHtml(assetsRoot, entryPath), html);
  });
});

describe('injectScriptNonce', () => {
  it('adds a nonce to a plain inline <script> tag', () => {
    const result = injectScriptNonce('<script>doStuff();</script>', 'abc123');
    assert.strictEqual(result, '<script nonce="abc123">doStuff();</script>');
  });

  it('adds a nonce to an inline <script type="module"> tag', () => {
    const result = injectScriptNonce('<script type="module">import x from "y";</script>', 'abc123');
    assert.strictEqual(result, '<script nonce="abc123" type="module">import x from "y";</script>');
  });

  it('adds a nonce to an external <script src="..."> tag', () => {
    const result = injectScriptNonce('<script src="https://cdn.example.com/lib.js"></script>', 'abc123');
    assert.strictEqual(result, '<script nonce="abc123" src="https://cdn.example.com/lib.js"></script>');
  });

  it('does not double-add a nonce to a tag that already has one', () => {
    const result = injectScriptNonce('<script nonce="existing">doStuff();</script>', 'abc123');
    assert.strictEqual(result, '<script nonce="existing">doStuff();</script>');
  });

  it('handles multiple script tags in one document', () => {
    const result = injectScriptNonce('<script>a();</script><p>x</p><script>b();</script>', 'n1');
    assert.strictEqual(result, '<script nonce="n1">a();</script><p>x</p><script nonce="n1">b();</script>');
  });
});

describe('injectPreviewBase', () => {
  const BASE = 'https://file+.vscode-resource.vscode-cdn.net/ws/.open-design/x/';
  it('puts a preview-only base first in <head>', () => {
    assert.strictEqual(
      injectPreviewBase('<!doctype html><html><head lang="en"><title>t</title></head><body><iframe src="a.html"></iframe></body></html>', BASE),
      `<!doctype html><html><head lang="en"><base href="${BASE}" data-od-preview-only><title>t</title></head><body><iframe src="a.html"></iframe></body></html>`,
    );
  });
  it('adds a head when the document has none, and handles bare fragments', () => {
    assert.strictEqual(injectPreviewBase('<html><body>x</body></html>', BASE), `<html><head><base href="${BASE}" data-od-preview-only></head><body>x</body></html>`);
    assert.strictEqual(injectPreviewBase('<!DOCTYPE html><p>x</p>', BASE), `<!DOCTYPE html><base href="${BASE}" data-od-preview-only><p>x</p>`);
    assert.strictEqual(injectPreviewBase('<p>x</p>', BASE), `<base href="${BASE}" data-od-preview-only><p>x</p>`);
  });
  it("keeps a document's own base, and does not mistake <header> for <head>", () => {
    const own = '<html><head><base href="https://example.com/"></head></html>';
    assert.strictEqual(injectPreviewBase(own, BASE), own);
    assert.strictEqual(injectPreviewBase('<html><header>h</header></html>', BASE), `<html><head><base href="${BASE}" data-od-preview-only></head><header>h</header></html>`);
  });
});

describe('inlineLocalFrames', () => {
  const files: Record<string, string> = {
    'a.html': '<p>A & "B"</p>',
    'sub/b.html': '<iframe src="c.html"></iframe>',
    'sub/c.html': '<p>C</p>',
  };
  const read = async (rel: string) => {
    const norm = rel.replace(/^\.\//, '');
    return norm in files ? { html: files[norm], resolvedPath: `/ws/${norm}` } : undefined;
  };
  const prep = (html: string, p: string) => `[${p}]${html}`;

  it('fills local frames with their file as escaped srcdoc, keeping src, and skips the rest', async () => {
    const html = '<iframe src="a.html" title="t"></iframe><iframe src="https://x.test/a.html"></iframe><iframe src="missing.html"></iframe><iframe src="a.html" srcdoc="own"></iframe>';
    const out = await inlineLocalFrames(html, read, prep);
    assert.strictEqual(
      out,
      '<iframe src="a.html" title="t" srcdoc="[/ws/a.html]<p>A &amp; &quot;B&quot;</p>" data-od-preview-srcdoc></iframe><iframe src="https://x.test/a.html"></iframe><iframe src="missing.html"></iframe><iframe src="a.html" srcdoc="own"></iframe>',
    );
  });

  it('resolves nested frames against the framing file, up to the depth limit', async () => {
    const out = await inlineLocalFrames('<iframe src="sub/b.html"></iframe>', read, prep);
    assert.match(out, /srcdoc="\[\/ws\/sub\/b\.html\]<iframe src=&quot;c\.html&quot; srcdoc=&quot;\[\/ws\/sub\/c\.html\]<p>C<\/p>&quot; data-od-preview-srcdoc><\/iframe>"/);
    const shallow = await inlineLocalFrames('<iframe src="sub/b.html"></iframe>', read, prep, 1);
    assert.ok(!/c\.html&quot; srcdoc/.test(shallow));
  });

  it('only treats plain relative paths as local', () => {
    assert.strictEqual(localRelativePath('dir/x%20y.html?v=1#top'), 'dir/x y.html');
    for (const ref of ['#a', '/abs.html', 'https://x', 'data:text/html,x', 'mailto:a@b', '']) assert.strictEqual(localRelativePath(ref), undefined, ref);
  });
});
