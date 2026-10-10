// Headless Figma capture (openspec connect-figma): renders a registered
// artifact in the same headless browser export uses and runs the shared
// capture function on it, so every host can push to Figma, not only the VS
// Code preview. Writes the same `<entry>.od-figma.json` sidecar.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { openArtifactPage, type ArtifactPageSession } from '../export/artifactPage';
import { findBrowser } from '../export/browserDiscovery';
import { loadPage } from '../export/exportArtifact';
import { getFormat } from '../poster/formats';
import { readArtifact } from '../vendored/artifactCreate';
import {
  resolveFigmaCaptureAssets,
  writeFigmaCapture,
  type FigmaCaptureAssetReader,
  type FigmaCaptureDocument,
} from '../workspace/figmaCapture';
import { captureFigmaIr } from './captureIr';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * Reads captured image references from the workspace only, never remotely.
 * A relative reference resolves against the entry file's folder (how the
 * preview captures it). With `servedOrigin`, an absolute URL on the headless
 * page's own static server maps back to its workspace path; any other
 * http(s) URL is dropped, as the import plugin drops unreadable fills.
 */
export function createWorkspaceFigmaAssetReader(workspaceRoot: string, entryPath: string, servedOrigin?: string): FigmaCaptureAssetReader {
  const entryDir = path.dirname(entryPath);
  return {
    async read(reference: string) {
      let abs: string;
      if (servedOrigin && reference.startsWith(servedOrigin)) {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(reference).pathname);
        } catch {
          return undefined;
        }
        abs = path.join(workspaceRoot, pathname);
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) {
        return undefined;
      } else {
        abs = path.join(workspaceRoot, entryDir, reference);
      }
      const mimeType = MIME_BY_EXT[path.extname(abs).toLowerCase()];
      if (!mimeType) return undefined;
      const rel = path.relative(workspaceRoot, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
      try {
        const bytes = await fs.readFile(abs);
        return { base64: bytes.toString('base64'), mimeType };
      } catch {
        return undefined;
      }
    },
  };
}

export interface CaptureArtifactForFigmaOptions {
  workspaceRoot: string;
  entryPath: string;
  browserPath?: string;
}

export type CaptureArtifactForFigmaResult =
  | { ok: true; capture: FigmaCaptureDocument; sidecarPath: string; nodeCount: number; truncated: boolean; warnings: string[] }
  | { ok: false; error: string };

/** Viewport for the capture: the artifact's registered canvas format (print sizes at 96 dpi), else a desktop page. */
async function captureViewport(workspaceRoot: string, entryPath: string): Promise<{ width: number; height: number }> {
  const artifact = await readArtifact({ workspaceRoot, entryPath }).catch(() => null);
  const metadata = artifact?.manifest?.metadata as Record<string, unknown> | undefined;
  const format = getFormat(typeof metadata?.format === 'string' ? metadata.format : undefined);
  if (!format) return { width: 1440, height: 900 };
  const toPx = (n: number) => Math.round(format.unit === 'mm' ? (n * 96) / 25.4 : n);
  return { width: toPx(format.width), height: toPx(format.height) };
}

export async function captureArtifactForFigma(options: CaptureArtifactForFigmaOptions): Promise<CaptureArtifactForFigmaResult> {
  const entryPath = options.entryPath.replace(/\\/g, '/');
  try {
    await fs.access(path.join(options.workspaceRoot, entryPath));
  } catch {
    return { ok: false, error: `No artifact entry file found at ${entryPath}.` };
  }
  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return { ok: false, error: browser.message };
  const warnings: string[] = [];
  let session: ArtifactPageSession | undefined;
  try {
    session = await openArtifactPage({ workspaceRoot: options.workspaceRoot, relEntry: entryPath, executablePath: browser.executablePath });
    await session.page.setViewport(await captureViewport(options.workspaceRoot, entryPath));
    await loadPage(session.page, session.url, 15000, 500, warnings);
    // A card design (posters, social posts) is captured at its card's size, like export, rather than the whole page width.
    const card = (await session.page.evaluate(
      `(() => { const el = document.querySelector('[data-od-card]'); if (!el) return null; const r = el.getBoundingClientRect(); return { width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`,
    )) as { width: number; height: number } | null;
    if (card && card.width > 0 && card.height > 0) {
      await session.page.setViewport(card);
      await new Promise((r) => setTimeout(r, 200));
    }
    const title = path.posix.basename(entryPath, path.posix.extname(entryPath));
    const raw = (await session.page.evaluate(`(${captureFigmaIr.toString()})(document, ${JSON.stringify({ title })})`)) as {
      capture: FigmaCaptureDocument;
      nodeCount: number;
      truncated: boolean;
    };
    if (raw.capture.source) raw.capture.source.title = (await session.page.title()) || title;
    const origin = new URL(session.url).origin;
    const capture = await resolveFigmaCaptureAssets(raw.capture, createWorkspaceFigmaAssetReader(options.workspaceRoot, entryPath, origin));
    const abs = await writeFigmaCapture(options.workspaceRoot, entryPath, capture);
    return {
      ok: true,
      capture,
      sidecarPath: path.relative(options.workspaceRoot, abs).split(path.sep).join('/'),
      nodeCount: raw.nodeCount,
      truncated: raw.truncated,
      warnings,
    };
  } catch (err) {
    return { ok: false, error: `Figma capture failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await session?.close();
  }
}
