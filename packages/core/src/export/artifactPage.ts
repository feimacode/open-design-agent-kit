// One headless-browser session on a served artifact: a throwaway profile, the
// workspace static server (with the <deck-stage> fallback injected into the
// entry), and a page ready for loadPage(). Shared by exportArtifact() and
// checkArtifact() so both render an artifact the same way.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { injectDeckStageFallback } from './deck/deckStageFallback';
import { startStaticServer, urlForPath } from './staticServer';

export interface ArtifactPageSession {
  browser: Browser;
  page: Page;
  /** The served entry's URL, for loadPage(). */
  url: string;
  close(): Promise<void>;
}

/**
 * Starts the server and launches the browser. Always pair with close(), which
 * is safe to call after a failed launch: a launch error closes what was
 * started before rethrowing.
 */
export async function openArtifactPage(options: { workspaceRoot: string; relEntry: string; executablePath: string; extraArgs?: string[] }): Promise<ArtifactPageSession> {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-export-profile-'));
  // The <deck-stage> fallback is injected into the served entry only (never the file on disk).
  const server = await startStaticServer(options.workspaceRoot, { entryPath: options.relEntry, transformEntry: injectDeckStageFallback });
  let browser: Browser | undefined;
  const close = async (): Promise<void> => {
    await browser?.close().catch(() => undefined);
    await server.close();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  };
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({
      executablePath: options.executablePath,
      headless: true,
      userDataDir: profileDir,
      // A hung page (endless script, stalled frame) fails the export in a minute instead of blocking it.
      protocolTimeout: 60_000,
      args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', ...(options.extraArgs ?? [])],
    });
    const page = await browser.newPage();
    // Under tsx (dev runs, the MCP server's tests) esbuild's keepNames wraps nested functions in
    // `__name(...)`, which doesn't exist in the page that page.evaluate() serializes them into.
    await page.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((fn) => fn)');
    return { browser, page, url: urlForPath(server.baseUrl, options.relEntry), close };
  } catch (err) {
    await close();
    throw err;
  }
}
