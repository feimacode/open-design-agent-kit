import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ContentIndex, exportArtifact, formatExportResult, PASTE_TARGETS, type ExportArtifactOptions, type ExportFormat, type PasteTarget } from '@feimacode/open-design-agent-kit-core';
import { TROUBLESHOOTING_URL } from './docsLinks';
import { getContentAssetsRoot } from './env';

export interface ExportCliOptions {
  width?: string;
  height?: string;
  scale?: string;
  format?: string;
  quality?: string;
  selector?: string;
  maxBytes?: string;
  browser?: string;
  workspace?: string;
  deck?: boolean;
  /** Comma-separated 1-based slide numbers, e.g. "1,3". */
  slides?: string;
  /** --badge / --no-badge (standalone and site only); undefined keeps the format default. */
  badge?: boolean;
  preset?: string;
  bleed?: string;
  cropMarks?: boolean;
  check?: boolean;
  /** Relative to the current directory, like the entry path. */
  data?: string;
  sheet?: string;
  nameField?: string;
  split?: boolean;
  /** Comma-separated format ids. */
  presets?: string;
  shapeSheet?: boolean;
  /** paste: wechat, notion, newsletter or generic. */
  target?: string;
  /** site, email, paste: where the files will be hosted. */
  baseUrl?: string;
  campaignSheet?: boolean;
  fps?: string;
  duration?: string;
  /** --loop / --no-loop (gif). */
  loop?: boolean;
  ffmpeg?: string;
}

export class ExportArgsError extends Error {}

function parseIntFlag(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ExportArgsError(`--${name} must be an integer (got "${value}").`);
  return n;
}

function parseNumberFlag(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ExportArgsError(`--${name} must be a number (got "${value}").`);
  return n;
}

function parseTarget(value: string | undefined): PasteTarget | undefined {
  if (value === undefined) return undefined;
  if (!(PASTE_TARGETS as readonly string[]).includes(value)) throw new ExportArgsError(`--target must be ${PASTE_TARGETS.join(', ')} (got "${value}").`);
  return value as PasteTarget;
}

/** Maps CLI string flags onto exportArtifact options (range checks happen in core). */
export function parseExportFlags(flags: ExportCliOptions): Omit<ExportArtifactOptions, 'workspaceRoot' | 'entryPath'> {
  let format: ExportFormat | undefined;
  if (flags.format !== undefined) {
    const f = flags.format.toLowerCase();
    if (f === 'png' || f === 'pdf' || f === 'pptx' || f === 'standalone' || f === 'site' || f === 'email' || f === 'paste' || f === 'mp4' || f === 'webm' || f === 'gif') format = f;
    else if (f === 'jpeg' || f === 'jpg') format = 'jpeg';
    else throw new ExportArgsError(`--format must be png, jpeg, pdf, pptx, standalone, site, email, paste, mp4, webm or gif (got "${flags.format}").`);
  }
  let slides: number[] | undefined;
  if (flags.slides !== undefined) {
    slides = flags.slides.split(',').map((part) => {
      const n = Number(part.trim());
      if (!Number.isInteger(n) || n < 1) throw new ExportArgsError(`--slides must be comma-separated slide numbers like 1,3 (got "${flags.slides}").`);
      return n;
    });
  }
  return {
    width: parseIntFlag('width', flags.width),
    height: parseIntFlag('height', flags.height),
    scale: parseNumberFlag('scale', flags.scale),
    quality: parseIntFlag('quality', flags.quality),
    maxBytes: parseIntFlag('max-bytes', flags.maxBytes),
    format,
    selector: flags.selector,
    browserPath: flags.browser,
    deck: flags.deck,
    slides,
    badge: flags.badge,
    preset: flags.preset,
    bleed: parseNumberFlag('bleed', flags.bleed),
    cropMarks: flags.cropMarks,
    checkOnly: flags.check,
    data: flags.data,
    sheet: flags.sheet,
    nameField: flags.nameField,
    split: flags.split,
    presets: flags.presets === undefined ? undefined : flags.presets.split(',').map((id) => id.trim()).filter(Boolean),
    shapeSheet: flags.shapeSheet,
    target: parseTarget(flags.target),
    baseUrl: flags.baseUrl,
    campaignSheet: flags.campaignSheet,
    fps: parseIntFlag('fps', flags.fps),
    duration: parseNumberFlag('duration', flags.duration),
    loop: flags.loop,
    ffmpegPath: flags.ffmpeg,
  };
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The workspace an artifact belongs to: an explicit --workspace, else the
 * nearest ancestor of the entry file that contains an `.open-design/`
 * directory, else the current directory.
 */
export async function resolveWorkspaceRoot(entryPath: string, explicit: string | undefined, cwd: string): Promise<string> {
  if (explicit) return path.resolve(cwd, explicit);
  let dir = path.dirname(path.resolve(cwd, entryPath));
  for (;;) {
    if (await isDirectory(path.join(dir, '.open-design'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return cwd;
    dir = parent;
  }
}

export async function runExport(entryArg: string, flags: ExportCliOptions, cwd = process.cwd()): Promise<number> {
  const options = parseExportFlags(flags);
  const workspaceRoot = await resolveWorkspaceRoot(entryArg, flags.workspace, cwd);
  const entryPath = path.relative(workspaceRoot, path.resolve(cwd, entryArg));
  if (options.data !== undefined) options.data = path.relative(workspaceRoot, path.resolve(cwd, options.data));
  const contentIndex = new ContentIndex(getContentAssetsRoot());

  const result = await exportArtifact({
    ...options,
    workspaceRoot,
    entryPath,
    lookupAspectHint: async (id) => (await contentIndex.getSkill(id))?.aspectHint,
  });
  if (!result.ok) {
    console.error(formatExportResult(result));
    console.error(`See ${TROUBLESHOOTING_URL}`);
    return 1;
  }
  // stdout: one path per line, for scripts (the folder, for a site bundle); details to stderr.
  if ('output' in result) console.log(path.join(workspaceRoot, result.output));
  else for (const file of result.files) console.log(path.join(workspaceRoot, file.path));
  console.error(formatExportResult(result));
  return 0;
}

/** The exact argv `render-video` runs; exported for tests. */
export function buildRenderVideoArgs(compositionDir: string, output: string, quality: string | undefined): string[] {
  return ['--yes', 'hyperframes', 'render', compositionDir, '--quality', quality ?? 'high', '--output', output];
}

export async function runRenderVideo(compositionDir: string, flags: { output: string; quality?: string }): Promise<number> {
  const args = buildRenderVideoArgs(compositionDir, flags.output, flags.quality);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.error(`$ ${npx} ${args.join(' ')}`);
  await fs.mkdir(path.dirname(path.resolve(flags.output)), { recursive: true });
  return new Promise<number>((resolve) => {
    const child = spawn(npx, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', (err) => {
      console.error(`Failed to start npx: ${err.message}`);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}
