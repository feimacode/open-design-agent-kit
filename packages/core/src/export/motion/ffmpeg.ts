// Finds and probes ffmpeg for motion exports (openspec add-motion-export,
// "ffmpeg Discovery and Probing"). Same posture as browserDiscovery.ts: an
// explicit path wins, then PATH, then well-known installs (including
// Playwright's cache); ffmpeg is never downloaded. Builds differ in what they
// can encode (Playwright's own is VP8-only), so each candidate is probed and
// the first one that can make the requested format is used.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const FFMPEG_PATH_ENV = 'OPEN_DESIGN_FFMPEG_PATH';

export type MotionFormat = 'mp4' | 'webm' | 'gif';

export interface FfmpegCapabilities {
  h264: boolean;
  vp9: boolean;
  vp8: boolean;
  gif: boolean;
}

export type FfmpegDiscovery =
  | { ok: true; path: string; capabilities: FfmpegCapabilities; webmCodec: 'libvpx-vp9' | 'libvpx' }
  | { ok: false; code: 'no-ffmpeg' | 'ffmpeg-missing-encoder'; message: string };

export interface FfmpegDiscoveryOptions {
  explicitPath?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  /** Injected for tests: returns `ffmpeg -encoders` and `-filters` output, or undefined when it can't run. */
  probe?: (ffmpegPath: string) => Promise<{ encoders: string; filters: string } | undefined>;
  /** Injected for tests. */
  listDir?: (dir: string) => Promise<string[]>;
  isFile?: (p: string) => Promise<boolean>;
}

function run(file: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 15_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => resolve(err ? undefined : String(stdout)));
  });
}

async function defaultProbe(ffmpegPath: string): Promise<{ encoders: string; filters: string } | undefined> {
  const encoders = await run(ffmpegPath, ['-hide_banner', '-encoders']);
  if (encoders === undefined) return undefined;
  const filters = (await run(ffmpegPath, ['-hide_banner', '-filters'])) ?? '';
  return { encoders, filters };
}

async function defaultIsFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

async function defaultListDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export function parseCapabilities(probe: { encoders: string; filters: string }): FfmpegCapabilities {
  const has = (re: RegExp, text: string) => re.test(text);
  return {
    h264: has(/^\s*V\S*\s+libx264\b/m, probe.encoders),
    vp9: has(/^\s*V\S*\s+libvpx-vp9\b/m, probe.encoders),
    vp8: has(/^\s*V\S*\s+libvpx\s/m, probe.encoders),
    gif: has(/^\s*V\S*\s+gif\b/m, probe.encoders) && has(/\bpalettegen\b/, probe.filters) && has(/\bpaletteuse\b/, probe.filters),
  };
}

function supports(c: FfmpegCapabilities, format: MotionFormat): boolean {
  return format === 'mp4' ? c.h264 : format === 'webm' ? c.vp9 || c.vp8 : c.gif;
}

function describeCapabilities(c: FfmpegCapabilities): string {
  const can = [c.h264 ? 'MP4' : '', c.vp9 || c.vp8 ? `WebM (${c.vp9 ? 'VP9' : 'VP8'})` : '', c.gif ? 'GIF' : ''].filter(Boolean);
  return can.length > 0 ? `it can make ${can.join(', ')}` : 'it can make none of MP4, WebM or GIF';
}

const NEEDS: Record<MotionFormat, string> = {
  mp4: 'the H.264 encoder (libx264)',
  webm: 'a VP9 or VP8 encoder (libvpx)',
  gif: 'the GIF encoder with the palettegen and paletteuse filters',
};

/** Candidate ffmpeg paths in priority order (existing files only). */
export async function ffmpegCandidates(options: FfmpegDiscoveryOptions = {}): Promise<{ found: string[]; searched: string[] }> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? os.homedir();
  const isFile = options.isFile ?? defaultIsFile;
  const listDir = options.listDir ?? defaultListDir;
  const exe = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const searched: string[] = [];
  const explicit = options.explicitPath || env[FFMPEG_PATH_ENV];
  if (explicit) searched.push(explicit);
  for (const dir of String(env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) searched.push(path.join(dir, exe));
  if (platform === 'darwin') searched.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg');
  if (platform === 'linux') searched.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg', path.join(home, '.local', 'bin', 'ffmpeg'));
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    searched.push(path.join(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'), 'C:\\ffmpeg\\bin\\ffmpeg.exe', path.join(env.ProgramFiles ?? 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'));
  }
  // Playwright's cache ships a VP8-only ffmpeg: tried last.
  const cache = platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'ms-playwright') : platform === 'win32' ? path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'ms-playwright') : path.join(home, '.cache', 'ms-playwright');
  const binary = platform === 'darwin' ? 'ffmpeg-mac' : platform === 'win32' ? 'ffmpeg-win64.exe' : 'ffmpeg-linux';
  for (const dir of (await listDir(cache)).filter((d) => d.startsWith('ffmpeg-')).sort().reverse()) searched.push(path.join(cache, dir, binary));

  const found: string[] = [];
  for (const p of searched) if (!found.includes(p) && (await isFile(p))) found.push(p);
  return { found, searched };
}

/** The first ffmpeg that can make `format`, or a structured error. */
export async function findFfmpeg(format: MotionFormat, options: FfmpegDiscoveryOptions = {}): Promise<FfmpegDiscovery> {
  const probe = options.probe ?? defaultProbe;
  const { found, searched } = await ffmpegCandidates(options);
  const seen: Array<{ path: string; capabilities: FfmpegCapabilities }> = [];
  for (const p of found) {
    const out = await probe(p);
    if (!out) continue;
    const capabilities = parseCapabilities(out);
    seen.push({ path: p, capabilities });
    if (supports(capabilities, format)) return { ok: true, path: p, capabilities, webmCodec: capabilities.vp9 ? 'libvpx-vp9' : 'libvpx' };
  }
  if (seen.length === 0) {
    return {
      ok: false,
      code: 'no-ffmpeg',
      message: `No ffmpeg was found. Looked in: ${searched.slice(0, 12).join(', ')}${searched.length > 12 ? ', …' : ''}. Install ffmpeg (e.g. \`brew install ffmpeg\`, \`sudo apt install ffmpeg\` or \`winget install ffmpeg\`), or set ${FFMPEG_PATH_ENV} (VS Code: openDesign.export.ffmpegPath) to its path.`,
    };
  }
  const first = seen[0];
  return {
    ok: false,
    code: 'ffmpeg-missing-encoder',
    message: `${format.toUpperCase()} needs ${NEEDS[format]}, which the ffmpeg at ${first.path} doesn't have; ${describeCapabilities(first.capabilities)}. Install a full ffmpeg build (e.g. \`brew install ffmpeg\`, \`sudo apt install ffmpeg\`) or set ${FFMPEG_PATH_ENV} to one.`,
  };
}
