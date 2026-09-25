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

export const BROWSER_PATH_ENV = 'OPEN_DESIGN_BROWSER_PATH';

export type BrowserDiscoveryResult = { ok: true; executablePath: string } | { ok: false; searched: string[]; message: string };

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
      `or (headless/CI machines) run \`npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer\` once. Searched:\n` +
      candidates.map((c) => `  - ${c}`).join('\n'),
  };
}
