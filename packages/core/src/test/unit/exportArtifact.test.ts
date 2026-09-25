import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { captureWithinBudget, exportArtifact, exportFilePath, mergeExportRecords } from '../../export/exportArtifact';
import { parseAspectHint, resolveExportSize } from '../../export/exportSize';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

describe('export sizing', () => {
  it('parses the first W×H pair out of free-form aspect hints', () => {
    assert.deepStrictEqual(parseAspectHint('1600×900 (16:9)'), { width: 1600, height: 900 });
    assert.deepStrictEqual(parseAspectHint('1080×1440 (3:4)'), { width: 1080, height: 1440 });
    assert.deepStrictEqual(parseAspectHint('1280×720 或 1080×1080'), { width: 1280, height: 720 });
    assert.deepStrictEqual(parseAspectHint('16:9 (1280x720)'), { width: 1280, height: 720 });
    assert.strictEqual(parseAspectHint('A4 / 长页面'), undefined);
    assert.strictEqual(parseAspectHint('16:9 横向翻页'), undefined);
    assert.strictEqual(parseAspectHint(undefined), undefined);
  });

  it('resolves explicit → skill hint → element → default', () => {
    assert.strictEqual(resolveExportSize({ width: 1080, height: 1350, aspectHint: '1600×900' }).source, 'explicit');
    const hinted = resolveExportSize({ aspectHint: '1600×900 (16:9)', sourceSkillId: 'od:prototype:card-twitter' });
    assert.deepStrictEqual([hinted.source, hinted.viewport], ['skill-aspect-hint', { width: 1600, height: 900 }]);
    assert.strictEqual(resolveExportSize({ aspectHint: 'A4', selector: '[data-od-card]' }).source, 'element');
    const fallback = resolveExportSize({ aspectHint: 'A4 / 长页面', sourceSkillId: 'x' });
    assert.deepStrictEqual([fallback.source, fallback.viewport], ['default', { width: 1080, height: 1080 }]);
    assert.match(fallback.detail, /has no W×H pair/);
  });
});

describe('export output helpers', () => {
  it('names outputs under exports/, numbering per-element exports', () => {
    assert.strictEqual(exportFilePath('.open-design/launch/launch.html', undefined, 'png'), '.open-design/launch/exports/launch.png');
    assert.strictEqual(exportFilePath('.open-design/xhs/xhs.html', 3, 'jpeg'), '.open-design/xhs/exports/xhs-03.jpg');
  });

  it('replaces export records by path and keeps other metadata', () => {
    const merged = mergeExportRecords(
      { remixedFrom: 'x', exports: [{ path: 'a.png', exportedAt: 'old' }, { path: 'b.png', exportedAt: 'old' }] },
      [{ path: 'a.png', exportedAt: 'new' }],
    );
    assert.deepStrictEqual(merged, {
      remixedFrom: 'x',
      exports: [
        { path: 'b.png', exportedAt: 'old' },
        { path: 'a.png', exportedAt: 'new' },
      ],
    });
  });

  it('keeps an in-budget capture as-is', async () => {
    const result = await captureWithinBudget(async () => Buffer.alloc(10), 'png', undefined, 100);
    assert.deepStrictEqual([result.format, result.buffer.length, result.overBudget], ['png', 10, false]);
  });

  it('re-encodes an over-budget PNG as JPEG at the first quality that fits', async () => {
    const sizes: Record<number, number> = { 90: 500, 80: 300, 70: 90 };
    const calls: string[] = [];
    const result = await captureWithinBudget(
      async (f, q) => {
        calls.push(`${f}${q ?? ''}`);
        return Buffer.alloc(f === 'png' ? 1000 : (sizes[q!] ?? 50));
      },
      'png',
      undefined,
      100,
    );
    assert.deepStrictEqual(calls, ['png', 'jpeg90', 'jpeg80', 'jpeg70']);
    assert.deepStrictEqual([result.format, result.quality, result.overBudget], ['jpeg', 70, false]);
  });

  it('keeps the smallest attempt and flags it when the budget cannot be met', async () => {
    const result = await captureWithinBudget(async (f, q) => Buffer.alloc(f === 'png' ? 1000 : 100 + q!), 'png', undefined, 10);
    assert.deepStrictEqual([result.format, result.quality, result.buffer.length, result.overBudget], ['jpeg', 40, 140, true]);
  });
});

describe('browser discovery', () => {
  const noDirs = async () => [];

  it('uses an explicit path when it exists, and reports it when it does not', async () => {
    const ok = await findBrowser({ explicitPath: '/x/chrome', isExecutable: async (p) => p === '/x/chrome', listDir: noDirs });
    assert.deepStrictEqual(ok, { ok: true, executablePath: '/x/chrome' });
    const bad = await findBrowser({ explicitPath: '/nope', isExecutable: async () => false, listDir: noDirs });
    assert.ok(!bad.ok && bad.searched.length === 1 && /does not exist/.test(bad.message));
  });

  it('honours OPEN_DESIGN_BROWSER_PATH', async () => {
    const result = await findBrowser({ env: { OPEN_DESIGN_BROWSER_PATH: '/env/chrome' }, isExecutable: async (p) => p === '/env/chrome', listDir: noDirs });
    assert.deepStrictEqual(result, { ok: true, executablePath: '/env/chrome' });
  });

  it('prefers a system install, then the newest Playwright headless shell, and tries snap Chromium last', async () => {
    const listDir = async (dir: string) => (dir === '/home/u/.cache/ms-playwright' ? ['chromium_headless_shell-1181', 'chromium_headless_shell-1234', 'ffmpeg-1011'] : []);
    const pw = '/home/u/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
    const opts = { env: {}, platform: 'linux' as const, homedir: '/home/u', listDir };

    const withSystem = await findBrowser({ ...opts, isExecutable: async (p) => [pw, '/usr/bin/google-chrome', '/snap/bin/chromium'].includes(p) });
    assert.deepStrictEqual(withSystem, { ok: true, executablePath: '/usr/bin/google-chrome' });

    const cacheOverSnap = await findBrowser({ ...opts, isExecutable: async (p) => [pw, '/snap/bin/chromium'].includes(p) });
    assert.deepStrictEqual(cacheOverSnap, { ok: true, executablePath: pw });
  });

  it('returns a structured not-found result listing what it searched', async () => {
    const result = await findBrowser({ env: {}, platform: 'linux', homedir: '/home/u', isExecutable: async () => false, listDir: noDirs });
    assert.ok(!result.ok);
    assert.ok(result.searched.includes('/usr/bin/google-chrome'));
    assert.match(result.message, /OPEN_DESIGN_BROWSER_PATH/);
  });
});

describe('exportArtifact', () => {
  async function workspace(html: string, register = true): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-export-'));
    await fs.mkdir(path.join(root, '.open-design', 'post'), { recursive: true });
    await fs.writeFile(path.join(root, '.open-design', 'post', 'post.html'), html);
    if (register) {
      await writeArtifactManifest({
        workspaceRoot: root,
        entryPath: '.open-design/post/post.html',
        artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Post', sourceSkillId: 'od:prototype:card-twitter' },
      });
    }
    return root;
  }

  it('rejects missing and unregistered artifacts without launching a browser', async () => {
    const root = await workspace('<p>x</p>', false);
    const missing = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/nope/nope.html', browserPath: '/does/not/matter' });
    assert.ok(!missing.ok && missing.code === 'not-found');
    const unregistered = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/post/post.html', browserPath: '/does/not/matter' });
    assert.ok(!unregistered.ok && unregistered.code === 'not-registered');
  });

  it('validates arguments', async () => {
    const root = await workspace('<p>x</p>');
    const result = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/post/post.html', width: 100 });
    assert.ok(!result.ok && result.code === 'invalid-args');
  });

  describe('with a real browser (skipped when none is installed)', function () {
    this.timeout(60000);
    let browserPath: string | undefined;
    before(async function () {
      const found = await findBrowser();
      if (!found.ok) this.skip();
      else browserPath = found.executablePath;
    });

    const cardsHtml = `<!doctype html><html><body style="margin:0;background:#111">
      <div data-od-card style="width:300px;height:400px;background:#e33"></div>
      <div data-od-card style="width:300px;height:400px;background:#3e3"></div>
      <div data-od-card style="width:300px;height:400px;background:#33e"></div>
      <img src="missing.png"></body></html>`;

    it('exports at the source skill hint size and records it in the manifest', async () => {
      const root = await workspace('<!doctype html><h1>Hello</h1>');
      const result = await exportArtifact({
        workspaceRoot: root,
        entryPath: '.open-design/post/post.html',
        browserPath,
        settleMs: 0,
        lookupAspectHint: async (id) => (id === 'od:prototype:card-twitter' ? '1600×900 (16:9)' : undefined),
      });
      assert.ok(result.ok, JSON.stringify(result));
      assert.strictEqual(result.sizeSource, 'skill-aspect-hint');
      assert.deepStrictEqual(result.files.map((f) => [f.path, f.width, f.height, f.format]), [['.open-design/post/exports/post.png', 1600, 900, 'png']]);
      const png = await fs.readFile(path.join(root, result.files[0].path));
      assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1600, 900]);
      const manifest = JSON.parse(await fs.readFile(path.join(root, '.open-design/post/post.html.artifact.json'), 'utf8'));
      assert.strictEqual(manifest.metadata.exports[0].path, '.open-design/post/exports/post.png');
    });

    it('exports one numbered image per matching element, at scale, and warns about failed requests', async () => {
      const root = await workspace(cardsHtml);
      const result = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/post/post.html', browserPath, settleMs: 0, selector: '[data-od-card]', scale: 2 });
      assert.ok(result.ok, JSON.stringify(result));
      assert.deepStrictEqual(
        result.files.map((f) => [path.posix.basename(f.path), f.width, f.height]),
        [
          ['post-01.png', 600, 800],
          ['post-02.png', 600, 800],
          ['post-03.png', 600, 800],
        ],
      );
      const png = await fs.readFile(path.join(root, result.files[1].path));
      assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [600, 800]);
      assert.ok(result.warnings.some((w) => w.includes('missing.png')), result.warnings.join('\n'));
    });

    it('keeps the plain file name when the selector matches a single card', async () => {
      const root = await workspace('<!doctype html><body style="margin:0"><div data-od-card style="width:200px;height:100px;background:#e33"></div></body>');
      const result = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/post/post.html', browserPath, settleMs: 0, selector: '[data-od-card]' });
      assert.ok(result.ok, JSON.stringify(result));
      assert.deepStrictEqual(result.files.map((f) => [f.path, f.width, f.height]), [['.open-design/post/exports/post.png', 200, 100]]);
    });

    it('fails with no files when the selector matches nothing', async () => {
      const root = await workspace(cardsHtml);
      const result = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/post/post.html', browserPath, settleMs: 0, selector: '.nope' });
      assert.ok(!result.ok && result.code === 'selector-no-match');
      await assert.rejects(fs.access(path.join(root, '.open-design/post/exports')));
    });

    it('fits a noisy PNG under a byte budget by switching to JPEG', async () => {
      const noise = `<!doctype html><canvas id=c width=800 height=800></canvas><script>
        const x=c.getContext('2d'),d=x.createImageData(800,800);for(let i=0;i<d.data.length;i++)d.data[i]=Math.random()*255;x.putImageData(d,0,0);</script>`;
      const root = await workspace(noise);
      const result = await exportArtifact({ workspaceRoot: root, entryPath: '.open-design/post/post.html', browserPath, settleMs: 0, width: 800, height: 800, maxBytes: 600_000 });
      assert.ok(result.ok, JSON.stringify(result));
      assert.strictEqual(result.files[0].format, 'jpeg');
      assert.ok(result.files[0].path.endsWith('.jpg'));
      assert.ok(result.files[0].bytes <= 600_000 || result.warnings.some((w) => /still over/.test(w)));
    });
  });
});
