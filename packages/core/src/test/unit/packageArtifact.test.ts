import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exportArtifact } from '../../export/exportArtifact';
import { exportsForKind } from '../../export/exportFormats';
import { injectBadge, injectLinkPreviewTags, resolveBadge } from '../../export/shareDecorations';
import { analyzeSiteBundle } from '../../export/siteBundle';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/pitch/pitch.html';
// No browser anywhere: packaging formats must never look for one.
const NO_BROWSER = '/definitely/not/a/browser';

async function workspace(files: Record<string, string | Buffer>, manifest: Record<string, unknown> = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-package-'));
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content);
  }
  await writeArtifactManifest({
    workspaceRoot: root,
    entryPath: ENTRY,
    artifactManifest: { kind: 'html', renderer: 'html', exports: ['html', 'png', 'jpeg', 'pdf'], title: 'Pitch', ...manifest },
  });
  return root;
}

const read = (root: string, rel: string) => fs.readFile(path.join(root, rel), 'utf8');
const exists = (root: string, rel: string) => fs.access(path.join(root, rel)).then(() => true, () => false);

const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="./styles.css"></head>
<body><img src="assets/logo.svg" alt=""><script>const t = "</body>";</script></body></html>`;
const BASE_FILES = {
  [ENTRY]: PAGE,
  '.open-design/pitch/styles.css': 'body { background: url(./bg.png); }',
  '.open-design/pitch/bg.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  '.open-design/pitch/assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

describe('standalone export', () => {
  it('inlines local CSS and images into one file, without a browser, leaving the source untouched', async () => {
    const root = await workspace(BASE_FILES);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone', browserPath: NO_BROWSER });
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.output, '.open-design/pitch/exports/pitch.html');
    const html = await read(root, result.output);
    assert.ok(!/href="\.\/styles\.css"/.test(html), 'stylesheet link should be inlined');
    assert.match(html, /data:image\/png;base64,/);
    assert.match(html, /data:image\/svg\+xml;base64,/);
    assert.strictEqual(await read(root, ENTRY), PAGE);
    assert.strictEqual(result.badge, false);
    assert.ok(!html.includes('data-od-badge'));
  });

  it('records the export in the manifest without rewriting the exports list', async () => {
    const root = await workspace(BASE_FILES);
    await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone' });
    const manifest = JSON.parse(await read(root, `${ENTRY}.artifact.json`));
    assert.deepStrictEqual(manifest.exports, ['html', 'png', 'jpeg', 'pdf']);
    assert.strictEqual(manifest.metadata.exports[0].format, 'standalone');
  });

  it('leaves remote URLs in place and reports them', async () => {
    const root = await workspace({
      [ENTRY]: '<!doctype html><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><p>x</p>',
    });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone' });
    assert.ok(result.ok, JSON.stringify(result));
    assert.ok(result.externalDependencies.some((u) => u.startsWith('https://fonts.googleapis.com/')));
    assert.ok(result.warnings.some((w) => w.includes('fonts.googleapis.com')));
  });

  it('inlines @import chains and module imports', async () => {
    const root = await workspace({
      [ENTRY]: '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body><script type="module" src="main.js"></script></body></html>',
      '.open-design/pitch/a.css': '@import "b.css";',
      '.open-design/pitch/b.css': '.b { color: red }',
      '.open-design/pitch/main.js': 'import { x } from "./dep.js"; console.log(x);',
      '.open-design/pitch/dep.js': 'export const x = 42;',
    });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone' });
    assert.ok(result.ok, JSON.stringify(result));
    const html = await read(root, result.output);
    assert.match(html, /color: red/);
    // Modules are inlined as base64 import-map entries.
    const decoded = [...html.matchAll(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1]!, 'base64').toString('utf8'));
    assert.ok(decoded.includes('export const x = 42;'), decoded.join('\n'));
    assert.ok(html.indexOf('<!doctype html>') < html.indexOf('importmap'), 'import map goes inside the head, after the doctype');
  });

  it('fails on a missing local dependency, naming it, and writes nothing', async () => {
    const root = await workspace({ [ENTRY]: '<!doctype html><script src="./missing.js"></script>' });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone' });
    assert.ok(!result.ok && result.code === 'missing-references', JSON.stringify(result));
    assert.match(result.error, /missing\.js/);
    assert.ok(!(await exists(root, '.open-design/pitch/exports/pitch.html')));
  });

  it('refuses references that escape the workspace', async () => {
    const root = await workspace({ [ENTRY]: '<!doctype html><img src="../../../../../../etc/passwd">' });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone' });
    assert.ok(!result.ok && result.code === 'path-outside-workspace', JSON.stringify(result));
  });

  it('refuses a symlink that points outside the workspace', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'od-outside-'));
    await fs.writeFile(path.join(outside, 'secret.css'), 'body{}');
    const root = await workspace({ [ENTRY]: '<!doctype html><link rel="stylesheet" href="link.css">' });
    await fs.symlink(path.join(outside, 'secret.css'), path.join(root, '.open-design/pitch/link.css'));
    const standalone = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'standalone' });
    assert.ok(!standalone.ok && standalone.code === 'path-outside-workspace', JSON.stringify(standalone));
    const site = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(!site.ok && site.code === 'missing-references', JSON.stringify(site));
  });
});

describe('site export', () => {
  it('lays out index.html plus referenced files, without a browser', async () => {
    const root = await workspace(BASE_FILES);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site', browserPath: NO_BROWSER });
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.output, '.open-design/pitch/exports/site');
    assert.deepStrictEqual(result.files.map((f) => f.path).sort(), ['assets/logo.svg', 'bg.png', 'index.html', 'styles.css']);
    for (const f of ['index.html', 'styles.css', 'bg.png', 'assets/logo.svg']) assert.ok(await exists(root, `${result.output}/${f}`), f);
    assert.strictEqual(await read(root, ENTRY), PAGE);
  });

  it('includes files that local scripts import, statically or dynamically, but not bare specifiers', async () => {
    const root = await workspace({
      [ENTRY]: '<!doctype html><script type="module" src="app.js"></script><script type="module">import "./inline.js";</script>',
      '.open-design/pitch/app.js': 'import { x } from "./lib/dep.js"; import React from "react"; const m = () => import("./lazy.js");',
      '.open-design/pitch/lib/dep.js': 'export * from "./deeper.js";',
      '.open-design/pitch/lib/deeper.js': 'export const x = 1;',
      '.open-design/pitch/lazy.js': 'export default 1;',
      '.open-design/pitch/inline.js': '',
    });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.files.map((f) => f.path).sort(), ['app.js', 'index.html', 'inline.js', 'lazy.js', 'lib/deeper.js', 'lib/dep.js']);
  });

  it('adds the badge by default, before the real </body> only', async () => {
    const root = await workspace(BASE_FILES);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(result.ok);
    const html = await read(root, `${result.output}/index.html`);
    assert.strictEqual(html.match(/data-od-badge/g)?.length, 1);
    assert.ok(html.includes('const t = "</body>";'), 'script string must be unchanged');
    assert.ok(html.indexOf('data-od-badge') > html.indexOf('const t ='), 'badge goes before the real closing tag');
    assert.ok(!/<script[^>]+src="https?:/.test(html) && !/<link[^>]+href="https?:/.test(html), 'no remote requests added');
  });

  it('leaves the badge out with badge: false', async () => {
    const root = await workspace(BASE_FILES);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site', badge: false });
    assert.ok(result.ok);
    assert.ok(!(await read(root, `${result.output}/index.html`)).includes('data-od-badge'));
  });

  it('replaces the previous bundle, dropping files no longer referenced', async () => {
    const root = await workspace(BASE_FILES);
    await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    await fs.writeFile(path.join(root, ENTRY), '<!doctype html><p>no images now</p>');
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(result.ok);
    assert.ok(!(await exists(root, `${result.output}/assets/logo.svg`)));
    const leftovers = (await fs.readdir(path.join(root, '.open-design/pitch/exports'))).filter((n) => n.startsWith('.site-'));
    assert.deepStrictEqual(leftovers, []);
  });

  it('fails with missing-references and leaves no partial bundle', async () => {
    const root = await workspace({ [ENTRY]: '<!doctype html><img src="gone.png"><img src="also-gone.png">' });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(!result.ok && result.code === 'missing-references');
    assert.match(result.error, /gone\.png/);
    assert.match(result.error, /also-gone\.png/);
    assert.ok(!(await exists(root, '.open-design/pitch/exports/site')));
  });

  it('roots the bundle at the shared folder when the page uses ../ files, rewriting index.html', async () => {
    const root = await workspace({
      [ENTRY]: '<!doctype html><link rel="stylesheet" href="../shared/theme.css"><img src="hero.png">',
      '.open-design/shared/theme.css': 'body{}',
      '.open-design/pitch/hero.png': 'png',
    });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.files.map((f) => f.path).sort(), ['index.html', 'pitch/hero.png', 'shared/theme.css']);
    const html = await read(root, `${result.output}/index.html`);
    assert.match(html, /href="shared\/theme\.css"/);
    assert.match(html, /src="pitch\/hero\.png"/);
  });

  it('adds link-preview tags, keeps author tags, and emits og:image only with a base URL', async () => {
    const files = {
      ...BASE_FILES,
      [ENTRY]: '<!doctype html><html><head><meta property="og:title" content="Mine"></head><body></body></html>',
      '.open-design/pitch/exports/pitch.png': 'png',
    };
    const root = await workspace(files);
    const first = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(first.ok);
    let html = await read(root, `${first.output}/index.html`);
    assert.strictEqual(html.match(/og:title/g)?.length, 1);
    assert.match(html, /content="Mine"/);
    assert.match(html, /og:description/);
    assert.ok(!html.includes('og:image'));
    assert.ok(await exists(root, `${first.output}/og.png`));

    const second = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site', baseUrl: 'https://pitch-abc.netlify.app/' });
    assert.ok(second.ok);
    html = await read(root, `${second.output}/index.html`);
    assert.match(html, /property="og:image" content="https:\/\/pitch-abc\.netlify\.app\/og\.png"/);
  });

  it('rejects packaging formats for kinds that are not pages', async () => {
    const root = await workspace(BASE_FILES, { kind: 'svg', renderer: 'svg', exports: ['svg'] });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site' });
    assert.ok(!result.ok && result.code === 'unsupported-format');
    assert.match(result.error, /svg, png, jpeg/);
  });

  it('rejects capture-only arguments on packaging formats', async () => {
    const root = await workspace(BASE_FILES);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'site', selector: '.x' });
    assert.ok(!result.ok && result.code === 'invalid-args');
  });
});

describe('share decorations', () => {
  it('resolves the badge: argument, env, setting, then format default', () => {
    assert.strictEqual(resolveBadge('site', undefined, undefined, undefined), true);
    assert.strictEqual(resolveBadge('standalone', undefined, undefined, undefined), false);
    assert.strictEqual(resolveBadge('site', false, '1', true), false);
    assert.strictEqual(resolveBadge('standalone', undefined, 'true', false), true);
    assert.strictEqual(resolveBadge('site', undefined, '0', true), false);
    assert.strictEqual(resolveBadge('site', undefined, undefined, false), false);
    assert.strictEqual(resolveBadge('standalone', undefined, undefined, true), false);
  });

  it('appends the badge when there is no closing body tag', () => {
    assert.ok(injectBadge('<p>x</p>').endsWith('</aside>'));
  });

  it('adds a title and preview tags when the page has no head', () => {
    const html = injectLinkPreviewTags('<!doctype html><p>x</p>', { title: 'A & B', hasImage: false });
    assert.match(html, /^<!doctype html>\n<title>A &amp; B<\/title>/);
    assert.match(html, /twitter:card" content="summary"/);
  });
});

describe('site preflight', () => {
  it('flags missing doctype/viewport, remote scripts and styles, large files and dot-folders', () => {
    const html = '<script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="//cdn.example/x.css">';
    const { warnings, totalBytes } = analyzeSiteBundle({
      entryPath: ENTRY,
      html,
      files: [
        { bundlePath: 'index.html', bytes: 3 * 1024 * 1024 },
        { bundlePath: 'video.mp4', bytes: 6 * 1024 * 1024 },
        { bundlePath: '.hidden/x.png', bytes: 1 },
      ],
    });
    const codes = warnings.map((w) => w.code).sort();
    assert.deepStrictEqual(codes, ['external-script', 'external-stylesheet', 'hidden-path', 'large-asset', 'large-html', 'no-doctype', 'no-viewport']);
    assert.strictEqual(totalBytes, 9 * 1024 * 1024 + 1);
    assert.ok(warnings.find((w) => w.code === 'external-script')?.url === 'https://cdn.tailwindcss.com');
  });

  it('accepts a doctype after a leading comment, but not one inside a script', () => {
    const ok = analyzeSiteBundle({ entryPath: ENTRY, html: '<!-- hi --><!doctype html><meta name="viewport" content="x">', files: [] });
    assert.deepStrictEqual(ok.warnings, []);
    const bad = analyzeSiteBundle({ entryPath: ENTRY, html: '<script>"<!doctype html>"</script><meta name="viewport" content="x">', files: [] });
    assert.deepStrictEqual(bad.warnings.map((w) => w.code), ['no-doctype']);
  });
});

describe('packaging formats in manifests', () => {
  it('lists standalone and site for page kinds only', () => {
    assert.deepStrictEqual(exportsForKind('html'), ['html', 'standalone', 'site', 'png', 'jpeg', 'pdf']);
    assert.deepStrictEqual(exportsForKind('deck'), ['html', 'standalone', 'site', 'png', 'jpeg', 'pdf', 'pptx']);
    assert.ok(!exportsForKind('svg')!.includes('site'));
  });
});
