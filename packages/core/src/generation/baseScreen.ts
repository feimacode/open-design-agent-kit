// A redesign's base screen (openspec add-design-from-app): the screen as it is
// now, from an image in the workspace or a captured URL (often the app's own
// dev server), stored under <outputDir>/.bases/ beside the design it starts,
// named after the design's entry file so the check can find it. Never
// published: .bases/ is outside every design's folder.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../export/browserDiscovery';

export const BASES_DIR = '.bases';
const IMAGE = /\.(?:png|jpe?g|webp)$/i;
const MAX_BASE_BYTES = 15 * 1024 * 1024;

/** Where the base of the design at `entryPath` is kept (without extension). */
export function baseScreenStem(outputDir: string, entryPath: string): string {
  const name = entryPath.replace(/\.html?$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_');
  return path.posix.join(outputDir, BASES_DIR, name);
}

/** The base image for a design, if one was stored. */
export async function findBaseScreen(workspaceRoot: string, outputDir: string, entryPath: string): Promise<string | undefined> {
  const stem = baseScreenStem(outputDir, entryPath);
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    try {
      await fs.access(path.join(workspaceRoot, stem + ext));
      return stem + ext;
    } catch {
      // next
    }
  }
  return undefined;
}

export type BaseScreenResult = { ok: true; path: string; from: string } | { ok: false; error: string };

export async function prepareBaseScreen(input: { workspaceRoot: string; outputDir: string; entryPath: string; baseScreen: string; browserPath?: string }): Promise<BaseScreenResult> {
  const stem = baseScreenStem(input.outputDir, input.entryPath);
  const base = input.baseScreen.trim();
  await fs.mkdir(path.dirname(path.join(input.workspaceRoot, stem)), { recursive: true });
  if (/^https?:\/\//i.test(base)) {
    const browser = await findBrowser({ explicitPath: input.browserPath });
    if (!browser.ok) return { ok: false, error: `baseScreen is a URL, and capturing it needs a browser: ${browser.message} Pass a screenshot of the screen instead.` };
    const out = `${stem}.png`;
    const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-base-'));
    const { default: puppeteer } = await import('puppeteer-core');
    const instance = await puppeteer.launch({
      executablePath: browser.executablePath,
      headless: true,
      userDataDir: profileDir,
      args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
    });
    try {
      const page = await instance.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle2', timeout: 30_000 });
      await page.screenshot({ path: path.join(input.workspaceRoot, out), type: 'png' });
      return { ok: true, path: out, from: base };
    } catch (err) {
      return { ok: false, error: `Couldn't capture ${base}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}. Is the app running? Pass a screenshot instead.` };
    } finally {
      await instance.close().catch(() => undefined);
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  const abs = path.resolve(input.workspaceRoot, base);
  const within = path.relative(path.resolve(input.workspaceRoot), abs);
  if (within.startsWith('..') || path.isAbsolute(within)) return { ok: false, error: `baseScreen ${base} is outside the workspace.` };
  if (!IMAGE.test(abs)) return { ok: false, error: 'baseScreen must be a PNG, JPEG or WebP image in the workspace, or an http(s) URL.' };
  try {
    const stat = await fs.stat(abs);
    if (stat.size > MAX_BASE_BYTES) return { ok: false, error: `baseScreen ${base} is over 15 MB.` };
  } catch {
    return { ok: false, error: `baseScreen ${base} doesn't exist.` };
  }
  const out = stem + path.extname(abs).toLowerCase();
  await fs.copyFile(abs, path.join(input.workspaceRoot, out));
  return { ok: true, path: out, from: base };
}

export function composeBaseScreenSection(base: { path: string; from: string }): string {
  return `## Base screen: change this, don't start over

This is a redesign. The screen as it is now is \`${base.path}\` (from ${base.from}); open it and look at it before you start. It is the screen to change, not a style reference: keep its content, its purpose and everything the brief doesn't ask to change, in the same place, and change what the brief asks for. The check puts it beside the new design so the user can compare.`;
}
