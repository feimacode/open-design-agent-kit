// Opens the browser preview (openspec add-browser-preview, D1): an app
// window of the installed Chromium-family browser driven headed through
// puppeteer-core (the launcher check and export already use), else the
// system default browser, else nothing (the caller shows the URL). Never
// downloads a browser.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { findBrowser } from '../../export/browserDiscovery';

/** `default` skips the app window and opens the system default browser. */
export const PREVIEW_BROWSER_ENV = 'OPEN_DESIGN_PREVIEW_BROWSER';

const APPEAR_TIMEOUT_MS = 5000;

/** A preview window this process drives: it can be navigated, focused and screenshotted. */
export interface PreviewWindow {
  page: Page;
  navigate(url: string): Promise<void>;
  focus(): Promise<void>;
  close(): Promise<void>;
  /** True until the user closes the window or the browser exits. */
  isOpen(): boolean;
}

export type PreviewOpenResult =
  | { how: 'app-window'; window: PreviewWindow; browserPath: string }
  | { how: 'default-browser'; note: string }
  | { how: 'not-opened'; reason: string };

export interface OpenPreviewOptions {
  /** Explicit browser executable (a flag or setting); falls back to discovery. */
  browserPath?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Injected for tests. */
  launchAppWindow?: (url: string, executablePath: string) => Promise<PreviewWindow>;
  /** Injected for tests: opens `url` in the default browser; resolves true when the opener ran. */
  openDefault?: (url: string) => Promise<boolean>;
  log?: (message: string) => void;
}

/** The dedicated browser profile: never the user's own, kept so the window size sticks. */
export function previewProfileDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'open-design', 'preview-profile');
  if (platform === 'win32') return path.join(env['LOCALAPPDATA'] ?? path.join(home, 'AppData', 'Local'), 'open-design', 'preview-profile');
  return path.join(env['XDG_CACHE_HOME'] || path.join(home, '.cache'), 'open-design', 'preview-profile');
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not appear within ${ms / 1000}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function launchAppWindow(url: string, executablePath: string): Promise<PreviewWindow> {
  const { default: puppeteer } = await import('puppeteer-core');
  const userDataDir = previewProfileDir();
  await fs.mkdir(userDataDir, { recursive: true });
  let browser: Browser | undefined;
  try {
    browser = await withTimeout(
      puppeteer.launch({
        executablePath,
        headless: false,
        defaultViewport: null,
        userDataDir,
        // No "controlled by automated software" bar, and no extra about:blank tab next to the app window.
        ignoreDefaultArgs: ['--enable-automation', 'about:blank'],
        args: [`--app=${url}`, '--window-size=1280,900', '--no-first-run', '--no-default-browser-check'],
      }),
      APPEAR_TIMEOUT_MS,
      'The preview window',
    );
    const b = browser;
    const page = await withTimeout(
      (async () => {
        for (;;) {
          const found = (await b.pages()).find((p) => p.url().startsWith(url.split('?')[0]));
          if (found) return found;
          await new Promise((r) => setTimeout(r, 100));
        }
      })(),
      APPEAR_TIMEOUT_MS,
      'The preview page',
    );
    let open = true;
    b.on('disconnected', () => {
      open = false;
    });
    page.on('close', () => {
      open = false;
      void b.close().catch(() => undefined);
    });
    return {
      page,
      navigate: async (next) => {
        await page.goto(next, { waitUntil: 'domcontentloaded' });
      },
      focus: async () => {
        await page.bringToFront();
      },
      close: async () => {
        open = false;
        await b.close().catch(() => undefined);
      },
      isOpen: () => open && b.connected,
    };
  } catch (err) {
    await browser?.close().catch(() => undefined);
    throw err;
  }
}

function isWsl(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): boolean {
  return platform === 'linux' && Boolean(env['WSL_DISTRO_NAME'] || env['WSL_INTEROP']);
}

function runOpener(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
      let settled = false;
      const done = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      child.once('error', () => done(false));
      child.once('exit', (code) => done(code === 0));
      // Openers that keep running (some xdg-open handlers) have still opened the page.
      setTimeout(() => done(true), 3000).unref();
      child.unref();
    } catch {
      resolve(false);
    }
  });
}

/** The commands that open a URL in the default browser on this platform, tried in order. */
export function defaultOpeners(url: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Array<[string, string[]]> {
  if (platform === 'darwin') return [['open', [url]]];
  if (platform === 'win32') return [['cmd', ['/c', 'start', '', url]]];
  // WSL: the Windows browser reaches the loopback URL (WSL2 forwards localhost).
  if (isWsl(env, platform)) return [['wslview', [url]], ['cmd.exe', ['/c', 'start', '', url]]];
  // Without a display, xdg-open falls back to a text browser; don't.
  if (!env['DISPLAY'] && !env['WAYLAND_DISPLAY']) return [];
  return [['xdg-open', [url]]];
}

async function openDefaultBrowser(url: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Promise<boolean> {
  for (const [command, args] of defaultOpeners(url, env, platform)) {
    if (await runOpener(command, args)) return true;
  }
  return false;
}

export async function openPreviewWindow(url: string, options: OpenPreviewOptions = {}): Promise<PreviewOpenResult> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const log = options.log ?? (() => undefined);
  let appWindowProblem: string | undefined;

  if (env[PREVIEW_BROWSER_ENV]?.trim().toLowerCase() !== 'default') {
    const found = await findBrowser({ explicitPath: options.browserPath, env, platform });
    if (found.ok && !found.browserURL) {
      try {
        const window = await (options.launchAppWindow ?? launchAppWindow)(url, found.executablePath);
        return { how: 'app-window', window, browserPath: found.executablePath };
      } catch (err) {
        appWindowProblem = `The browser at ${found.executablePath} couldn't open a window (${err instanceof Error ? err.message : String(err)}).`;
        log(appWindowProblem);
      }
    } else if (found.ok) {
      // A shared remote browser has no windows to open; screenshots still work through check/export.
      appWindowProblem = 'A shared remote browser is configured, so the preview opens in the default browser instead of an app window.';
    } else {
      appWindowProblem = 'No Chrome, Edge or Chromium was found, so comments are saved without screenshots unless one is installed.';
    }
  }

  if (await (options.openDefault ?? ((u) => openDefaultBrowser(u, env, platform)))(url)) {
    return { how: 'default-browser', note: appWindowProblem ?? 'Opened in the default browser as requested.' };
  }
  return { how: 'not-opened', reason: `${appWindowProblem ? `${appWindowProblem} ` : ''}No browser could be opened from here (no display, or a remote session). Open the URL yourself.` };
}
