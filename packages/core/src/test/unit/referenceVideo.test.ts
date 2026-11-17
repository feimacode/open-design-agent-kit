import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact } from '../../export/checkArtifact';
import { findAnyFfmpeg, inspectReferenceVideo, isVideoLink, parseCuts, parseProbe, pickFrameTimes, readReferenceFacts, referenceBriefSection, timingDrift, type ReferenceFacts } from '../../media/referenceVideo';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const FACTS: ReferenceFacts = { referenceId: 'promo-abc123', source: 'refs/promo.mp4', durationSec: 12, width: 1920, height: 1080, fps: 30, hasAudio: true, cuts: [4, 9.5], frames: [{ path: 'x/frames/frame-01.jpg', at: 0 }], contactSheet: 'x/contact.jpg', audio: 'x/audio.wav', dir: 'x', inspectedAt: '2026-11-18T00:00:00Z' };

describe('reference video: pure parts', () => {
  it('reads a probe and scene cuts', () => {
    const p = parseProbe('Duration: 00:00:12.04, start: 0\n  Stream #0:0(und): Video: h264 (High), yuv420p, 1920x1080, 30 fps, 30 tbr\n  Stream #0:1(und): Audio: aac, 44100 Hz');
    assert.deepStrictEqual(p, { durationSec: 12.04, width: 1920, height: 1080, fps: 30, hasAudio: true, hasVideo: true });
    assert.deepStrictEqual(parseCuts('pts_time:0.02 x\npts_time:4.0 x\npts_time:4.1 x\npts_time:9.5 x\npts_time:12.03 x', 12.04), [4, 9.5]);
  });

  it('picks a frame early in each shot plus a grid, at least 0.4 s apart, at most 24', () => {
    const t = pickFrameTimes([4, 9.5], 12);
    assert.ok(t.includes(0) && t.some((x) => x > 4 && x < 4.4) && t.some((x) => x > 9.5 && x < 9.9), JSON.stringify(t));
    assert.ok(t.every((x, i) => i === 0 || x - t[i - 1] >= 0.4));
    assert.ok(pickFrameTimes(Array.from({ length: 60 }, (_, i) => i * 2 + 1), 150).length <= 24);
  });

  it('reports a beat more than 0.25 s from the nearest cut (spec: late second beat)', () => {
    assert.deepStrictEqual(timingDrift([0, 4.6, 9.4], [0, 4, 9.5]), [{ beat: 2, at: 4.6, nearest: 4, diff: 0.6 }]);
  });

  it('takes files only (spec: video site link)', async () => {
    assert.ok(isVideoLink('https://www.youtube.com/watch?v=x') && isVideoLink('www.vimeo.com/1') && !isVideoLink('refs/promo.mp4'));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ref-'));
    const r = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'https://www.youtube.com/watch?v=x' });
    assert.ok(!r.ok && r.code === 'link' && /download the video/.test(r.error));
    assert.deepStrictEqual(await fs.readdir(root), [], 'writes nothing');
  });

  it('briefs with the cuts and the design system replacing the look (spec: like this, for my brand)', () => {
    const s = referenceBriefSection(FACTS, 'Pennyflow');
    assert.match(s, /^## Reference video/);
    assert.match(s, /Cuts \(s\): 4\.00, 9\.50/);
    assert.match(s, /take colours, type and motion from Pennyflow's design system/);
    assert.match(s, /logos, people, footage and words are not reused unless the user asks and has the right to/);
    assert.match(s, /may be reused in the film only after the user confirms/);
  });
});

function run(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => execFile(file, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024 }, (err) => (err ? reject(err) : resolve())));
}

describe('reference video (real ffmpeg; skipped when none is installed)', function () {
  this.timeout(240000);
  let ff = '';
  let root = '';
  before(async function () {
    const found = await findAnyFfmpeg();
    if (!found) return this.skip();
    ff = found;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ref-'));
    await fs.mkdir(path.join(root, 'refs'));
    // Three hard cuts (red 4 s, blue 5.5 s, green 2.5 s) over a tone.
    await run(ff, ['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=4', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=25:d=5.5', '-f', 'lavfi', '-i', 'color=c=green:s=320x180:r=25:d=2.5', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(root, 'refs', 'promo.mp4')]);
    await run(ff, ['-f', 'lavfi', '-i', 'color=c=gray:s=160x90:r=10:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'refs', 'silent.mp4')]);
  });

  it('measures a three-shot promo (spec: three-shot promo)', async () => {
    const r = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'refs/promo.mp4' });
    assert.ok(r.ok, JSON.stringify(r));
    const f = r.facts;
    assert.ok(Math.abs(f.durationSec - 12) < 0.2, String(f.durationSec));
    assert.deepStrictEqual([f.width, f.height, f.hasAudio], [320, 180, true]);
    assert.strictEqual(f.cuts.length, 2, JSON.stringify(f.cuts));
    assert.ok(Math.abs(f.cuts[0] - 4) < 0.1 && Math.abs(f.cuts[1] - 9.5) < 0.1, JSON.stringify(f.cuts));
    assert.ok(f.frames.length >= 3 && f.frames.length <= 24);
    for (const p of [f.contactSheet, f.audio!, path.posix.join(f.dir, 'facts.json'), f.frames[0].path]) assert.ok((await fs.stat(path.join(root, p))).size > 0, p);
    assert.deepStrictEqual((await readReferenceFacts(root, '.open-design', f.referenceId))?.cuts, f.cuts);
    assert.ok(r.contact.length > 1000);
  });

  it('a silent clip has no audio.wav; an unknown extension and a missing file are refused', async () => {
    const r = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'refs/silent.mp4' });
    assert.ok(r.ok && !r.facts.hasAudio && r.facts.audio === null);
    const txt = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'refs/notes.txt' });
    assert.ok(!txt.ok && txt.code === 'unsupported');
    const gone = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'refs/gone.mp4' });
    assert.ok(!gone.ok && gone.code === 'not-found');
  });

  it('refuses a video over 180 seconds (spec: too long)', async () => {
    await run(ff, ['-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=1:d=240', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'refs', 'long.mp4')]);
    const r = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'refs/long.mp4' });
    assert.ok(!r.ok && r.code === 'too-long' && /up to 180 s/.test(r.error), JSON.stringify(r));
  });

  it('the check pairs a design with the reference and reports a late beat', async function () {
    const browser = await findBrowser();
    if (!browser.ok) return this.skip();
    const inspected = await inspectReferenceVideo({ workspaceRoot: root, outputDir: '.open-design', video: 'refs/promo.mp4' });
    assert.ok(inspected.ok);
    const entry = '.open-design/film/film.html';
    await fs.mkdir(path.join(root, '.open-design', 'film'), { recursive: true });
    await fs.writeFile(path.join(root, entry), '<!doctype html><body style="margin:0;background:#111"><section data-duration="4600"></section><section data-duration="4900"></section><section data-duration="2500"></section></body>');
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Film' } });
    const r = await checkArtifact({ workspaceRoot: root, entryPath: entry, browserPath: browser.executablePath, settleMs: 0, saveRun: false, states: false, referenceId: inspected.facts.referenceId, maxImages: 2, viewports: [{ name: 'desktop', width: 640, height: 360 }] });
    assert.ok(r.ok, JSON.stringify(r));
    const drift = r.findings.filter((f) => f.check === 'reference-timing-drift');
    assert.strictEqual(drift.length, 1, JSON.stringify(r.findings));
    assert.match(drift[0].message, /^Beat 2 starts at 4\.60s; the nearest reference cut is at 4\.0\ds \(\+0\.\d+s\)/);
    assert.match(r.images[0].label, /^reference .* vs design, at each shot$/);
    const unknown = await checkArtifact({ workspaceRoot: root, entryPath: entry, browserPath: browser.executablePath, referenceId: 'nope', saveRun: false });
    assert.ok(!unknown.ok && unknown.code === 'invalid-args');
  });
});
