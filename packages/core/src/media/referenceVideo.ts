// Reference video inspection (openspec add-reference-video-replication).
// Adapted from upstream open-design's apps/daemon/src/media/motion-reference.ts
// (nexu-io/open-design @ 0701042f3d2957fe485bb8508652e40ec6dae832, Apache-2.0):
// the same measurements (scene threshold 0.3, at most 24 frames at least 0.4 s
// apart, 200 MB and 180 s limits) so its replication rules stay true, but
// through the kit's own ffmpeg discovery and for files only: no links, no
// yt-dlp, no downloads. Turns a video into facts the agent reads; nothing
// here interprets the film.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ffmpegCandidates, FFMPEG_PATH_ENV } from '../export/motion/ffmpeg';

export const REFERENCE_MAX_BYTES = 200 * 1024 * 1024;
export const REFERENCE_MAX_SECONDS = 180;
export const SCENE_THRESHOLD = 0.3;
const MAX_FRAMES = 24;
const MIN_FRAME_GAP_SECONDS = 0.4;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
/** Workspace-relative folder under the output dir. */
export const REFERENCES_DIR = '.references';

export interface ReferenceFacts {
  referenceId: string;
  /** The video, workspace-relative, as given. */
  source: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  /** Shot cuts in seconds from scene detection. */
  cuts: number[];
  frames: Array<{ path: string; at: number }>;
  contactSheet: string;
  audio: string | null;
  /** The folder holding everything, workspace-relative. */
  dir: string;
  inspectedAt: string;
}

export type InspectReferenceResult =
  | { ok: true; facts: ReferenceFacts; contact: Buffer }
  | { ok: false; code: 'link' | 'invalid-args' | 'not-found' | 'unsupported' | 'too-large' | 'too-long' | 'not-video' | 'no-ffmpeg' | 'probe-failed'; error: string };

function run(file: string, args: string[], timeout = 120_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, _out, stderr) => resolve({ code: err ? 1 : 0, stderr: String(stderr ?? '') }));
  });
}

/** Duration, size, fps and stream presence from ffmpeg's header read. */
export function parseProbe(stderr: string): { durationSec: number; width: number; height: number; fps: number; hasAudio: boolean; hasVideo: boolean } {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSec = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const video = /Stream #\S+.*?Video:([^\n]*)/.exec(stderr);
  const desc = video?.[1] ?? '';
  const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(desc);
  const fps = /([\d.]+)\s*fps/.exec(desc) ?? /([\d.]+)\s*tbr/.exec(desc);
  return {
    durationSec: Math.round(durationSec * 1000) / 1000,
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    fps: fps ? Math.round(Number(fps[1]) * 100) / 100 : 0,
    hasAudio: /Stream #\S+.*?Audio:/.test(stderr),
    hasVideo: Boolean(video) && !/Input #0, tty/.test(stderr),
  };
}

/** Shot-cut times from ffmpeg's scene score (showinfo pts_time lines). */
export function parseCuts(stderr: string, durationSec: number): number[] {
  const cuts: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Math.round(Number(m[1]) * 1000) / 1000;
    if (t <= 0.05 || (durationSec && t >= durationSec - 0.05)) continue;
    if (cuts.length && t - cuts[cuts.length - 1] < 0.2) continue;
    cuts.push(t);
  }
  return cuts.slice(0, 80);
}

/** One frame early in every shot, an even grid, the opening and the end, at least 0.4 s apart, thinned to 24. */
export function pickFrameTimes(cuts: number[], durationSec: number): number[] {
  const end = Math.max(0, durationSec - 0.2);
  const starts = [0, ...cuts];
  // A frame early in every shot comes first; the grid only fills the gaps.
  const keep: number[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : durationSec;
    keep.push(Math.min(end, i === 0 ? 0 : from + Math.min(0.3, (to - from) / 3)));
  }
  const round = (t: number): number => Math.round(t * 100) / 100;
  const spaced = [...new Set(keep.map(round))].sort((a, b) => a - b);
  const grid = Math.max(1, durationSec / (MAX_FRAMES - 2));
  const fill: number[] = [];
  for (let t = grid; t < end; t += grid) fill.push(round(t));
  fill.push(round(end));
  for (const t of fill) if (spaced.every((x) => Math.abs(x - t) >= MIN_FRAME_GAP_SECONDS)) spaced.push(t);
  spaced.sort((a, b) => a - b);
  if (spaced.length <= MAX_FRAMES) return spaced;
  const step = (spaced.length - 1) / (MAX_FRAMES - 1);
  return Array.from({ length: MAX_FRAMES }, (_, i) => spaced[Math.round(i * step)]);
}

/** The first ffmpeg that runs (inspection only decodes, so any build will do). */
export async function findAnyFfmpeg(explicitPath?: string): Promise<string | undefined> {
  const { found } = await ffmpegCandidates({ explicitPath });
  for (const p of found) if ((await run(p, ['-hide_banner', '-version'], 15_000)).code === 0) return p;
  return undefined;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'reference';

export function isVideoLink(source: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(source.trim()) || /^www\./i.test(source.trim());
}

export const LINK_ANSWER =
  "Reference videos are read from files, not links: the kit doesn't download from video sites. Ask the user to download the video (or record the part they like) and attach the file, then call this again with its path in the workspace.";

/** Inspects a workspace video and writes `<outputDir>/.references/<id>/`. */
export async function inspectReferenceVideo(input: { workspaceRoot: string; outputDir: string; video: string; ffmpegPath?: string }): Promise<InspectReferenceResult> {
  const source = (input.video ?? '').trim();
  if (!source) return { ok: false, code: 'invalid-args', error: 'Pass video: the path of a video file in the workspace.' };
  if (isVideoLink(source)) return { ok: false, code: 'link', error: LINK_ANSWER };
  const root = path.resolve(input.workspaceRoot);
  const abs = path.resolve(root, source);
  if (!abs.startsWith(root + path.sep)) return { ok: false, code: 'invalid-args', error: `${source} is outside the workspace. Copy the video into the workspace first.` };
  const ext = path.extname(abs).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) return { ok: false, code: 'unsupported', error: `${source} isn't a video the kit reads (${[...VIDEO_EXTENSIONS].join(', ')}).` };
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return { ok: false, code: 'not-found', error: `No file at ${source}.` };
  }
  if (!stat.isFile()) return { ok: false, code: 'not-found', error: `${source} isn't a file.` };
  if (stat.size > REFERENCE_MAX_BYTES) return { ok: false, code: 'too-large', error: `${source} is ${(stat.size / 1024 / 1024).toFixed(0)} MB; references up to ${REFERENCE_MAX_BYTES / 1024 / 1024} MB are supported. Trim it to the part to replicate.` };

  const ff = await findAnyFfmpeg(input.ffmpegPath);
  if (!ff) return { ok: false, code: 'no-ffmpeg', error: `No ffmpeg was found. Install ffmpeg (e.g. \`brew install ffmpeg\`, \`sudo apt install ffmpeg\` or \`winget install ffmpeg\`), or set ${FFMPEG_PATH_ENV} to its path.` };
  const probe = parseProbe((await run(ff, ['-hide_banner', '-i', abs], 60_000)).stderr);
  if (!probe.hasVideo || !probe.durationSec) return { ok: false, code: 'not-video', error: `${source} isn't a readable video.` };
  if (probe.durationSec > REFERENCE_MAX_SECONDS) return { ok: false, code: 'too-long', error: `${source} is ${probe.durationSec.toFixed(1)} s; references up to ${REFERENCE_MAX_SECONDS} s are supported. Trim it and attach the part to replicate.` };

  const rel = path.relative(root, abs).split(path.sep).join('/');
  const id = `${slug(path.basename(abs, ext))}-${createHash('sha256').update(`${rel}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 6)}`;
  const relDir = path.posix.join(input.outputDir, REFERENCES_DIR, id);
  const dir = path.join(root, relDir);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, 'frames'), { recursive: true });

  const scene = await run(ff, ['-hide_banner', '-nostats', '-i', abs, '-an', '-vf', `scale=480:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-'], 300_000);
  const cuts = parseCuts(scene.stderr, probe.durationSec);
  const frames: ReferenceFacts['frames'] = [];
  for (const at of pickFrameTimes(cuts, probe.durationSec)) {
    const name = `frame-${String(frames.length + 1).padStart(2, '0')}.jpg`;
    const out = path.join(dir, 'frames', name);
    const shot = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', abs, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', out], 60_000);
    if (shot.code === 0 && (await fs.stat(out).catch(() => null))?.size) frames.push({ path: path.posix.join(relDir, 'frames', name), at });
  }
  if (frames.length === 0) return { ok: false, code: 'probe-failed', error: `Couldn't read frames from ${source}.` };

  let audio: string | null = null;
  if (probe.hasAudio) {
    const out = path.join(dir, 'audio.wav');
    const pulled = await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', abs, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', out], 120_000);
    if (pulled.code === 0 && (await fs.stat(out).catch(() => null))?.size) audio = path.posix.join(relDir, 'audio.wav');
  }

  const columns = Math.min(4, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const contactAbs = path.join(dir, 'contact.jpg');
  await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(dir, 'frames', 'frame-%02d.jpg'), '-vf', `scale=480:-2,tile=${columns}x${rows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', contactAbs], 60_000);
  const contact = await fs.readFile(contactAbs).catch(() => undefined);
  if (!contact) return { ok: false, code: 'probe-failed', error: `Couldn't make the contact sheet for ${source}.` };

  const facts: ReferenceFacts = {
    referenceId: id,
    source: rel,
    durationSec: probe.durationSec,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    hasAudio: probe.hasAudio,
    cuts,
    frames,
    contactSheet: path.posix.join(relDir, 'contact.jpg'),
    audio,
    dir: relDir,
    inspectedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(dir, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  return { ok: true, facts, contact };
}

/** Reads a saved reference's facts, or undefined. */
export async function readReferenceFacts(workspaceRoot: string, outputDir: string, referenceId: string): Promise<ReferenceFacts | undefined> {
  if (!/^[a-z0-9-]+$/.test(referenceId)) return undefined;
  try {
    return JSON.parse(await fs.readFile(path.join(workspaceRoot, outputDir, REFERENCES_DIR, referenceId, 'facts.json'), 'utf8')) as ReferenceFacts;
  } catch {
    return undefined;
  }
}

/** Shot boundaries of the reference: 0, each cut, as beat starts in seconds. */
export function referenceBeats(facts: Pick<ReferenceFacts, 'cuts'>): number[] {
  return [0, ...facts.cuts];
}

/** `reference-timing-drift`: each design beat start more than `tolerance` seconds from the nearest reference beat. */
export function timingDrift(designBeats: number[], referenceStarts: number[], tolerance = 0.25): Array<{ beat: number; at: number; nearest: number; diff: number }> {
  const out: Array<{ beat: number; at: number; nearest: number; diff: number }> = [];
  designBeats.forEach((at, i) => {
    if (referenceStarts.length === 0) return;
    const nearest = referenceStarts.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a));
    const diff = Math.round((at - nearest) * 100) / 100;
    if (Math.abs(diff) > tolerance) out.push({ beat: i + 1, at, nearest, diff });
  });
  return out;
}

/** The facts as text for a tool result or a brief. */
export function formatReferenceFacts(f: ReferenceFacts): string {
  return [
    `Reference ${f.referenceId} (${f.source}): ${f.durationSec.toFixed(2)} s, ${f.width}×${f.height}, ${f.fps} fps, ${f.hasAudio ? 'with sound' : 'silent'}.`,
    `Cuts (s): ${f.cuts.length ? f.cuts.map((c) => c.toFixed(2)).join(', ') : 'none detected (one shot, or soft transitions: read the frames)'}.`,
    `Shots: ${referenceBeats(f)
      .map((s, i, all) => `${i + 1}) ${s.toFixed(2)}–${(all[i + 1] ?? f.durationSec).toFixed(2)} s`)
      .join('; ')}.`,
    `Files in ${f.dir}: facts.json, contact.jpg, ${f.frames.length} frames in frames/ (at ${f.frames.map((x) => `${x.at}s`).join(', ')})${f.audio ? ', audio.wav' : ''}.`,
    f.audio ? 'The soundtrack (audio.wav) may be reused in the film only after the user confirms they own it or may use it.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The brief's Reference video section: the measured facts, and for "like this, for my brand" the rule that the
 * active design system replaces the reference's look. The reference-video craft doc is attached beside it.
 */
export function referenceBriefSection(facts: ReferenceFacts, designSystemName?: string): string {
  const brand = designSystemName
    ? `For "like this, for my brand", keep the reference's beats, rhythm, motion grammar and composition, and take colours, type and motion from ${designSystemName}'s design system (its tokens and the Motion section above), not from the reference.`
    : 'For "like this, for my brand", keep the reference\'s beats, rhythm, motion grammar and composition, and take colours, type and motion from the active design system when there is one.';
  return [
    '## Reference video',
    '',
    `Measured from the user's file (view \`${facts.contactSheet}\` and the frames before writing the beat map):`,
    '',
    formatReferenceFacts(facts),
    '',
    '**Measure the timeline; never estimate it.** Build every beat start and length from the cuts above (as `data-duration` frames or timeline positions), and use the frames as the evidence for what happens inside a shot.',
    '',
    `${brand} The reference's logos, people, footage and words are not reused unless the user asks and has the right to. Only rebuild the film as it is ("make the same film") for the user's own material.`,
    '',
    `After building, check it with \`check_open_design_artifact\` and \`referenceId: "${facts.referenceId}"\`: it pairs the design with the reference at each cut and reports \`reference-timing-drift\`.`,
  ].join('\n');
}
