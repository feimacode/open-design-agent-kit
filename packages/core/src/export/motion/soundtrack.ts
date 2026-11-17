// Sound for video exports (openspec add-video-sound-and-captions). Uses
// upstream open-design's markup unchanged: `<audio src data-start
// data-duration data-volume>` (seconds, volume 0–1) plus optional
// `data-fade-in` / `data-fade-out`, and `<meta name="od-motion-audio"
// content="required|none">`. Frames are captured silently as before; the
// tracks are mixed by ffmpeg in one pass after capture, so the page's audio
// clock is never used and the render stays deterministic. Only local files
// inside the design's folder (or a workspace file passed as `audio`) are used:
// the kit never downloads, generates or bundles music.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type AudioDecision = 'required' | 'none';

/** Integrated loudness target (about −14 LUFS, as the major platforms normalise to) and true-peak ceiling. */
export const LOUDNESS_TARGET_LUFS = -14;
export const TRUE_PEAK_CEILING_DB = -1;
/** Default fade out for a music bed passed as `audio`. */
export const BED_FADE_OUT_S = 0.5;
/** Loudness below this reads as silence. */
const SILENT_LUFS = -60;

/** `<meta name="od-motion-audio" content="…">`: required, none (upstream also writes "silent"), or undefined. */
export function readAudioDecision(html: string): AudioDecision | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bname\s*=\s*["']?od-motion-audio\b/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*["']?([\w-]+)/i.exec(tag)?.[1]?.toLowerCase();
    if (content === 'required') return 'required';
    if (content === 'none' || content === 'silent') return 'none';
  }
  return undefined;
}

/** One `<audio>` element as the page has it (attribute strings, unparsed). */
export interface RawAudioTrack {
  src: string;
  start?: string | null;
  duration?: string | null;
  volume?: string | null;
  fadeIn?: string | null;
  fadeOut?: string | null;
}

export interface AudioTrack {
  /** Workspace-relative path, for messages. */
  src: string;
  abs: string;
  startS: number;
  /** Declared length in seconds; undefined plays to the end of the source or the film. */
  durationS?: number;
  volume: number;
  fadeInS: number;
  fadeOutS: number;
  /** A bed passed as `audio` is trimmed to the film without a clipping warning. */
  bed?: boolean;
}

/** Reads `<audio>` elements from HTML source (the check uses this; the export reads the live page). */
export function audioTracksInHtml(html: string): RawAudioTrack[] {
  const out: RawAudioTrack[] = [];
  for (const m of html.matchAll(/<audio\b([^>]*)>([\s\S]*?)<\/audio>/gi)) {
    const attrs = m[1];
    const attr = (name: string): string | null => {
      const r = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
      return r ? (r[1] ?? r[2] ?? r[3] ?? '') : null;
    };
    const src = attr('src') ?? (/<source\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(m[2])?.[1] ?? null);
    if (!src) continue;
    out.push({ src, start: attr('data-start'), duration: attr('data-duration'), volume: attr('data-volume'), fadeIn: attr('data-fade-in'), fadeOut: attr('data-fade-out') });
  }
  return out;
}

/** In the page: every `<audio>` with a source, as attribute strings. String form: core compiles without DOM types. */
export const COLLECT_AUDIO_SCRIPT = `Array.prototype.map.call(document.querySelectorAll('audio'), (el) => {
  const source = el.querySelector('source[src]');
  return { src: el.getAttribute('src') || (source ? source.getAttribute('src') : ''), start: el.getAttribute('data-start'), duration: el.getAttribute('data-duration'), volume: el.getAttribute('data-volume'), fadeIn: el.getAttribute('data-fade-in'), fadeOut: el.getAttribute('data-fade-out') };
}).filter((t) => t.src)`;

const num = (v: string | null | undefined): number | undefined => {
  if (v === null || v === undefined || v.trim() === '') return undefined;
  const n = Number(v.trim().replace(/s$/i, ''));
  return Number.isFinite(n) ? n : undefined;
};

const isRemote = (src: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//');

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

export interface ResolveTracksInput {
  workspaceRoot: string;
  /** The design's folder, workspace-relative POSIX ('.' for the root). */
  entryDir: string;
  raw: RawAudioTrack[];
  /** `audio` export argument: a workspace path laid under the whole film. */
  bed?: string;
  bedVolume?: number;
}

export interface ResolvedTracks {
  tracks: AudioTrack[];
  /** Sources that were named but can't be used (remote, outside the folder, missing). */
  skipped: Array<{ src: string; reason: 'remote' | 'outside' | 'missing' }>;
}

/** Resolves page tracks against the design's folder and the `audio` bed against the workspace; never fetches anything. */
export async function resolveAudioTracks(input: ResolveTracksInput): Promise<ResolvedTracks> {
  const root = path.resolve(input.workspaceRoot);
  const folder = path.resolve(root, input.entryDir);
  const tracks: AudioTrack[] = [];
  const skipped: ResolvedTracks['skipped'] = [];
  const inside = (abs: string, dir: string): boolean => abs === dir || abs.startsWith(dir + path.sep);
  for (const r of input.raw) {
    const src = r.src.trim().split(/[?#]/)[0];
    if (isRemote(src)) {
      skipped.push({ src: r.src, reason: 'remote' });
      continue;
    }
    let decoded = src;
    try {
      decoded = decodeURIComponent(src);
    } catch {
      /* keep as written */
    }
    const abs = path.resolve(folder, decoded.replace(/^\/+/, ''));
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!inside(abs, folder)) {
      skipped.push({ src: r.src, reason: 'outside' });
      continue;
    }
    if (!(await isFile(abs))) {
      skipped.push({ src: rel, reason: 'missing' });
      continue;
    }
    const duration = num(r.duration);
    tracks.push({
      src: rel,
      abs,
      startS: Math.max(0, num(r.start) ?? 0),
      durationS: duration !== undefined && duration > 0 ? duration : undefined,
      volume: Math.min(1, Math.max(0, num(r.volume) ?? 1)),
      fadeInS: Math.max(0, num(r.fadeIn) ?? 0),
      fadeOutS: Math.max(0, num(r.fadeOut) ?? 0),
    });
  }
  if (input.bed) {
    const abs = path.resolve(root, input.bed);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (isRemote(input.bed)) skipped.push({ src: input.bed, reason: 'remote' });
    else if (!inside(abs, root)) skipped.push({ src: input.bed, reason: 'outside' });
    else if (!(await isFile(abs))) skipped.push({ src: rel, reason: 'missing' });
    else tracks.push({ src: rel, abs, startS: 0, volume: Math.min(1, Math.max(0, input.bedVolume ?? 1)), fadeInS: 0, fadeOutS: BED_FADE_OUT_S, bed: true });
  }
  return { tracks, skipped };
}

export function skippedMessage(s: ResolvedTracks['skipped'][number]): string {
  if (s.reason === 'remote') return `${s.src} isn't used: sound must be a local file in the design's folder (the kit doesn't download audio).`;
  if (s.reason === 'outside') return `${s.src} isn't used: it is outside the design's folder. Copy the file next to the design.`;
  return `${s.src} doesn't exist.`;
}

/** How long each track actually plays in a film of `filmS` seconds, given the source's own length when known. */
export function playedSeconds(t: AudioTrack, filmS: number, sourceS?: number): number {
  const wanted = Math.min(t.durationS ?? Infinity, sourceS ?? Infinity, Math.max(0, filmS - t.startS));
  return Number.isFinite(wanted) ? Math.max(0, wanted) : Math.max(0, filmS - t.startS);
}

/** `audio-clipped`: a page track that starts after the film ends, or is cut off at the end without a fade out. */
export function clippedTracks(tracks: AudioTrack[], filmS: number, sourceSeconds: Array<number | undefined>): string[] {
  const out: string[] = [];
  tracks.forEach((t, i) => {
    if (t.bed) return;
    if (t.startS >= filmS) {
      out.push(`${t.src} starts at ${t.startS}s, after the film ends (${filmS.toFixed(2)}s), so it isn't heard.`);
      return;
    }
    const natural = Math.min(t.durationS ?? Infinity, sourceSeconds[i] ?? Infinity);
    const end = t.startS + natural;
    if (Number.isFinite(end) && end > filmS + 0.25 && t.fadeOutS === 0) out.push(`${t.src} runs to ${end.toFixed(2)}s but the film ends at ${filmS.toFixed(2)}s, so it is cut off mid-sound. Shorten it with data-duration or add data-fade-out.`);
  });
  return out;
}

const s3 = (n: number): string => String(Number(n.toFixed(3)));

/**
 * The ffmpeg filter graph: each track trimmed, faded, set to its volume and delayed to its start; then mixed,
 * padded or cut to the film's length and normalised (single-pass loudnorm). Input 0 is the video, so track i is
 * input i + 1. Output label: [aout].
 */
export function audioFilterGraph(tracks: AudioTrack[], filmS: number, sourceSeconds: Array<number | undefined> = []): string {
  const parts: string[] = [];
  const labels: string[] = [];
  tracks.forEach((t, i) => {
    const played = playedSeconds(t, filmS, sourceSeconds[i]);
    if (played <= 0) return;
    const chain = [`atrim=0:${s3(played)}`, 'asetpts=PTS-STARTPTS', 'aformat=sample_rates=48000:channel_layouts=stereo', `volume=${s3(t.volume)}`];
    const fadeIn = Math.min(t.fadeInS, played);
    if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${s3(fadeIn)}`);
    const fadeOut = Math.min(t.fadeOutS, played);
    if (fadeOut > 0) chain.push(`afade=t=out:st=${s3(played - fadeOut)}:d=${s3(fadeOut)}`);
    const delay = Math.round(t.startS * 1000);
    if (delay > 0) chain.push(`adelay=delays=${delay}:all=1`);
    const label = `a${i}`;
    parts.push(`[${i + 1}:a]${chain.join(',')}[${label}]`);
    labels.push(`[${label}]`);
  });
  if (labels.length === 0) return '';
  const mix = labels.length > 1 ? `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,` : `${labels[0]}`;
  const tail = `apad,atrim=0:${s3(filmS)},loudnorm=I=${LOUDNESS_TARGET_LUFS}:TP=${TRUE_PEAK_CEILING_DB}:LRA=11,aresample=48000[aout]`;
  parts.push(labels.length > 1 ? `${mix}${tail}` : `${mix}${tail}`);
  return parts.join(';');
}

/** ffmpeg arguments that mux an encoded (silent) video with the mixed tracks, copying the video stream. */
export function muxArgs(input: { video: string; tracks: AudioTrack[]; graph: string; encoder: 'aac' | 'libopus' | 'libvorbis'; filmS: number; out: string }): string[] {
  const args = ['-i', input.video];
  for (const t of input.tracks) args.push('-i', t.abs);
  args.push('-filter_complex', input.graph, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', input.encoder, '-b:a', input.encoder === 'aac' ? '192k' : '160k');
  if (input.encoder === 'aac') args.push('-movflags', '+faststart');
  args.push('-t', s3(input.filmS), input.out);
  return args;
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', ...args], { timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, _out, stderr) => resolve({ ok: !err, stderr: String(stderr ?? '') }));
  });
}

/** A media file's duration in seconds from ffmpeg's header read, or undefined. */
export async function probeDurationS(ffmpegPath: string, file: string): Promise<number | undefined> {
  const { stderr } = await runFfmpeg(ffmpegPath, ['-i', file]);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

/** Parses ffmpeg's ebur128 summary: integrated loudness (LUFS) and true peak (dBFS). */
export function parseLoudness(stderr: string): { lufs?: number; peakDb?: number; hasAudio: boolean } {
  if (/matches no streams|does not contain any stream|Output file #0 does not contain/i.test(stderr)) return { hasAudio: false };
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const i = /I:\s+(-?inf|-?\d+(?:\.\d+)?)\s+LUFS/i.exec(summary);
  const p = /Peak:\s+(-?inf|-?\d+(?:\.\d+)?)\s+dBFS/i.exec(summary);
  const val = (s: string | undefined): number | undefined => (s === undefined ? undefined : /inf/i.test(s) ? -Infinity : Number(s));
  return { lufs: val(i?.[1]), peakDb: val(p?.[1]), hasAudio: i !== null };
}

/** Proof by probe: the written file has an audio stream that isn't silent, with its measured loudness. */
export async function probeAudio(ffmpegPath: string, file: string): Promise<{ ok: true; lufs: number; peakDb?: number } | { ok: false; reason: 'missing' | 'silent'; lufs?: number }> {
  const { stderr } = await runFfmpeg(ffmpegPath, ['-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const r = parseLoudness(stderr);
  if (!r.hasAudio || r.lufs === undefined) return { ok: false, reason: 'missing' };
  if (!(r.lufs > SILENT_LUFS)) return { ok: false, reason: 'silent', lufs: r.lufs };
  return { ok: true, lufs: r.lufs, peakDb: r.peakDb };
}

export { runFfmpeg as runFfmpegForAudio };
