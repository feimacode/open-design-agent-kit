import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact } from '../../export/exportArtifact';
import { audioEncoderFor, findFfmpeg, parseCapabilities } from '../../export/motion/ffmpeg';
import { captionCuesInHtml, captionSafeArea, captionTimingWarnings, parseCaptions, toVtt } from '../../export/motion/captions';
import { filmSoundFindings } from '../../export/motion/filmChecks';
import { formatMotionExportResult, type MotionExportResult } from '../../export/motion/motionExport';
import { audioFilterGraph, audioTracksInHtml, clippedTracks, muxArgs, parseLoudness, readAudioDecision, resolveAudioTracks, type AudioTrack } from '../../export/motion/soundtrack';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const track = (o: Partial<AudioTrack>): AudioTrack => ({ src: 'a.wav', abs: '/w/a.wav', startS: 0, volume: 1, fadeInS: 0, fadeOutS: 0, ...o });

describe('video sound: pure parts', () => {
  it('reads the od-motion-audio decision, upstream "silent" as none', () => {
    assert.strictEqual(readAudioDecision('<meta name="od-motion-audio" content="required">'), 'required');
    assert.strictEqual(readAudioDecision("<meta content='silent' name='od-motion-audio'>"), 'none');
    assert.strictEqual(readAudioDecision('<meta name="viewport" content="width=device-width">'), undefined);
  });

  it('reads upstream audio markup from source', () => {
    const html = '<audio src="assets/music.wav" data-start="0" data-duration="15" data-volume="0.3"></audio><audio data-start="4.2"><source src="whoosh.mp3"></audio>';
    assert.deepStrictEqual(audioTracksInHtml(html).map((t) => [t.src, t.start, t.volume]), [['assets/music.wav', '0', '0.3'], ['whoosh.mp3', '4.2', null]]);
  });

  it('uses local files in the design folder only (spec: remote source)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sound-'));
    await fs.mkdir(path.join(root, 'd', 'assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'd', 'assets', 'music.wav'), 'x');
    await fs.writeFile(path.join(root, 'bed.wav'), 'x');
    const r = await resolveAudioTracks({
      workspaceRoot: root,
      entryDir: 'd',
      raw: [{ src: 'assets/music.wav', start: '1', volume: '2' }, { src: 'https://cdn.example.com/a.mp3' }, { src: '../bed.wav' }, { src: 'gone.wav' }],
      bed: 'bed.wav',
      bedVolume: 0.4,
    });
    assert.deepStrictEqual(r.tracks.map((t) => [t.src, t.startS, t.volume, t.bed ?? false, t.fadeOutS]), [['d/assets/music.wav', 1, 1, false, 0], ['bed.wav', 0, 0.4, true, 0.5]]);
    assert.deepStrictEqual(r.skipped.map((s) => s.reason), ['remote', 'outside', 'missing']);
  });

  it('builds one graph: trims, fades, delays, mixes, normalises (spec: two tracks in sync)', () => {
    const g = audioFilterGraph([track({ volume: 0.3, fadeOutS: 0.5, bed: true }), track({ src: 'w.wav', startS: 4.2, durationS: 1 })], 15, [30, 1.2]);
    assert.match(g, /^\[1:a\]atrim=0:15,.*volume=0\.3,afade=t=out:st=14\.5:d=0\.5\[a0\]/);
    assert.match(g, /\[2:a\]atrim=0:1,.*adelay=delays=4200:all=1\[a1\]/);
    assert.match(g, /\[a0\]\[a1\]amix=inputs=2:duration=longest:normalize=0,apad,atrim=0:15,loudnorm=I=-14:TP=-1/);
    const args = muxArgs({ video: 'v.mp4', tracks: [track({}), track({ abs: '/w/b.wav' })], graph: g, encoder: 'aac', filmS: 15, out: 'o.mp4' });
    assert.deepStrictEqual(args.slice(0, 6), ['-i', 'v.mp4', '-i', '/w/a.wav', '-i', '/w/b.wav']);
    assert.ok(args.includes('copy') && args.includes('aac'));
  });

  it('flags a track cut off at the end or starting after it (audio-clipped)', () => {
    const msgs = clippedTracks([track({ src: 'long.wav' }), track({ src: 'late.wav', startS: 20 }), track({ src: 'faded.wav', fadeOutS: 1 }), track({ src: 'bed.wav', bed: true })], 10, [30, 2, 30, 30]);
    assert.strictEqual(msgs.length, 2);
    assert.match(msgs[0], /long\.wav runs to 30\.00s/);
    assert.match(msgs[1], /late\.wav starts at 20s, after the film ends/);
  });

  it('parses loudness and picks audio encoders', () => {
    const r = parseLoudness('[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -14.2 LUFS\n  True peak:\n    Peak:       -1.3 dBFS\n');
    assert.deepStrictEqual(r, { lufs: -14.2, peakDb: -1.3, hasAudio: true });
    assert.strictEqual(parseLoudness("Stream map '0:a:0' matches no streams.").hasAudio, false);
    const c = parseCapabilities({ encoders: ' V....D libx264 x\n A....D aac AAC\n A....D libvorbis v\n', filters: '' });
    assert.strictEqual(audioEncoderFor('mp4', c), 'aac');
    assert.strictEqual(audioEncoderFor('webm', c), 'libvorbis');
    assert.strictEqual(audioEncoderFor('gif', c), undefined);
  });
});

describe('video captions: pure parts', () => {
  it('parses SRT and WebVTT and writes WebVTT', () => {
    const srt = parseCaptions('1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> there\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond\r\n');
    assert.deepStrictEqual(srt, [{ startMs: 1000, endMs: 2500, text: 'Hello there' }, { startMs: 3000, endMs: 4000, text: 'Second' }]);
    const vtt = parseCaptions('WEBVTT\n\n00:01.000 --> 00:02.000 align:center\nShort form\n');
    assert.deepStrictEqual(vtt, [{ startMs: 1000, endMs: 2000, text: 'Short form' }]);
    assert.match(toVtt(srt), /^WEBVTT\n\n1\n00:00:01\.000 --> 00:00:02\.500\nHello there\n/);
  });

  it('reads page cues and flags fast ones (caption-too-fast)', () => {
    const cues = captionCuesInHtml('<p data-od-caption data-start="0.5" data-duration="1">This line is far too long to read in a single second</p><p data-od-caption="Calm" data-start="2" data-duration="2">ignored text</p>');
    assert.deepStrictEqual(cues.map((c) => [c.startMs, c.endMs, c.text.slice(0, 9)]), [[500, 1500, 'This line'], [2000, 4000, 'Calm']]);
    const w = captionTimingWarnings(cues, 3000);
    assert.deepStrictEqual(w.map((x) => x.check), ['caption-too-fast']);
  });

  it('keeps captions above the platform buttons in a 9:16 frame', () => {
    assert.deepStrictEqual(captionSafeArea(1080, 1920, 48), { left: 48, right: 48, top: 48, bottom: 384 });
    assert.strictEqual(captionSafeArea(1920, 1080, 48).bottom, 86);
  });

  it('check reports a required film with no sound (spec: required sound missing)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sound-'));
    const html = '<meta name="od-motion-audio" content="required"><audio src="assets/music.wav" data-start="0"></audio>';
    const f = await filmSoundFindings(root, 'film/index.html', html);
    assert.deepStrictEqual(f.map((x) => [x.check, x.severity]), [['audio-source', 'error'], ['no-audio-track', 'error']]);
    assert.match(f[0].message, /film\/assets\/music\.wav doesn't exist/);
    assert.deepStrictEqual(await filmSoundFindings(root, 'film/index.html', '<p>still</p>'), []);
  });

  it('says a silent film needs a supplied file (spec: agent asks for background music)', () => {
    const r = { ok: true, motion: 'mp4', files: [{ path: 'x.mp4', bytes: 1000, width: 10, height: 10 }], fps: 30, frames: 30, durationMs: 1000, durationSource: 'explicit', warnings: [], ffmpegPath: 'f', browserPath: 'b' } as MotionExportResult;
    assert.match(formatMotionExportResult(r), /Sound: none \(silent video\)\. For music or sound, the user supplies a file/);
  });
});

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(file, args, { maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => (err ? reject(err) : resolve(String(stderr)))));
}

describe('video sound and captions (real browser and ffmpeg; skipped when either is missing)', function () {
  this.timeout(240000);
  let browserPath: string | undefined;
  let ffmpegPath = '';
  before(async function () {
    const browser = await findBrowser();
    const ff = await findFfmpeg('mp4');
    if (!browser.ok || !ff.ok || !ff.capabilities.aac) this.skip();
    else {
      browserPath = browser.executablePath;
      ffmpegPath = ff.path;
    }
  });

  const ENTRY = '.open-design/film/film.html';
  async function workspace(html: string): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-film-test-'));
    const dir = path.join(root, '.open-design', 'film');
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(root, ENTRY), html);
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-y', path.join(dir, 'assets', 'music.wav')]);
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.4', '-y', path.join(dir, 'assets', 'whoosh.wav')]);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Film' } });
    return root;
  }
  const film = (extra = '') =>
    `<!doctype html><html><head>${extra}<style>body{margin:0;background:#0b1d2a;--fg:#f5f1e8;--bg:#0b1d2a}</style></head><body>
    <section data-duration="2000"></section>
    <audio src="assets/music.wav" data-start="0" data-volume="0.3" data-fade-out="0.5"></audio>
    <audio src="assets/whoosh.wav" data-start="1.2" data-duration="0.4"></audio>
    <p data-od-caption data-start="0.2" data-duration="1.2">Launch day</p></body></html>`;
  const exp = (root: string, extra: Record<string, unknown>) =>
    exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, width: 320, height: 568, fps: 10, ...extra } as Parameters<typeof exportArtifact>[0]) as Promise<MotionExportResult>;

  it('mixes two tracks into one normalised audio stream, burns captions and writes a .vtt', async () => {
    const root = await workspace(film());
    const r = await exp(root, { format: 'mp4' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.durationMs, 2000, 'audio and caption data-duration do not count toward the film');
    assert.deepStrictEqual(r.audio?.tracks, ['.open-design/film/assets/music.wav', '.open-design/film/assets/whoosh.wav']);
    assert.ok(Math.abs(r.audio!.lufs + 14) < 3, `loudness near -14 LUFS, got ${r.audio!.lufs}`);
    assert.deepStrictEqual(r.captions, { path: '.open-design/film/exports/film.vtt', cues: 1, burned: true });
    assert.match(await fs.readFile(path.join(root, r.captions!.path), 'utf8'), /00:00:00\.200 --> 00:00:01\.400\nLaunch day/);
    const info = await run(ffmpegPath, ['-hide_banner', '-i', path.join(root, r.files[0].path), '-f', 'null', '-']).catch((e) => String(e));
    assert.match(info, /Audio: aac/);
    assert.ok(r.warnings.some((w) => /Confirm with the user that they may use/.test(w)), JSON.stringify(r.warnings));
  });

  it('fails a required film whose only track is missing (no-audio-track)', async () => {
    const root = await workspace('<!doctype html><meta name="od-motion-audio" content="required"><body><audio src="assets/none.wav"></audio><section data-duration="500"></section></body>');
    const r = await exp(root, { format: 'mp4' });
    assert.ok(!r.ok && r.code === 'no-audio-track', JSON.stringify(r));
    assert.match(r.error, /none\.wav/);
  });

  it('takes an SRT file and a music bed; GIF stays silent', async () => {
    const root = await workspace('<!doctype html><body style="margin:0;background:#222"><section data-duration="1500"></section></body>');
    await fs.writeFile(path.join(root, 'captions.srt'), '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
    const r = await exp(root, { format: 'mp4', audio: '.open-design/film/assets/music.wav', audioVolume: 0.5, captions: 'captions.srt', burnCaptions: false });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.audio?.tracks.length, 1);
    assert.deepStrictEqual(r.captions, { path: '.open-design/film/exports/film.vtt', cues: 1, burned: false });
    const g = await exp(root, { format: 'gif', audio: '.open-design/film/assets/music.wav' });
    assert.ok(g.ok && !g.audio && g.warnings.some((w) => /GIF has no sound/.test(w)), JSON.stringify(g));
  });

  it('shows page captions in the timestamped check', async () => {
    const { checkArtifact } = await import('../../export/checkArtifact');
    const root = await workspace(film());
    const r = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, at: [0.5, 1.8], maxImages: 3, viewports: [{ name: 'phone', width: 320, height: 568 }] });
    assert.ok(r.ok, JSON.stringify(r));
    assert.notDeepStrictEqual(r.images[0].data, r.images[1].data, 'the caption is on at 0.5s and off at 1.8s');
  });
});
