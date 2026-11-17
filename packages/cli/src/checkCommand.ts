import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  checkArtifact,
  ContentIndex,
  formatCheckResult,
  REVIEW_VIEWS,
  type CheckArtifactOptions,
  type CheckArtifactResult,
  type CheckViewport,
  type ReviewView,
} from '@feimacode/open-design-agent-kit-core';
import { TROUBLESHOOTING_URL } from './docsLinks';
import { getContentAssetsRoot } from './env';
import { ExportArgsError, resolveWorkspaceRoot } from './exportCommand';

export interface CheckCliOptions {
  /** Repeatable `name:WxH`, e.g. tablet:768x1024. */
  viewport?: string[];
  /** Comma-separated 1-based slide numbers. */
  slides?: string;
  maxImages?: string;
  /** Directory to write the screenshots to, relative to the current directory. */
  screenshots?: string;
  browser?: string;
  workspace?: string;
  /** Exit non-zero when a finding at or above this severity exists. */
  failOn?: string;
  /** Comma-separated seconds, e.g. 0,1.5,3. */
  at?: string;
  filmstrip?: boolean;
  /** --reference <id>: a reference video measured by `reference`. */
  reference?: string;
  /** 3D review views: comma-separated names, or "none". */
  views?: string;
  /** false with --no-states: skip the hover/focus, tap-target, reflow and reduced-motion checks. */
  states?: boolean;
  /** Print the result as JSON instead of text (for scripts such as the evals scorer). */
  json?: boolean;
}

export type FailOn = 'error' | 'warning';

/** Maps CLI string flags onto checkArtifact options (range checks happen in core). */
export function parseCheckFlags(flags: CheckCliOptions): { options: Omit<CheckArtifactOptions, 'workspaceRoot' | 'entryPath'>; failOn?: FailOn } {
  let viewports: CheckViewport[] | undefined;
  if (flags.viewport !== undefined && flags.viewport.length > 0) {
    viewports = flags.viewport.map((spec) => {
      const m = /^([^:]+):(\d+)x(\d+)$/i.exec(spec.trim());
      if (!m) throw new ExportArgsError(`--viewport must look like name:WIDTHxHEIGHT, e.g. tablet:768x1024 (got "${spec}").`);
      return { name: m[1], width: Number(m[2]), height: Number(m[3]) };
    });
  }
  let slides: number[] | undefined;
  if (flags.slides !== undefined) {
    slides = flags.slides.split(',').map((part) => {
      const n = Number(part.trim());
      if (!Number.isInteger(n) || n < 1) throw new ExportArgsError(`--slides must be comma-separated slide numbers like 1,3 (got "${flags.slides}").`);
      return n;
    });
  }
  let maxImages: number | undefined;
  if (flags.maxImages !== undefined) {
    maxImages = Number(flags.maxImages);
    if (!Number.isInteger(maxImages)) throw new ExportArgsError(`--max-images must be an integer (got "${flags.maxImages}").`);
  }
  let failOn: FailOn | undefined;
  if (flags.failOn !== undefined) {
    if (flags.failOn !== 'error' && flags.failOn !== 'warning') throw new ExportArgsError(`--fail-on must be error or warning (got "${flags.failOn}").`);
    failOn = flags.failOn;
  }
  let at: number[] | undefined;
  if (flags.at !== undefined) {
    at = flags.at.split(',').map((part) => {
      const n = Number(part.trim());
      if (!Number.isFinite(n) || n < 0) throw new ExportArgsError(`--at must be comma-separated seconds like 0,1.5,3 (got "${flags.at}").`);
      return n;
    });
  }
  let views: ReviewView[] | false | undefined;
  if (flags.views !== undefined) {
    const value = flags.views.trim().toLowerCase();
    if (value === 'none' || value === 'false') views = false;
    else {
      const names = value.split(',').map((part) => part.trim());
      const unknown = names.filter((n) => !(REVIEW_VIEWS as readonly string[]).includes(n));
      if (unknown.length > 0 || names.length === 0) throw new ExportArgsError(`--views must be comma-separated names from ${REVIEW_VIEWS.join(', ')}, or none (got "${flags.views}").`);
      views = names as ReviewView[];
    }
  }
  return { options: { viewports, slides, maxImages, browserPath: flags.browser, at, filmstrip: flags.filmstrip, referenceId: flags.reference, views, states: flags.states === false ? false : undefined }, failOn };
}

/** A screenshot label as a file name: "desktop 2/3" → "desktop-2-3.jpg". */
export function screenshotFileName(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'screenshot'}.jpg`;
}

/** The result as `check --json` prints it: images become their labels, sizes and written files. */
export function checkResultJson(result: Extract<CheckArtifactResult, { ok: true }>, files: readonly string[] = []): Record<string, unknown> {
  const { images, ...rest } = result;
  return { ...rest, images: images.map((image, i) => ({ label: image.label, width: image.width, height: image.height, file: files[i] })) };
}

export async function runCheck(
  entryArg: string,
  flags: CheckCliOptions,
  cwd = process.cwd(),
  check: (options: CheckArtifactOptions) => Promise<CheckArtifactResult> = checkArtifact,
): Promise<number> {
  const { options, failOn } = parseCheckFlags(flags);
  const workspaceRoot = await resolveWorkspaceRoot(entryArg, flags.workspace, cwd);
  const entryPath = path.relative(workspaceRoot, path.resolve(cwd, entryArg));
  const contentIndex = new ContentIndex(getContentAssetsRoot());

  const result = await check({
    ...options,
    // Images are only rendered when they'll be written somewhere.
    maxImages: flags.screenshots === undefined ? 0 : options.maxImages,
    workspaceRoot,
    entryPath,
    lookupAspectHint: async (id) => (await contentIndex.getSkill(id))?.aspectHint,
  });
  if (!result.ok) {
    if (flags.json) console.log(JSON.stringify(result));
    else {
      console.error(formatCheckResult(result));
      console.error(`See ${TROUBLESHOOTING_URL}`);
    }
    return 1;
  }
  if (!flags.json) console.log(formatCheckResult(result));
  const written: string[] = [];
  if (flags.screenshots !== undefined && result.images.length > 0) {
    const dir = path.resolve(cwd, flags.screenshots);
    await fs.mkdir(dir, { recursive: true });
    for (const image of result.images) {
      const file = path.join(dir, screenshotFileName(image.label));
      await fs.writeFile(file, image.data);
      written.push(file);
      if (!flags.json) console.log(file);
    }
  }
  if (flags.json) console.log(JSON.stringify(checkResultJson(result, written)));
  if (failOn === 'error' && result.findings.some((f) => f.severity === 'error')) return 1;
  if (failOn === 'warning' && result.findings.some((f) => f.severity === 'error' || f.severity === 'warning')) return 1;
  return 0;
}
