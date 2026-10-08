import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact } from '../../export/exportArtifact';
import { findFfmpeg, parseCapabilities } from '../../export/motion/ffmpeg';
import { encodeArgs, resolveDurationMs, type MotionExportResult } from '../../export/motion/motionExport';
import { VIRTUAL_CLOCK_SCRIPT } from '../../export/motion/virtualClock';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const FULL = { encoders: ' V....D libx264              libx264 H.264\n V....D libvpx               libvpx VP8\n V....D libvpx-vp9           libvpx VP9\n V....D gif                  GIF (Graphics Interchange Format)\n', filters: ' ... palettegen  V->V  Find the optimal palette.\n ... paletteuse  VV->V Use a palette.\n' };
const VP8_ONLY = { encoders: ' V....D libvpx               libvpx VP8 (codec vp8)\n', filters: '' };

describe('motion export: pure parts', () => {
  it('resolves duration from data-duration, then animations, then the default, with a 60s cap', () => {
    assert.deepStrictEqual(resolveDurationMs({ dataDurations: [3000, 3000, 4000], finiteAnimationEnds: [9000], infiniteAnimations: 0 }).ms, 10000);
    assert.strictEqual(resolveDurationMs({ dataDurations: [3000], finiteAnimationEnds: [], infiniteAnimations: 0 }).source, 'data-duration');
    assert.deepStrictEqual(resolveDurationMs({ dataDurations: [], finiteAnimationEnds: [1200, 3700], infiniteAnimations: 2 }), { ms: 3700, source: 'animations', note: undefined });
    const looping = resolveDurationMs({ dataDurations: [], finiteAnimationEnds: [], infiniteAnimations: 1 });
    assert.deepStrictEqual([looping.ms, looping.source], [6000, 'default']);
    assert.match(looping.note!, /looping/);
    assert.strictEqual(resolveDurationMs({ dataDurations: [90000], finiteAnimationEnds: [], infiniteAnimations: 0 }).ms, 60000);
  });

  it('builds encoder arguments per format', () => {
    const base = { ffmpegPath: 'ffmpeg', webmCodec: 'libvpx-vp9' as const, framesDir: '/f', frameExt: 'jpg' as const, fps: 30, width: 1280, loop: true, out: '/o/x' };
    const mp4 = encodeArgs({ ...base, format: 'mp4' }).join(' ');
    assert.match(mp4, /-c:v libx264 -pix_fmt yuv420p .*-crf 20 -movflags \+faststart/);
    assert.match(mp4, /scale=trunc\(iw\/2\)\*2:trunc\(ih\/2\)\*2/);
    assert.match(encodeArgs({ ...base, format: 'mp4', kbps: 800 }).join(' '), /-b:v 800k -maxrate 800k -bufsize 1600k/);
    assert.match(encodeArgs({ ...base, format: 'webm' }).join(' '), /-c:v libvpx-vp9 -row-mt 1 .*-b:v 0 -crf 32/);
    assert.match(encodeArgs({ ...base, format: 'webm', webmCodec: 'libvpx' }).join(' '), /-c:v libvpx -pix_fmt yuv420p -b:v 2M -crf 10/);
    const gif = encodeArgs({ ...base, format: 'gif', frameExt: 'png', fps: 15, gifWidth: 640 }).join(' ');
    assert.match(gif, /fps=15,scale=640:-1:flags=lanczos,split\[a\]\[b\];\[a\]palettegen/);
    assert.match(gif, /-loop 0 \/o\/x$/);
    assert.match(encodeArgs({ ...base, format: 'gif', loop: false }).join(' '), /-loop -1/);
  });

  it('reads encoder capabilities from ffmpeg -encoders and -filters', () => {
    assert.deepStrictEqual(parseCapabilities(FULL), { h264: true, vp9: true, vp8: true, gif: true });
    assert.deepStrictEqual(parseCapabilities(VP8_ONLY), { h264: false, vp9: false, vp8: true, gif: false });
  });

  const fakeFs = (files: Record<string, typeof FULL>) => ({
    env: { PATH: '/usr/local/bin' },
    platform: 'linux' as NodeJS.Platform,
    homedir: '/home/u',
    isFile: async (p: string) => p in files,
    listDir: async (d: string) => (d === '/home/u/.cache/ms-playwright' ? ['ffmpeg-1011', 'chromium-1200'] : []),
    probe: async (p: string) => files[p],
  });

  it('finds ffmpeg like the browser: explicit path first, then PATH, then known places, then Playwright', async () => {
    const pw = '/home/u/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux';
    const onlyPw = await findFfmpeg('webm', fakeFs({ [pw]: VP8_ONLY }));
    assert.ok(onlyPw.ok && onlyPw.path === pw && onlyPw.webmCodec === 'libvpx');
    const mp4 = await findFfmpeg('mp4', fakeFs({ [pw]: VP8_ONLY }));
    assert.ok(!mp4.ok && mp4.code === 'ffmpeg-missing-encoder', JSON.stringify(mp4));
    assert.match(mp4.ok ? '' : mp4.message, /MP4 needs the H\.264 encoder.*it can make WebM \(VP8\)/);
    const both = await findFfmpeg('mp4', fakeFs({ [pw]: VP8_ONLY, '/usr/local/bin/ffmpeg': FULL }));
    assert.ok(both.ok && both.path === '/usr/local/bin/ffmpeg');
    const explicit = await findFfmpeg('gif', { ...fakeFs({ '/opt/ff': FULL, '/usr/local/bin/ffmpeg': FULL }), explicitPath: '/opt/ff' });
    assert.ok(explicit.ok && explicit.path === '/opt/ff');
    const none = await findFfmpeg('gif', fakeFs({}));
    assert.ok(!none.ok && none.code === 'no-ffmpeg');
    assert.match(none.ok ? '' : none.message, /OPEN_DESIGN_FFMPEG_PATH/);
  });
});

describe('virtual clock (real browser; skipped when none is installed)', function () {
  this.timeout(60000);
  let executablePath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else executablePath = found.executablePath;
  });

  it('runs timers in order, one rAF frame per advance, and seeks CSS animations, independent of real time', async () => {
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(VIRTUAL_CLOCK_SCRIPT);
      // A real navigation, as export does: evaluateOnNewDocument scripts don't run for setContent.
      await page.goto('data:text/html,' + encodeURIComponent(`<style>@keyframes w{from{width:0}to{width:100px}}#bar{height:4px;background:red;animation:w 1s linear forwards}</style><div id="bar"></div>
        <script>window.log=[];setTimeout(()=>log.push('t500@'+performance.now()),500);setTimeout(()=>log.push('t100@'+performance.now()),100);
        let n=0;(function f(t){n++;window.lastFrame=t;requestAnimationFrame(f)})(0);window.frames=()=>n;window.started=Date.now();</script>`));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(await page.evaluate('performance.now()'), 0, 'time is frozen until advanced');
      await page.evaluate('__odClock.advanceTo(250)');
      assert.deepStrictEqual(await page.evaluate('log'), ['t100@100']);
      assert.strictEqual(await page.evaluate('frames()'), 2, 'one frame callback per advance');
      await page.evaluate('__odClock.advanceTo(600)');
      assert.deepStrictEqual(await page.evaluate('log'), ['t100@100', 't500@500']);
      assert.strictEqual(await page.evaluate('Date.now() - started'), 600);
      await page.evaluate('__odClock.painted()');
      const width = Number(await page.evaluate("parseFloat(getComputedStyle(document.getElementById('bar')).width)"));
      assert.ok(Math.abs(width - 60) < 1, `CSS animation seeked to 600ms: ${width}`);
    } finally {
      await browser.close();
    }
  });
});

describe('motion export (real browser and ffmpeg; skipped when either is missing)', function () {
  this.timeout(240000);
  let browserPath: string | undefined;
  before(async function () {
    const browser = await findBrowser();
    const ff = await findFfmpeg('gif');
    if (!browser.ok || !ff.ok) this.skip();
    else browserPath = browser.executablePath;
  });

  const ENTRY = '.open-design/motion/motion.html';
  async function workspace(html: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-motion-test-'));
    await fs.mkdir(path.join(root, '.open-design', 'motion'), { recursive: true });
    await fs.writeFile(path.join(root, ENTRY), html);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Motion' } });
    return root;
  }
  // CSS animation, a rAF-driven counter and a timer, all on the virtual clock.
  const anim = `<!doctype html><html><head><style>body{margin:0;background:#101820;color:#fff;font:bold 40px sans-serif}
    @keyframes slide{from{transform:translateX(0)}to{transform:translateX(220px)}}.dot{width:40px;height:40px;border-radius:50%;background:#f2aa4c;animation:slide 1.5s ease-in-out forwards;margin:20px}</style></head>
    <body><div class="dot"></div><div id="n">0</div><script>let s=performance.now();(function f(){document.getElementById('n').textContent=Math.round(performance.now()-s);requestAnimationFrame(f)})();
    setTimeout(()=>document.body.style.background='#203040',800);</script></body></html>`;
  const run = (root: string, extra: Record<string, unknown>) =>
    exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, width: 320, height: 180, ...extra } as Parameters<typeof exportArtifact>[0]) as Promise<MotionExportResult>;
  const sha = async (p: string) => createHash('sha256').update(await fs.readFile(p)).digest('hex');

  it('exports the same frames on every run (byte-identical GIFs), with the duration from the CSS animation', async () => {
    const root = await workspace(anim);
    const a = await run(root, { format: 'gif', fps: 10 });
    assert.ok(a.ok, JSON.stringify(a));
    assert.strictEqual(a.durationSource, 'animations');
    assert.strictEqual(a.durationMs, 1500);
    assert.strictEqual(a.frames, 15);
    const first = await sha(path.join(root, a.files[0].path));
    const b = await run(root, { format: 'gif', fps: 10 });
    assert.ok(b.ok);
    assert.strictEqual(await sha(path.join(root, b.files[0].path)), first);
  });

  it('takes the duration from data-duration frames, and writes MP4 at the asked size', async () => {
    const root = await workspace('<!doctype html><body style="margin:0;background:#222"><section data-duration="400"></section><section data-duration="600"></section><p style="color:#fff">x</p></body>');
    const r = await run(root, { format: 'mp4', fps: 10 });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual([r.durationSource, r.durationMs, r.frames], ['data-duration', 1000, 10]);
    assert.deepStrictEqual([r.files[0].width, r.files[0].height], [320, 180]);
    assert.ok(r.files[0].path.endsWith('motion.mp4'));
  });

  it('re-encodes a GIF smaller to meet maxBytes, or warns', async () => {
    const root = await workspace(anim);
    const r = await run(root, { format: 'gif', fps: 15, duration: 1.5, maxBytes: 20_000 });
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(r.files[0].bytes <= 20_000 || r.warnings.some((w) => /still over/.test(w)), JSON.stringify(r));
    assert.ok(r.warnings.some((w) => /re-encoded|still over/.test(w)), JSON.stringify(r.warnings));
  });

  it('captures the artifact at given times on the virtual clock in check_open_design_artifact', async () => {
    const { checkArtifact } = await import('../../export/checkArtifact');
    const root = await workspace(anim);
    const r = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, at: [1.5, 0], maxImages: 3, viewports: [{ name: 'desktop', width: 320, height: 180 }] });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(r.images.map((i) => i.label), ['t=0s', 't=1.5s', 'desktop']);
    assert.notDeepStrictEqual(r.images[0].data, r.images[1].data, 'the moments differ');
    const bad = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, at: [1, 2, 3, 4, 5, 6, 7] });
    assert.ok(!bad.ok && bad.code === 'invalid-args');
  });

  it('rejects options that do not apply, without a browser', async () => {
    const root = await workspace(anim);
    for (const extra of [{ format: 'mp4', fps: 0 }, { format: 'gif', duration: 120 }, { format: 'webm', selector: '.x' }, { format: 'png', fps: 10 }, { format: 'mp4', preset: 'a3' }]) {
      const r = await run(root, extra);
      assert.ok(!r.ok && r.code === 'invalid-args', JSON.stringify([extra, r]));
    }
  });
});
