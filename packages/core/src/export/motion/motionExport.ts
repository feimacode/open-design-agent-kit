// Video and GIF export (openspec add-motion-export): renders an artifact on a
// virtual clock (virtualClock.ts), captures one frame per 1/fps step into a
// temporary folder, and encodes them with ffmpeg (ffmpeg.ts). Frames are
// kept on disk rather than piped, so a size budget can re-encode without
// capturing again. Host-agnostic: export_open_design_artifact routes the
// mp4/webm/gif formats here.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readArtifact, writeArtifactManifest } from '../../vendored/artifactCreate';
import type { JsonRecord } from '../../vendored/artifactManifest';
import { getFormat, isFluidHtml, unknownFormatError } from '../../poster/formats';
import { applyShape } from '../../poster/pageScripts';
import { openArtifactPage, type ArtifactPageSession } from '../artifactPage';
import { findBrowser } from '../browserDiscovery';
import { loadPage, mergeExportRecords } from '../exportArtifact';
import { isValidDimension, resolveExportSize } from '../exportSize';
import { findFfmpeg, type MotionFormat } from './ffmpeg';
import { SWIFTSHADER_ARGS } from '../webgl';
import { VIRTUAL_CLOCK_SCRIPT } from './virtualClock';

export const MOTION_FORMATS: readonly MotionFormat[] = ['mp4', 'webm', 'gif'];
export const MAX_MOTION_SECONDS = 60;
const DEFAULT_SECONDS = 6;
const CARD_SELECTOR = '[data-od-card]';

export function isMotionFormat(format: string | undefined): format is MotionFormat {
  return format === 'mp4' || format === 'webm' || format === 'gif';
}

export interface MotionExportOptions {
  workspaceRoot: string;
  entryPath: string;
  format: MotionFormat;
  /** Frames per second, 1–60. Default 30 (15 for GIF). */
  fps?: number;
  /** Seconds, 0.5–60. Default: resolved from the page. */
  duration?: number;
  /** GIF: loop forever (default true). */
  loop?: boolean;
  width?: number;
  height?: number;
  preset?: string;
  /** Device scale factor 1–3. Default 1. */
  scale?: number;
  maxBytes?: number;
  browserPath?: string;
  ffmpegPath?: string;
  lookupAspectHint?: (sourceSkillId: string) => Promise<string | undefined>;
  readyTimeoutMs?: number;
  settleMs?: number;
  /** Called after each captured frame. */
  onProgress?: (frame: number, total: number) => void;
  /** Checked between frames; true stops the export. */
  isCancelled?: () => boolean;
}

export type DurationSource = 'explicit' | 'data-duration' | 'animations' | 'default';

export type MotionExportResult =
  | {
      ok: true;
      motion: MotionFormat;
      files: Array<{ path: string; bytes: number; width: number; height: number }>;
      fps: number;
      frames: number;
      durationMs: number;
      durationSource: DurationSource;
      warnings: string[];
      ffmpegPath: string;
      browserPath: string;
    }
  | { ok: false; code: 'invalid-args' | 'not-found' | 'not-registered' | 'unsupported-kind' | 'no-browser' | 'no-ffmpeg' | 'ffmpeg-missing-encoder' | 'capture-failed' | 'encode-failed' | 'cancelled'; error: string };

const MOTION_RENDERERS = new Set(['html', 'mini-app', 'svg', 'diagram']);

function fail(code: Extract<MotionExportResult, { ok: false }>['code'], error: string): MotionExportResult {
  return { ok: false, code, error };
}

export function validateMotionOptions(o: Pick<MotionExportOptions, 'fps' | 'duration' | 'width' | 'height' | 'scale' | 'maxBytes' | 'preset'>): string | undefined {
  if (o.fps !== undefined && !(Number.isInteger(o.fps) && o.fps >= 1 && o.fps <= 60)) return 'fps must be an integer between 1 and 60.';
  if (o.duration !== undefined && !(typeof o.duration === 'number' && o.duration >= 0.5 && o.duration <= MAX_MOTION_SECONDS)) return `duration must be between 0.5 and ${MAX_MOTION_SECONDS} seconds.`;
  if ((o.width === undefined) !== (o.height === undefined)) return 'width and height must be given together.';
  if (o.width !== undefined && (!isValidDimension(o.width) || !isValidDimension(o.height!))) return 'width and height must be integers between 16 and 8192.';
  if (o.scale !== undefined && !(o.scale >= 1 && o.scale <= 3)) return 'scale must be between 1 and 3.';
  if (o.maxBytes !== undefined && !(Number.isInteger(o.maxBytes) && o.maxBytes > 0)) return 'maxBytes must be a positive integer.';
  if (o.preset !== undefined && !getFormat(o.preset)) return unknownFormatError(o.preset);
  if (o.preset !== undefined && getFormat(o.preset)!.medium !== 'screen') return 'Motion exports use screen formats; print formats have no video size.';
  return undefined;
}

/** Duration resolution order (openspec "Duration Resolution"): data-duration sum, else the longest finite animation, else the default. */
export function resolveDurationMs(page: { dataDurations: number[]; finiteAnimationEnds: number[]; infiniteAnimations: number }): { ms: number; source: DurationSource; note?: string } {
  const capMs = MAX_MOTION_SECONDS * 1000;
  const total = page.dataDurations.filter((d) => d > 0).reduce((a, b) => a + b, 0);
  if (total > 0) return { ms: Math.min(total, capMs), source: 'data-duration', note: total > capMs ? `data-duration adds up to ${total / 1000}s; capped at ${MAX_MOTION_SECONDS}s.` : undefined };
  const longest = Math.max(0, ...page.finiteAnimationEnds);
  if (longest > 0) return { ms: Math.min(longest, capMs), source: 'animations', note: longest > capMs ? `The longest animation runs ${longest / 1000}s; capped at ${MAX_MOTION_SECONDS}s.` : undefined };
  return {
    ms: DEFAULT_SECONDS * 1000,
    source: 'default',
    note: page.infiniteAnimations > 0 ? `Only looping animations were found, so ${DEFAULT_SECONDS}s was used; pass duration to change it.` : `No duration was declared (data-duration or a finite CSS animation), so ${DEFAULT_SECONDS}s was used; pass duration to change it.`,
  };
}

function ffmpeg(ffmpegPath: string, args: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, _out, stderr) =>
      resolve(err ? { ok: false, error: String(stderr || err.message).trim().split('\n').slice(-6).join('\n') } : { ok: true }),
    );
  });
}

interface EncodeInput {
  ffmpegPath: string;
  format: MotionFormat;
  webmCodec: 'libvpx-vp9' | 'libvpx';
  framesDir: string;
  frameExt: 'jpg' | 'png';
  fps: number;
  width: number;
  loop: boolean;
  out: string;
  /** Video: target bitrate in kbit/s instead of constant quality. */
  kbps?: number;
  /** GIF: output frame rate and width. */
  gifFps?: number;
  gifWidth?: number;
}

export function encodeArgs(e: EncodeInput): string[] {
  const input = ['-framerate', String(e.fps), '-i', path.join(e.framesDir, `frame-%05d.${e.frameExt}`)];
  if (e.format === 'gif') {
    const w = e.gifWidth ?? e.width;
    const filter = `fps=${e.gifFps ?? e.fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`;
    return [...input, '-vf', filter, '-loop', e.loop ? '0' : '-1', e.out];
  }
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const rate = e.kbps ? ['-b:v', `${e.kbps}k`, '-maxrate', `${e.kbps}k`, '-bufsize', `${e.kbps * 2}k`] : [];
  if (e.format === 'mp4') {
    return [...input, '-vf', even, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', ...(e.kbps ? rate : ['-crf', '20']), '-movflags', '+faststart', e.out];
  }
  const quality = e.webmCodec === 'libvpx-vp9' ? (e.kbps ? rate : ['-b:v', '0', '-crf', '32']) : e.kbps ? rate : ['-b:v', '2M', '-crf', '10'];
  return [...input, '-vf', even, '-c:v', e.webmCodec, ...(e.webmCodec === 'libvpx-vp9' ? ['-row-mt', '1'] : []), '-pix_fmt', 'yuv420p', ...quality, e.out];
}

async function size(p: string): Promise<number> {
  return (await fs.stat(p)).size;
}

/** Encodes once, then (with maxBytes) re-encodes smaller until it fits: lower bitrate for video, fewer frames then a narrower image for GIF. */
async function encodeWithinBudget(base: EncodeInput, maxBytes: number | undefined, durationMs: number, warnings: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const first = await ffmpeg(base.ffmpegPath, encodeArgs(base));
  if (!first.ok) return first;
  if (maxBytes === undefined || (await size(base.out)) <= maxBytes) return first;
  const attempts: EncodeInput[] = [];
  if (base.format === 'gif') {
    const f0 = base.gifFps ?? base.fps;
    for (const f of [12, 10].filter((f) => f < f0)) attempts.push({ ...base, gifFps: f });
    let w = base.width;
    for (let i = 0; i < 3; i++) {
      w = Math.max(64, Math.round(w * 0.8));
      attempts.push({ ...base, gifFps: Math.min(f0, 10), gifWidth: w });
    }
  } else {
    const kbps = Math.max(100, Math.floor(((maxBytes * 8) / (durationMs / 1000) / 1000) * 0.92));
    attempts.push({ ...base, kbps }, { ...base, kbps: Math.max(80, Math.floor(kbps * 0.75)) });
  }
  let best = { bytes: await size(base.out), input: base };
  const tmp = `${base.out}.try${path.extname(base.out)}`;
  for (const a of attempts) {
    const r = await ffmpeg(a.ffmpegPath, encodeArgs({ ...a, out: tmp }));
    if (!r.ok) continue;
    const bytes = await size(tmp);
    if (bytes < best.bytes) {
      await fs.copyFile(tmp, base.out);
      best = { bytes, input: a };
    }
    if (bytes <= maxBytes) break;
  }
  await fs.rm(tmp, { force: true });
  const how = base.format === 'gif' ? `at ${best.input.gifFps ?? base.fps} fps${best.input.gifWidth ? `, ${best.input.gifWidth}px wide` : ''}` : best.input.kbps ? `at ${best.input.kbps} kbit/s` : '';
  if (best.bytes > maxBytes) warnings.push(`${path.basename(base.out)}: ${best.bytes} bytes is still over the ${maxBytes}-byte budget at the smallest setting tried (${how}). Shorten it, lower fps, or export a smaller size.`);
  else if (best.input !== base) warnings.push(`${path.basename(base.out)}: re-encoded ${how} to fit ${maxBytes} bytes.`);
  return { ok: true };
}

export async function exportMotion(options: MotionExportOptions): Promise<MotionExportResult> {
  const invalid = validateMotionOptions(options);
  if (invalid) return fail('invalid-args', invalid);
  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath: options.entryPath });
  } catch (err) {
    return fail('invalid-args', err instanceof Error ? err.message : String(err));
  }
  if (!artifact) return fail('not-found', `No artifact entry file found at ${options.entryPath}.`);
  if (!artifact.manifest) return fail('not-registered', `${options.entryPath} exists but isn't registered (no .artifact.json sidecar). Call register_open_design_artifact first.`);
  const manifest = artifact.manifest;
  const renderer = typeof manifest.renderer === 'string' ? manifest.renderer : 'html';
  if (!MOTION_RENDERERS.has(renderer)) {
    return fail('unsupported-kind', `Artifacts rendered as "${renderer}" can't be exported as video. Decks: export slides as images or PDF; HyperFrames compositions render with the HyperFrames CLI.`);
  }

  const ff = await findFfmpeg(options.format, { explicitPath: options.ffmpegPath });
  if (!ff.ok) return fail(ff.code, ff.message);
  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return fail('no-browser', browser.message);

  const fps = options.fps ?? (options.format === 'gif' ? 15 : 30);
  const scale = options.scale ?? 1;
  const sourceSkillId = typeof manifest.sourceSkillId === 'string' ? manifest.sourceSkillId : undefined;
  const recordedId = manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as JsonRecord).format : undefined;
  const canvas = getFormat(options.preset) ?? (typeof recordedId === 'string' && getFormat(recordedId)?.medium === 'screen' ? getFormat(recordedId) : undefined);
  const aspectHint = sourceSkillId && options.lookupAspectHint ? await options.lookupAspectHint(sourceSkillId) : undefined;
  const sized = resolveExportSize({ width: options.width, height: options.height, aspectHint, sourceSkillId, canvas: canvas ? { format: canvas, source: options.preset ? 'preset' : 'recorded-format' } : undefined });
  const fluid = isFluidHtml(artifact.entryContent);

  const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath)).split(path.sep).join('/');
  const entryDir = path.posix.dirname(relEntry);
  const base = path.posix.basename(relEntry, path.posix.extname(relEntry));
  const warnings: string[] = [];
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-motion-'));
  let session: ArtifactPageSession | undefined;
  try {
    session = await openArtifactPage({ workspaceRoot: options.workspaceRoot, relEntry, executablePath: browser.executablePath, extraArgs: SWIFTSHADER_ARGS });
    const { page } = session;
    await page.evaluateOnNewDocument(VIRTUAL_CLOCK_SCRIPT);
    await page.setViewport({ width: sized.viewport.width, height: sized.viewport.height, deviceScaleFactor: scale });
    // A turntable keeps turning: the scene's own clock (virtual here) drives it.
    await loadPage(page, session.url, options.readyTimeoutMs ?? 15000, options.settleMs ?? 300, warnings, { still: false });
    if (fluid && canvas) await page.evaluate(applyShape, CARD_SELECTOR, { widthCss: `${canvas.width}px`, heightCss: `${canvas.height}px`, bleedCss: '0mm' });
    await page.evaluate('window.__odClock.advanceTo(0)');
    await page.evaluate('window.__odClock.painted()');

    let durationMs: number;
    let durationSource: DurationSource;
    if (options.duration !== undefined) {
      durationMs = Math.round(options.duration * 1000);
      durationSource = 'explicit';
    } else {
      const facts = (await page.evaluate(`(() => {
        const dataDurations = Array.prototype.map.call(document.querySelectorAll('[data-duration]'), (el) => Number(el.getAttribute('data-duration')) || 0);
        const finiteAnimationEnds = [];
        let infiniteAnimations = 0;
        for (const a of document.getAnimations ? document.getAnimations() : []) {
          const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : 0;
          if (end === Infinity) infiniteAnimations++;
          else if (end > 0) finiteAnimationEnds.push(end);
        }
        return { dataDurations, finiteAnimationEnds, infiniteAnimations };
      })()`)) as { dataDurations: number[]; finiteAnimationEnds: number[]; infiniteAnimations: number };
      const resolved = resolveDurationMs(facts);
      durationMs = resolved.ms;
      durationSource = resolved.source;
      if (resolved.note) warnings.push(resolved.note);
    }

    // Capture region: the design's card when it has one, else the viewport.
    const card = await page.$(CARD_SELECTOR);
    const box = card ? await card.boundingBox() : null;
    const clip = box && box.width >= 1 && box.height >= 1 ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : { x: 0, y: 0, width: sized.viewport.width, height: sized.viewport.height };
    const frameExt: 'jpg' | 'png' = options.format === 'gif' ? 'png' : 'jpg';
    const total = Math.max(1, Math.round((durationMs / 1000) * fps));
    for (let i = 0; i < total; i++) {
      if (options.isCancelled?.()) return fail('cancelled', 'Export cancelled.');
      await page.evaluate(`window.__odClock.advanceTo(${(i * 1000) / fps})`);
      await page.evaluate('window.__odClock.painted()');
      const shot = await page.screenshot(frameExt === 'png' ? { type: 'png', clip } : { type: 'jpeg', quality: 92, clip });
      await fs.writeFile(path.join(framesDir, `frame-${String(i + 1).padStart(5, '0')}.${frameExt}`), shot);
      options.onProgress?.(i + 1, total);
    }
    const workers = Number(await page.evaluate('window.__odClock.workers()'));
    if (workers > 0) warnings.push('The page starts a Web Worker, whose timers run on real time: anything it animates may not match the frames.');
    if (await page.$('video')) warnings.push('The page has a <video> element; it shows whatever frame it is on, not one synced to the export.');
    await session.close();
    session = undefined;

    const width = Math.round(clip.width * scale);
    const height = Math.round(clip.height * scale);
    const relOut = path.posix.join(entryDir, 'exports', `${base}.${options.format}`);
    const absOut = path.join(options.workspaceRoot, relOut);
    await fs.mkdir(path.dirname(absOut), { recursive: true });
    const encoded = await encodeWithinBudget(
      { ffmpegPath: ff.path, format: options.format, webmCodec: ff.webmCodec, framesDir, frameExt, fps, width, loop: options.loop ?? true, out: absOut },
      options.maxBytes,
      durationMs,
      warnings,
    );
    if (!encoded.ok) return fail('encode-failed', `ffmpeg (${ff.path}) failed: ${encoded.error}`);
    const bytes = await size(absOut);
    try {
      await writeArtifactManifest({
        workspaceRoot: options.workspaceRoot,
        entryPath: options.entryPath,
        artifactManifest: { ...manifest, metadata: mergeExportRecords(manifest.metadata, [{ path: relOut, width, height, scale, format: options.format, exportedAt: new Date().toISOString() }]) },
      });
    } catch (err) {
      warnings.push(`Exported, but couldn't record the export in the manifest: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { ok: true, motion: options.format, files: [{ path: relOut, bytes, width, height }], fps, frames: total, durationMs, durationSource, warnings, ffmpegPath: ff.path, browserPath: browser.executablePath };
  } catch (err) {
    return fail('capture-failed', `Motion export failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await session?.close();
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const SOURCE_TEXT: Record<DurationSource, string> = {
  explicit: 'the duration you passed',
  'data-duration': "the frames' data-duration values",
  animations: 'the longest CSS/Web animation',
  default: 'the default',
};

export function formatMotionExportResult(result: MotionExportResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  const f = result.files[0];
  const lines = [
    `Exported ${result.motion.toUpperCase()}:`,
    `- ${f.path} — ${f.width}×${f.height}px, ${(f.bytes / 1024).toFixed(0)} KB`,
    `${(result.durationMs / 1000).toFixed(2)}s at ${result.fps} fps (${result.frames} frames); duration from ${SOURCE_TEXT[result.durationSource]}.`,
  ];
  if (result.warnings.length > 0) lines.push('Warnings:', ...result.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
