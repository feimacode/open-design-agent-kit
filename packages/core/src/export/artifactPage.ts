// One headless-browser session on a served artifact: a throwaway profile, the
// workspace static server (with the <deck-stage> fallback injected into the
// entry), and a page ready for loadPage(). Shared by exportArtifact() and
// checkArtifact() so both render an artifact the same way.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { openHeadlessBrowser } from './browserDiscovery';
import { injectDeckStageFallback } from './deck/deckStageFallback';
import { startStaticServer, urlForPath } from './staticServer';
import { webglLaunchArgs } from './webgl';

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
export async function openArtifactPage(options: {
  workspaceRoot: string;
  relEntry: string;
  executablePath: string;
  extraArgs?: string[];
}): Promise<ArtifactPageSession> {
  // Software WebGL only for artifacts that need it (a [data-od-webgl] canvas or a three.js import).
  const entry = await fs.readFile(path.join(options.workspaceRoot, options.relEntry), 'utf8').catch(() => '');
  const extraArgs = [...new Set([...webglLaunchArgs(entry), ...(options.extraArgs ?? [])])];
  // The <deck-stage> fallback is injected into the served entry only (never the file on disk).
  const server = await startStaticServer(options.workspaceRoot, { entryPath: options.relEntry, transformEntry: injectDeckStageFallback });
  let target: { browser: Browser; close(): Promise<void> } | undefined;
  const close = async (): Promise<void> => {
    await target?.close();
    await server.close();
  };
  try {
    // extraArgs only apply to local launches; a shared remote browser already
    // runs with its own flags (enable software WebGL there for 3D artifacts).
    // Open pages are tracked and closed by the shared-browser close().
    target = await openHeadlessBrowser({ executablePath: options.executablePath, extraArgs });
    const page = await target.browser.newPage();
    // Under tsx (dev runs, the MCP server's tests) esbuild's keepNames wraps nested functions in
    // `__name(...)`, which doesn't exist in the page that page.evaluate() serializes them into.
    await page.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((fn) => fn)');
    return { browser: target.browser, page, url: urlForPath(server.baseUrl, options.relEntry), close };
  } catch (err) {
    await close();
    throw err;
  }
}
