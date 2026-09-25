// Renders a registered HTML artifact in a headless Chromium-family browser
// and writes upload-ready files next to it, under `exports/`: PNG/JPEG images
// (openspec social-post-export), and deck PPTX/PDF or page PDF (openspec
// deck-pptx-pdf-export). Host-agnostic: the VS Code tool, the MCP tool, and the
// CLI all call exportArtifact().
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import type { JsonRecord } from '../vendored/artifactManifest';
import { findBrowser } from './browserDiscovery';
import { assemblePdf, assemblePptx } from './deck/assemble';
import { captureDeckSlides, capturePagePdf, countSlides, resolveExportMode, validateSlideNumbers, type ExportMode } from './deck/captureDeck';
import { injectDeckStageFallback } from './deck/deckStageFallback';
import { isValidDimension, resolveExportSize, type SizeSource } from './exportSize';
import { startStaticServer, urlForPath } from './staticServer';

export type ImageFormat = 'png' | 'jpeg';
export type ExportFormat = ImageFormat | 'pdf' | 'pptx';
const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'pdf', 'pptx'];

export interface ExportArtifactOptions {
  workspaceRoot: string;
  /** Workspace-relative path to the artifact's entry file. */
  entryPath: string;
  format?: ExportFormat;
  /** JPEG quality 1–100 (ignored for PNG). Default 90. */
  quality?: number;
  width?: number;
  height?: number;
  /** Device scale factor 1–3. Default 2 for deck PPTX/PDF, else 1. */
  scale?: number;
  /** Force deck (true) or page (false) handling; default inferred (see resolveExportMode). */
  deck?: boolean;
  /** 1-based slide numbers to export (decks only). */
  slides?: number[];
  /** Export each matching element as its own numbered image. */
  selector?: string;
  /** Re-encode as progressively lower-quality JPEG until each file fits. */
  maxBytes?: number;
  /** Explicit browser executable (setting/flag); falls back to discovery. */
  browserPath?: string;
  /** Resolves a manifest's sourceSkillId to that skill's aspect_hint. */
  lookupAspectHint?: (sourceSkillId: string) => Promise<string | undefined>;
  /** Upper bound for page load + font readiness, ms. Default 15000. */
  readyTimeoutMs?: number;
  /** Extra settle time after load for entrance animations, ms. Default 500. */
  settleMs?: number;
}

export interface ExportedFile {
  /** Workspace-relative, forward slashes. */
  path: string;
  width: number;
  height: number;
  bytes: number;
  format: ExportFormat;
  quality?: number;
}

export type ExportArtifactResult =
  | {
      ok: true;
      mode: ExportMode;
      files: ExportedFile[];
      /** Slides in the deck (deck modes only). */
      slideCount?: number;
      viewport: { width: number; height: number };
      scale: number;
      sizeSource: SizeSource;
      sizeDetail: string;
      warnings: string[];
      browserPath: string;
    }
  | { ok: false; code: ExportErrorCode; error: string };

export type ExportErrorCode =
  | 'invalid-args'
  | 'not-found'
  | 'not-registered'
  | 'unsupported-kind'
  | 'unsupported-format'
  | 'no-browser'
  | 'selector-no-match'
  | 'no-slides'
  | 'not-a-deck'
  | 'capture-failed';

const FIT_QUALITIES = [90, 80, 70, 60, 50, 40];
const EXPORTABLE_RENDERERS = new Set(['html', 'deck-html', 'mini-app', 'svg']);

function fail(code: ExportErrorCode, error: string): ExportArtifactResult {
  return { ok: false, code, error };
}

function validateOptions(o: ExportArtifactOptions): string | undefined {
  if ((o.width === undefined) !== (o.height === undefined)) return 'width and height must be given together.';
  if (o.width !== undefined && (!isValidDimension(o.width) || !isValidDimension(o.height!))) {
    return 'width and height must be integers between 16 and 8192.';
  }
  if (o.scale !== undefined && !(o.scale >= 1 && o.scale <= 3)) return 'scale must be between 1 and 3.';
  if (o.quality !== undefined && !(Number.isInteger(o.quality) && o.quality >= 1 && o.quality <= 100)) {
    return 'quality must be an integer between 1 and 100.';
  }
  if (o.format !== undefined && !EXPORT_FORMATS.includes(o.format)) return `format must be one of ${EXPORT_FORMATS.join(', ')}.`;
  if (o.slides !== undefined && (!Array.isArray(o.slides) || o.slides.length === 0 || !o.slides.every((n) => Number.isInteger(n) && n >= 1))) {
    return 'slides must be a non-empty list of 1-based slide numbers.';
  }
  if (o.selector !== undefined && (o.format === 'pdf' || o.format === 'pptx' || o.slides !== undefined)) {
    return 'selector applies to image exports of pages; it can\'t be combined with pdf/pptx or slides.';
  }
  if (o.maxBytes !== undefined && !(Number.isInteger(o.maxBytes) && o.maxBytes > 0)) return 'maxBytes must be a positive integer.';
  if (o.selector !== undefined && o.selector.trim() === '') return 'selector must not be empty.';
  return undefined;
}

/** `<artifact-dir>/exports/<entry-basename>[-NN].<ext>`, workspace-relative with forward slashes. */
const EXTENSIONS: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg', pdf: 'pdf', pptx: 'pptx' };

export function exportFilePath(entryPath: string, index: number | undefined, format: ExportFormat): string {
  const posixEntry = entryPath.replace(/\\/g, '/');
  const dir = path.posix.dirname(posixEntry);
  const base = path.posix.basename(posixEntry, path.posix.extname(posixEntry));
  const suffix = index === undefined ? '' : `-${String(index).padStart(2, '0')}`;
  return path.posix.join(dir, 'exports', `${base}${suffix}.${EXTENSIONS[format]}`);
}

/**
 * Captures once in the requested format; if over maxBytes, re-captures as
 * JPEG at descending quality and keeps the first that fits (or the smallest).
 */
export async function captureWithinBudget(
  capture: (format: ImageFormat, quality?: number) => Promise<Buffer>,
  format: ImageFormat,
  quality: number | undefined,
  maxBytes: number | undefined,
): Promise<{ buffer: Buffer; format: ImageFormat; quality?: number; overBudget: boolean }> {
  const first = await capture(format, format === 'jpeg' ? quality : undefined);
  const firstResult = { buffer: first, format, quality: format === 'jpeg' ? quality : undefined };
  if (maxBytes === undefined || first.length <= maxBytes) return { ...firstResult, overBudget: false };

  let smallest: { buffer: Buffer; format: ImageFormat; quality?: number } = firstResult;
  for (const q of FIT_QUALITIES) {
    if (format === 'jpeg' && quality !== undefined && q >= quality) continue;
    const buffer = await capture('jpeg', q);
    if (buffer.length < smallest.buffer.length) smallest = { buffer, format: 'jpeg', quality: q };
    if (buffer.length <= maxBytes) return { buffer, format: 'jpeg', quality: q, overBudget: false };
  }
  return { ...smallest, overBudget: true };
}

/** Replaces records for the same paths, keeps the rest. */
export function mergeExportRecords(metadata: unknown, records: JsonRecord[]): JsonRecord {
  const base: JsonRecord = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as JsonRecord) } : {};
  const existing = Array.isArray(base.exports) ? (base.exports as JsonRecord[]) : [];
  const newPaths = new Set(records.map((r) => r.path));
  base.exports = [...existing.filter((r) => !newPaths.has(r?.path)), ...records];
  return base;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadPage(page: Page, url: string, readyTimeoutMs: number, settleMs: number, warnings: string[]): Promise<void> {
  const failed: string[] = [];
  page.on('requestfailed', (req) => failed.push(`${req.url()} (${req.failure()?.errorText ?? 'failed'})`));
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${res.url()} (HTTP ${res.status()})`);
  });
  page.on('pageerror', (err) => warnings.push(`Page script error: ${err instanceof Error ? err.message : String(err)}`));

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: readyTimeoutMs });
  } catch (err) {
    warnings.push(`Page did not reach network idle within ${readyTimeoutMs}ms — captured anyway (${err instanceof Error ? err.message : String(err)}).`);
  }
  // String form: this package compiles without DOM lib types.
  const fonts = await withTimeout(page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true'), 5000);
  if (fonts === 'timeout') warnings.push('Web fonts were still loading after 5s — text may use fallback fonts.');
  if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));

  // The browser's own automatic /favicon.ico probe isn't something the artifact asked for.
  for (const f of failed) if (!/\/favicon\.ico \(/.test(f)) warnings.push(`Failed to load: ${f}`);
}

export async function exportArtifact(options: ExportArtifactOptions): Promise<ExportArtifactResult> {
  const invalid = validateOptions(options);
  if (invalid) return fail('invalid-args', invalid);

  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath: options.entryPath });
  } catch (err) {
    return fail('invalid-args', err instanceof Error ? err.message : String(err));
  }
  if (!artifact) return fail('not-found', `No artifact entry file found at ${options.entryPath}.`);
  if (!artifact.manifest) {
    return fail('not-registered', `${options.entryPath} exists but isn't registered (no .artifact.json sidecar). Call register_open_design_artifact first.`);
  }
  const renderer = typeof artifact.manifest.renderer === 'string' ? artifact.manifest.renderer : 'html';
  if (!EXPORTABLE_RENDERERS.has(renderer)) {
    return fail('unsupported-kind', `Artifacts rendered as "${renderer}" can't be exported to an image — only HTML-based artifacts (html, deck-html, mini-app, svg).`);
  }

  const manifest = artifact.manifest;
  const sourceSkillId = typeof manifest.sourceSkillId === 'string' ? manifest.sourceSkillId : undefined;
  const kind = typeof manifest.kind === 'string' ? manifest.kind : undefined;
  const title = typeof manifest.title === 'string' ? manifest.title : undefined;
  const aspectHint = sourceSkillId && options.lookupAspectHint ? await options.lookupAspectHint(sourceSkillId) : undefined;
  const size = resolveExportSize({ width: options.width, height: options.height, aspectHint, sourceSkillId, selector: options.selector });
  const format = options.format ?? 'png';
  const quality = format === 'jpeg' ? (options.quality ?? 90) : undefined;

  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return fail('no-browser', browser.message);

  const warnings: string[] = [];
  const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath));
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-export-profile-'));
  // The <deck-stage> fallback is injected into the served entry only (never the file on disk).
  const server = await startStaticServer(options.workspaceRoot, { entryPath: relEntry, transformEntry: injectDeckStageFallback });
  let instance: Browser | undefined;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    instance = await puppeteer.launch({
      executablePath: browser.executablePath,
      headless: true,
      userDataDir: profileDir,
      // A hung page (endless script, stalled frame) fails the export in a minute instead of blocking it.
      protocolTimeout: 60_000,
      args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb'],
    });
    const page = await instance.newPage();
    await page.setViewport({ width: size.viewport.width, height: size.viewport.height, deviceScaleFactor: options.scale ?? 1 });
    await loadPage(page, urlForPath(server.baseUrl, relEntry), options.readyTimeoutMs ?? 15000, options.settleMs ?? 500, warnings);

    // Non-mutating: page-mode exports must see the original DOM.
    const slideCount = await countSlides(page);
    const resolution = resolveExportMode({
      format,
      deck: options.deck,
      slides: options.slides,
      kind,
      renderer: typeof manifest.renderer === 'string' ? manifest.renderer : undefined,
      sourceSkillId,
      slideCount,
    });
    if (!resolution.ok) return fail(resolution.code, resolution.error);
    const mode = resolution.mode;
    const slideError = validateSlideNumbers(options.slides, slideCount);
    if (slideError && mode !== 'image' && mode !== 'page-pdf') return fail('invalid-args', slideError);

    const exportedAt = new Date().toISOString();
    const files: ExportedFile[] = [];
    let scale = options.scale ?? 1;
    let viewport = size.viewport;
    let sizeSource: SizeSource = size.source;
    let sizeDetail = size.detail;

    const writeOut = async (relOut: string, buffer: Buffer): Promise<void> => {
      const absOut = path.join(options.workspaceRoot, relOut);
      await fs.mkdir(path.dirname(absOut), { recursive: true });
      await fs.writeFile(absOut, buffer);
    };
    const budgetWarnings = (relOut: string, requested: ExportFormat, got: { format: ImageFormat; quality?: number; overBudget?: boolean; bytes: number }) => {
      if (got.format !== requested) {
        warnings.push(`${relOut}: the ${requested.toUpperCase()} was over ${options.maxBytes} bytes, so it was re-encoded as JPEG (quality ${got.quality}).`);
      }
      if (got.overBudget) {
        warnings.push(`${relOut}: ${got.bytes} bytes is still over the ${options.maxBytes}-byte budget at the lowest quality tried (${got.quality ?? 'lossless'}) — simplify the design (fewer gradients/photos) or reduce scale.`);
      }
    };

    if (mode === 'image') {
      type Target = { index?: number; capture: (f: ImageFormat, q?: number) => Promise<Buffer>; width: number; height: number };
      const targets: Target[] = [];
      if (options.selector) {
        let handles;
        try {
          handles = await page.$$(options.selector);
        } catch (err) {
          return fail('invalid-args', `Invalid selector "${options.selector}": ${err instanceof Error ? err.message : String(err)}`);
        }
        if (handles.length === 0) return fail('selector-no-match', `Selector "${options.selector}" matched no elements in ${options.entryPath}.`);
        for (const [i, handle] of handles.entries()) {
          const box = await handle.boundingBox();
          if (!box || box.width < 1 || box.height < 1) {
            warnings.push(`Element ${i + 1} matching "${options.selector}" has no visible box — skipped.`);
            continue;
          }
          targets.push({
            index: i + 1,
            width: Math.round(box.width * scale),
            height: Math.round(box.height * scale),
            capture: async (f, q) => Buffer.from(await handle.screenshot({ type: f, quality: q })),
          });
        }
        if (targets.length === 0) return fail('selector-no-match', `No element matching "${options.selector}" has a visible box.`);
      } else {
        targets.push({
          width: size.viewport.width * scale,
          height: size.viewport.height * scale,
          capture: async (f, q) => Buffer.from(await page.screenshot({ type: f, quality: q })),
        });
      }
      const imageFormat = format as ImageFormat;
      for (const target of targets) {
        const result = await captureWithinBudget(target.capture, imageFormat, quality, options.maxBytes);
        // Numbered only when there's more than one image; a single card keeps the plain name.
        const relOut = exportFilePath(relEntry, targets.length > 1 ? target.index : undefined, result.format);
        await writeOut(relOut, result.buffer);
        budgetWarnings(relOut, format, { ...result, bytes: result.buffer.length });
        files.push({ path: relOut, width: target.width, height: target.height, bytes: result.buffer.length, format: result.format, quality: result.quality });
      }
    } else if (mode === 'page-pdf') {
      const pdf = await capturePagePdf(page, { width: options.width, height: options.height });
      const relOut = exportFilePath(relEntry, undefined, 'pdf');
      await writeOut(relOut, pdf);
      sizeSource = 'page-print';
      sizeDetail = options.width !== undefined ? `print pages of ${options.width}×${options.height}px (unless the page's CSS @page size overrides)` : "the page's CSS @page size, else A4";
      files.push({ path: relOut, width: viewport.width, height: viewport.height, bytes: pdf.length, format: 'pdf' });
      if (options.maxBytes !== undefined && pdf.length > options.maxBytes) warnings.push(`${relOut}: ${pdf.length} bytes is over maxBytes (${options.maxBytes}); PDFs aren't re-encoded.`);
    } else {
      // Deck modes: capture one image per slide at the measured (or explicit) stage.
      const document = mode === 'deck-pptx' || mode === 'deck-pdf';
      scale = options.scale ?? (document ? 2 : 1);
      const imageFormat: ImageFormat = document ? 'png' : (format as ImageFormat);
      const captured = await captureDeckSlides(page, {
        slideCount,
        slides: options.slides,
        width: options.width,
        height: options.height,
        scale,
        format: imageFormat,
        quality,
        encode: document ? undefined : (shoot) => captureWithinBudget(shoot, imageFormat, quality, options.maxBytes),
      });
      warnings.push(...captured.warnings);
      viewport = { width: captured.stage.w, height: captured.stage.h };
      sizeSource = options.width !== undefined ? 'explicit' : 'deck-stage';
      sizeDetail = options.width !== undefined ? `explicit ${options.width}×${options.height}` : `the deck's measured slide size ${captured.stage.w}×${captured.stage.h}`;
      const pxW = Math.round(captured.stage.w * scale);
      const pxH = Math.round(captured.stage.h * scale);

      if (document) {
        const assembled =
          mode === 'deck-pptx'
            ? await assemblePptx(captured.slides, { title, aspect: captured.stage.w / captured.stage.h })
            : await assemblePdf(captured.slides, { title });
        const docFormat: ExportFormat = mode === 'deck-pptx' ? 'pptx' : 'pdf';
        const relOut = exportFilePath(relEntry, undefined, docFormat);
        await writeOut(relOut, assembled);
        files.push({ path: relOut, width: pxW, height: pxH, bytes: assembled.length, format: docFormat });
        if (options.maxBytes !== undefined && assembled.length > options.maxBytes) {
          warnings.push(`${relOut}: ${assembled.length} bytes is over maxBytes (${options.maxBytes}); ${docFormat.toUpperCase()} isn't re-encoded — try scale: 1.`);
        }
        if (assembled.length > 50 * 1024 * 1024) warnings.push(`${relOut} is over 50 MB — scale: 1 roughly quarters it.`);
      } else {
        for (const slide of captured.slides) {
          const got = { format: (slide.jpeg ? 'jpeg' : 'png') as ImageFormat, quality: slide.quality, overBudget: slide.overBudget, bytes: slide.buffer.length };
          // Always numbered by the slide's own number, even for a single slide.
          const relOut = exportFilePath(relEntry, slide.number, got.format);
          await writeOut(relOut, slide.buffer);
          budgetWarnings(relOut, format, got);
          files.push({ path: relOut, width: pxW, height: pxH, bytes: got.bytes, format: got.format, quality: got.quality });
        }
      }
    }

    try {
      await writeArtifactManifest({
        workspaceRoot: options.workspaceRoot,
        entryPath: options.entryPath,
        artifactManifest: {
          ...manifest,
          metadata: mergeExportRecords(
            manifest.metadata,
            files.map((f) => ({ path: f.path, width: f.width, height: f.height, scale, format: f.format, exportedAt })),
          ),
        },
      });
    } catch (err) {
      warnings.push(`Exported, but couldn't record the export in the manifest: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      ok: true,
      mode,
      files,
      slideCount: mode === 'image' || mode === 'page-pdf' ? undefined : slideCount,
      viewport,
      scale,
      sizeSource,
      sizeDetail,
      warnings,
      browserPath: browser.executablePath,
    };
  } catch (err) {
    return fail('capture-failed', `Export failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await instance?.close().catch(() => undefined);
    await server.close();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Compact, model-friendly text rendering of a result, shared by every host. */
export function formatExportResult(result: ExportArtifactResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  const lines = [
    `Exported ${result.files.length} file(s):`,
    ...result.files.map(
      (f) => `- ${f.path} — ${f.width}×${f.height}px, ${(f.bytes / 1024).toFixed(0)} KB, ${f.format.toUpperCase()}${f.quality ? ` q${f.quality}` : ''}`,
    ),
  ];
  if (result.slideCount !== undefined) lines.push(`Deck: ${result.slideCount} slide(s) found.`);
  lines.push(
    result.mode === 'page-pdf'
      ? `Pages: ${result.sizeDetail}.`
      : `Size: ${result.viewport.width}×${result.viewport.height} ${result.slideCount !== undefined ? 'slide stage' : 'viewport'} at ${result.scale}x — from ${result.sizeDetail}.`,
  );
  if (result.warnings.length > 0) lines.push('Warnings:', ...result.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
