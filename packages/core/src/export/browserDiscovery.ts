// Finds an already-installed Chromium-family browser for headless export.
// Never downloads one (see openspec/changes/social-post-export/design.md D1):
// an explicit path wins, then per-OS system installs, then the Playwright /
// Puppeteer browser caches that are common on dev and CI machines.
//
// Snap-packaged Chromium (Ubuntu's /snap/bin/chromium, and the
// /usr/bin/chromium-browser wrapper that launches it) is tried last: its
// confinement blocks hidden directories under $HOME (like `.open-design/`)
// and a private /tmp, so it's the least likely to work.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';

export const BROWSER_PATH_ENV = 'OPEN_DESIGN_BROWSER_PATH';
// Remote browser over Chrome DevTools Protocol (e.g. http://browser:9222 served by
// a sidecar). When set, discovery short-circuits: no local executable is needed
// and openHeadlessBrowser connects instead of launching (disconnecting, not closing).
export const BROWSER_URL_ENV = 'OPEN_DESIGN_BROWSER_URL';

export type BrowserDiscoveryResult =
  | { ok: true; executablePath: string; browserURL?: string }
  | { ok: false; searched: string[]; message: string };

export interface BrowserDiscoveryOptions {
  /** Explicit path (e.g. a VS Code setting or a CLI flag); takes precedence over everything. */
  explicitPath?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  /** Injected for tests. */
  isExecutable?: (p: string) => Promise<boolean>;
  /** Injected for tests: lists a directory's entry names, or [] when it doesn't exist. */
  listDir?: (dir: string) => Promise<string[]>;
}

async function defaultIsExecutable(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
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

function systemCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  if (platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Chromium.app/Contents/MacOS/Chromium',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ];
    return [...apps.map((a) => path.join('/Applications', a)), ...apps.map((a) => path.join(home, 'Applications', a))];
  }
  if (platform === 'win32') {
    const roots = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].filter((r): r is string => !!r);
    const rels = ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe', 'Chromium\\Application\\chrome.exe'];
    return roots.flatMap((root) => rels.map((rel) => path.win32.join(root, rel)));
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ];
}

function snapCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'linux' ? ['/snap/bin/chromium', '/usr/bin/chromium-browser'] : [];
}

// Relative executable paths inside one cache version directory, per platform.
function cacheExecutables(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return [
      'chrome-headless-shell-mac-arm64/chrome-headless-shell',
      'chrome-headless-shell-mac-x64/chrome-headless-shell',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ];
  }
  if (platform === 'win32') {
    return ['chrome-headless-shell-win64\\chrome-headless-shell.exe', 'chrome-win\\chrome.exe', 'chrome-win64\\chrome.exe'];
  }
  return ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome', 'chrome-linux64/chrome'];
}

async function cacheCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
  listDir: (dir: string) => Promise<string[]>,
): Promise<string[]> {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const playwrightRoot =
    env['PLAYWRIGHT_BROWSERS_PATH'] ||
    (platform === 'darwin'
      ? join(home, 'Library', 'Caches', 'ms-playwright')
      : platform === 'win32'
        ? join(env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local'), 'ms-playwright')
        : join(home, '.cache', 'ms-playwright'));
  const puppeteerRoot = env['PUPPETEER_CACHE_DIR'] || join(home, '.cache', 'puppeteer');

  // Newest version first (the directory names embed a monotonically increasing revision).
  const byNewest = (names: string[]) => [...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const rels = cacheExecutables(platform);
  const result: string[] = [];

  const playwrightDirs = byNewest((await listDir(playwrightRoot)).filter((n) => n.startsWith('chromium')));
  for (const dir of playwrightDirs) for (const rel of rels) result.push(join(playwrightRoot, dir, rel));

  for (const product of ['chrome-headless-shell', 'chrome']) {
    const productRoot = join(puppeteerRoot, product);
    for (const dir of byNewest(await listDir(productRoot))) for (const rel of rels) result.push(join(productRoot, dir, rel));
  }
  return result;
}

export async function findBrowser(options: BrowserDiscoveryOptions = {}): Promise<BrowserDiscoveryResult> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homedir ?? os.homedir();
  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const listDir = options.listDir ?? defaultListDir;

  const explicit = options.explicitPath?.trim() || env[BROWSER_PATH_ENV]?.trim();
  // A remote browser wins over any local install: it is the deliberate choice
  // for browserless environments (containers, CI), and auto-detect must not
  // shadow it with a stray system install.
  const browserURL = env[BROWSER_URL_ENV]?.trim();
  if (browserURL) return { ok: true, executablePath: '', browserURL };
  if (explicit) {
    if (await isExecutable(explicit)) return { ok: true, executablePath: explicit };
    return {
      ok: false,
      searched: [explicit],
      message: `The configured browser path "${explicit}" (from ${options.explicitPath?.trim() ? 'the explicit browser path setting' : BROWSER_PATH_ENV}) does not exist or is not a file. Point it at a Chrome, Edge, or Chromium executable.`,
    };
  }

  const candidates = [
    ...systemCandidates(platform, env, home),
    ...(await cacheCandidates(platform, env, home, listDir)),
    ...snapCandidates(platform),
  ];
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return { ok: true, executablePath: candidate };
  }

  return {
    ok: false,
    searched: candidates,
    message:
      `No Chrome, Edge, or Chromium browser was found for image export. Install Google Chrome, set ${BROWSER_PATH_ENV} to an existing Chromium-family executable, ` +
      `or point ${BROWSER_URL_ENV} at a running browser's DevTools HTTP endpoint (e.g. http://browser:9222), ` +
      `or (headless/CI machines) run \`npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer\` once. Searched:\n` +
      candidates.map((c) => `  - ${c}`).join('\n'),
  };
}

export interface HeadlessBrowser {
  browser: Browser;
  /** True for a shared remote browser: close() detaches instead of closing it. */
  shared: boolean;
  close(): Promise<void>;
}

const DEFAULT_LAUNCH_ARGS = ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb'];

/**
 * Opens a headless browser for export/check flows. When OPEN_DESIGN_BROWSER_URL
 * is set (a remote browser's DevTools HTTP endpoint, e.g. http://browser:9222),
 * connects to it instead of launching; close() then only detaches, never
 * closing the shared browser. Otherwise launches options.executablePath.
 * extraArgs only apply to local launches: a shared remote browser already runs
 * with its own flags (enable software WebGL there for 3D artifacts).
 * As root the sandbox cannot apply, so --no-sandbox is added to local launches
 * (same rule as generation/baseScreen.ts); without it every launch just crashes.
 */
export async function openHeadlessBrowser(options: { executablePath?: string; extraArgs?: string[] } = {}): Promise<HeadlessBrowser> {
  const { default: puppeteer } = await import('puppeteer-core');
  const browserURL = process.env[BROWSER_URL_ENV]?.trim();
  if (browserURL) {
    if (!/^https?:\/\//.test(browserURL)) {
      throw new Error(`${BROWSER_URL_ENV} must be the browser's DevTools HTTP endpoint (e.g. http://browser:9222), got ${JSON.stringify(browserURL)}.`);
    }
    const browser = await puppeteer.connect({ browserURL, protocolTimeout: 60_000 });
    return {
      browser,
      shared: true,
      close: async () => {
        await browser.disconnect().catch(() => undefined);
      },
    };
  }
  const executablePath = options.executablePath?.trim();
  if (!executablePath) {
    throw new Error(
      `No local browser executable was provided and ${BROWSER_URL_ENV} is not set. Install Chrome, set ${BROWSER_PATH_ENV}, or point ${BROWSER_URL_ENV} at a running browser.`,
    );
  }
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-browser-profile-'));
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir: profileDir,
    // A hung page (endless script, stalled frame) fails the export in a minute instead of blocking it.
    protocolTimeout: 60_000,
    args: [...DEFAULT_LAUNCH_ARGS, ...(options.extraArgs ?? []), ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
  });
  return {
    browser,
    shared: false,
    close: async () => {
      await browser.close().catch(() => undefined);
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
