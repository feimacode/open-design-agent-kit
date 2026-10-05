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
import { ELEMENT_LAYOUT_VIEWPORT, isValidDimension, resolveExportSize, type SizeSource } from './exportSize';
import { formatPackageResult, isPackageFormat, packageArtifact, type PackageExportResult, type PackageFormat } from './packageArtifact';
import { startStaticServer, urlForPath } from './staticServer';
import { checkDataAgainstFields, loadDataTable, rowFileSuffixes, scanBoundFields, type DataTable } from '../poster/data';
import { bleedBox, getFormat, unknownFormatError, type CanvasFormat } from '../poster/formats';
import { bindRow } from '../poster/pageScripts';
import { formatPreflight, runPreflight, type Finding } from '../poster/preflight';
import { finishPrintPdf, mergePdfs, preparePrintPage, printBleedPage, RGB_NOTE, type PrintGeometry } from '../poster/printPdf';
import { qrSvg } from '../poster/qr';

export type ImageFormat = 'png' | 'jpeg';
/** Formats rendered in a headless browser. */
export type CaptureFormat = ImageFormat | 'pdf' | 'pptx';
/** Every format: captures, plus the browserless `standalone`/`site` packaging formats. */
export type ExportFormat = CaptureFormat | PackageFormat;
const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'pdf', 'pptx', 'standalone', 'site'];

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
  /** standalone/site: add the "Made with Open Design" footer badge (default: on for site, off for standalone). */
  badge?: boolean;
  /** standalone/site: the host's badge setting; false turns the badge off unless `badge` or the env var says otherwise. */
  badgeSetting?: boolean;
  /** site: the https URL the bundle will be served from, so og:image can be absolute. */
  baseUrl?: string;
  /** A canvas format id (see ../poster/formats.ts): fills in size, selector, byte budget, or the print path. */
  preset?: string;
  /** Print PDFs: bleed in mm on every side (default: the format's). */
  bleed?: number;
  /** Print PDFs: add crop marks in a slug around the page. */
  cropMarks?: boolean;
  /** Run the load and preflight only; write no files and leave the manifest alone. */
  checkOnly?: boolean;
  /** Workspace-relative CSV, XLSX or JSON-array file: one output per row, filling [data-od-field] elements. */
  data?: string;
  /** XLSX data: the sheet to read (default: the first). */
  sheet?: string;
  /** Data column whose (slugified) value names each row's file. */
  nameField?: string;
  /** PDF data exports: one file per row instead of one multi-page PDF. */
  split?: boolean;
}

export interface PrintInfo {
  formatId: string;
  trim: { width: number; height: number };
  bleed: number;
  bleedBox: { width: number; height: number };
  cropMarks: boolean;
}

export interface ExportedFile {
  /** Workspace-relative, forward slashes. */
  path: string;
  width: number;
  height: number;
  bytes: number;
  format: CaptureFormat;
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
      /** Preflight findings (page exports only). */
      findings?: Finding[];
      /** True when only checked, with no files written. */
      checkOnly?: boolean;
      /** Data rows exported (bulk exports only). */
      rows?: number;
      /** Print geometry (print-format PDFs only). */
      print?: PrintInfo;
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
const CARD_SELECTOR = '[data-od-card]';
const MAX_BLEED_MM = 20;

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
  if (isPackageFormat(o.format) && (o.selector !== undefined || o.slides !== undefined || o.maxBytes !== undefined)) {
    return `selector, slides and maxBytes apply to image, PDF and PPTX exports, not "${o.format}".`;
  }
  if (!isPackageFormat(o.format) && (o.badge !== undefined || o.baseUrl !== undefined)) {
    return 'badge and baseUrl apply to the "standalone" and "site" formats only.';
  }
  if (o.preset !== undefined && !getFormat(o.preset)) return unknownFormatError(o.preset);
  if (o.bleed !== undefined && !(typeof o.bleed === 'number' && o.bleed >= 0 && o.bleed <= MAX_BLEED_MM)) return `bleed must be between 0 and ${MAX_BLEED_MM} (mm).`;
  if (isPackageFormat(o.format) && (o.preset !== undefined || o.checkOnly || o.data !== undefined || o.bleed !== undefined || o.cropMarks !== undefined)) {
    return `preset, bleed, cropMarks, checkOnly and data apply to image and PDF exports, not "${o.format}".`;
  }
  if (o.format === 'pptx' && (o.preset !== undefined || o.data !== undefined)) return 'preset and data apply to images and PDFs, not PPTX.';
  if (o.data === undefined && (o.sheet !== undefined || o.nameField !== undefined || o.split !== undefined)) return 'sheet, nameField and split apply only with data.';
  if (o.data !== undefined && o.slides !== undefined) return 'data applies to page exports, not deck slides.';
  return undefined;
}

/** `<artifact-dir>/exports/<entry-basename>[-NN].<ext>`, workspace-relative with forward slashes. */
const EXTENSIONS: Record<CaptureFormat, string> = { png: 'png', jpeg: 'jpg', pdf: 'pdf', pptx: 'pptx' };

export function exportFilePath(entryPath: string, index: number | undefined, format: CaptureFormat): string {
  const posixEntry = entryPath.replace(/\\/g, '/');
  const dir = path.posix.dirname(posixEntry);
  const base = path.posix.basename(posixEntry, path.posix.extname(posixEntry));
  const suffix = index === undefined ? '' : `-${String(index).padStart(2, '0')}`;
  return path.posix.join(dir, 'exports', `${base}${suffix}.${EXTENSIONS[format]}`);
}

/** `<artifact-dir>/exports/<entry-basename>-<suffix>[-NN].<ext>`, for data-bound exports. */
export function exportFilePathWithSuffix(entryPath: string, suffix: string, index: number | undefined, format: CaptureFormat): string {
  const posixEntry = entryPath.replace(/\\/g, '/');
  const dir = path.posix.dirname(posixEntry);
  const base = path.posix.basename(posixEntry, path.posix.extname(posixEntry));
  const n = index === undefined ? '' : `-${String(index).padStart(2, '0')}`;
  return path.posix.join(dir, 'exports', `${base}-${suffix}${n}.${EXTENSIONS[format]}`);
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

export async function loadPage(page: Page, url: string, readyTimeoutMs: number, settleMs: number, warnings: string[]): Promise<void> {
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

/** A capture result, or a packaging result for the `standalone`/`site` formats. */
export type AnyExportResult = ExportArtifactResult | PackageExportResult;

export function exportArtifact(options: ExportArtifactOptions & { format: PackageFormat }): Promise<PackageExportResult>;
export function exportArtifact(options: ExportArtifactOptions & { format?: CaptureFormat }): Promise<ExportArtifactResult>;
export function exportArtifact(options: ExportArtifactOptions): Promise<AnyExportResult>;
export async function exportArtifact(options: ExportArtifactOptions): Promise<AnyExportResult> {
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
  if (isPackageFormat(options.format)) {
    // Browserless: never looks for Chrome, so it works on CI and bare machines.
    const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath)).split(path.sep).join('/');
    return packageArtifact({
      workspaceRoot: options.workspaceRoot,
      entryPath: relEntry,
      entryContent: artifact.entryContent,
      manifest: artifact.manifest,
      format: options.format,
      badge: options.badge,
      badgeSetting: options.badgeSetting,
      baseUrl: options.baseUrl,
    });
  }
  const renderer = typeof artifact.manifest.renderer === 'string' ? artifact.manifest.renderer : 'html';
  if (!EXPORTABLE_RENDERERS.has(renderer)) {
    return fail('unsupported-kind', `Artifacts rendered as "${renderer}" can't be exported to an image — only HTML-based artifacts (html, deck-html, mini-app, svg).`);
  }

  const manifest = artifact.manifest;
  const sourceSkillId = typeof manifest.sourceSkillId === 'string' ? manifest.sourceSkillId : undefined;
  const kind = typeof manifest.kind === 'string' ? manifest.kind : undefined;
  const title = typeof manifest.title === 'string' ? manifest.title : undefined;

  // Canvas format: an explicit preset, else the format recorded at registration.
  const presetFormat = getFormat(options.preset);
  const recordedId = manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as JsonRecord).format : undefined;
  const recordedFormat = typeof recordedId === 'string' ? getFormat(recordedId) : undefined;
  const canvasFormat = presetFormat ?? recordedFormat;
  const format: CaptureFormat = options.format ?? (presetFormat?.medium === 'print' ? 'pdf' : 'png');
  const printPath = canvasFormat?.medium === 'print' && format === 'pdf';
  if ((options.bleed !== undefined || options.cropMarks !== undefined) && !printPath) {
    return fail('invalid-args', 'bleed and cropMarks apply to PDF exports of print formats (a print preset such as "a3", or an artifact registered with one).');
  }
  const bleed = printPath ? (options.bleed ?? canvasFormat!.bleed ?? 0) : undefined;
  const imageFormat = format === 'png' || format === 'jpeg';
  // A preset fills in what the agent used to copy from a table; explicit arguments still win.
  const selector = options.selector ?? (presetFormat && imageFormat ? CARD_SELECTOR : undefined);
  const maxBytes = options.maxBytes ?? (presetFormat && imageFormat ? presetFormat.maxBytes : undefined);

  // Data-bound export: everything about the data is checked before a browser starts.
  let table: DataTable | undefined;
  let rowSuffixes: string[] = [];
  const dataWarnings: string[] = [];
  if (options.data !== undefined) {
    try {
      table = await loadDataTable(options.workspaceRoot, options.data, options.sheet);
    } catch (err) {
      return fail('invalid-args', err instanceof Error ? err.message : String(err));
    }
    const check = checkDataAgainstFields(table, scanBoundFields(artifact.entryContent), options.data, options.nameField);
    if (!check.ok) return fail('invalid-args', check.error);
    dataWarnings.push(...check.warnings);
    rowSuffixes = rowFileSuffixes(table, options.nameField);
  }

  const aspectHint = sourceSkillId && options.lookupAspectHint ? await options.lookupAspectHint(sourceSkillId) : undefined;
  const size = resolveExportSize({
    width: options.width,
    height: options.height,
    aspectHint,
    sourceSkillId,
    selector,
    canvas: canvasFormat ? { format: canvasFormat, source: presetFormat ? 'preset' : 'recorded-format', bleed } : undefined,
  });
  const quality = format === 'jpeg' ? (options.quality ?? 90) : undefined;

  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return fail('no-browser', browser.message);

  const warnings: string[] = [...dataWarnings];
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
    // Under tsx (dev runs, the MCP server's tests) esbuild's keepNames wraps nested functions in
    // `__name(...)`, which doesn't exist in the page that page.evaluate() serializes them into.
    await page.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((fn) => fn)');
    // Cards captured by selector get a roomier layout viewport, so a preview wrapper (padding, a centring
    // flex body) can't squeeze a fixed-size card below its format size.
    const layout =
      selector && canvasFormat?.medium === 'screen' && (size.source === 'preset' || size.source === 'recorded-format')
        ? { width: Math.max(Math.ceil(size.viewport.width * 1.25), ELEMENT_LAYOUT_VIEWPORT.width), height: Math.max(size.viewport.height, ELEMENT_LAYOUT_VIEWPORT.height) }
        : size.viewport;
    await page.setViewport({ width: layout.width, height: layout.height, deviceScaleFactor: options.scale ?? 1 });
    await loadPage(page, urlForPath(server.baseUrl, relEntry), options.readyTimeoutMs ?? 15000, options.settleMs ?? 500, warnings);

    // Non-mutating: page-mode exports must see the original DOM.
    const slideCount = await countSlides(page);
    let mode: ExportMode;
    if (printPath) {
      mode = 'print-pdf';
    } else {
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
      mode = resolution.mode;
    }
    const slideError = validateSlideNumbers(options.slides, slideCount);
    if (slideError && mode !== 'image' && mode !== 'page-pdf' && mode !== 'print-pdf') return fail('invalid-args', slideError);
    const pageMode = mode === 'image' || mode === 'page-pdf' || mode === 'print-pdf';
    if (!pageMode && (table || options.checkOnly)) {
      return fail('invalid-args', `data and checkOnly apply to page exports (images and page PDFs), not decks (${mode}).`);
    }

    const exportedAt = new Date().toISOString();
    const files: ExportedFile[] = [];
    const findings: Finding[] = [];
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
        warnings.push(`${relOut}: the ${requested.toUpperCase()} was over ${maxBytes} bytes, so it was re-encoded as JPEG (quality ${got.quality}).`);
      }
      if (got.overBudget) {
        warnings.push(`${relOut}: ${got.bytes} bytes is still over the ${maxBytes}-byte budget at the lowest quality tried (${got.quality ?? 'lossless'}) — simplify the design (fewer gradients/photos) or reduce scale.`);
      }
    };

    if (pageMode) {
      const geometry: PrintGeometry | undefined = printPath ? { trimWidth: canvasFormat!.width, trimHeight: canvasFormat!.height, bleed: bleed! } : undefined;
      const cardSelector = selector ?? CARD_SELECTOR;
      const rows: Array<Record<string, string> | undefined> = table ? table.rows : [undefined];
      const pdfs: Buffer[] = [];
      // Print isolation first: it strips any preview wrapper, so the card is measured and printed as authored.
      if (geometry && !(await preparePrintPage(page, cardSelector, geometry))) {
        return fail('selector-no-match', `No ${cardSelector} element in ${options.entryPath}; a print piece is one card sized to the bleed box.`);
      }
      for (const [i, row] of rows.entries()) {
        const rowNo = row ? i + 1 : undefined;
        const rowName = row && options.nameField ? row[options.nameField] : undefined;
        if (row) {
          const qr: Record<string, string> = {};
          for (const field of scanBoundFields(artifact.entryContent).qrFields) if (row[field]) qr[field] = await qrSvg(row[field]);
          await page.evaluate(bindRow, row, qr);
        }
        findings.push(...(await runPreflight(page, { cardSelector, format: canvasFormat, bleed, row: rowNo, rowName })));
        if (options.checkOnly) continue;
        const suffix = row ? rowSuffixes[i] : undefined;

        if (mode === 'image') {
          type Target = { index?: number; capture: (f: ImageFormat, q?: number) => Promise<Buffer>; width: number; height: number };
          const targets: Target[] = [];
          if (selector) {
            let handles;
            try {
              handles = await page.$$(selector);
            } catch (err) {
              return fail('invalid-args', `Invalid selector "${selector}": ${err instanceof Error ? err.message : String(err)}`);
            }
            if (handles.length === 0) return fail('selector-no-match', `Selector "${selector}" matched no elements in ${options.entryPath}.`);
            for (const [j, handle] of handles.entries()) {
              const box = await handle.boundingBox();
              if (!box || box.width < 1 || box.height < 1) {
                if (i === 0) warnings.push(`Element ${j + 1} matching "${selector}" has no visible box — skipped.`);
                continue;
              }
              targets.push({
                index: j + 1,
                width: Math.round(box.width * scale),
                height: Math.round(box.height * scale),
                capture: async (f, q) => Buffer.from(await handle.screenshot({ type: f, quality: q })),
              });
            }
            if (targets.length === 0) return fail('selector-no-match', `No element matching "${selector}" has a visible box.`);
          } else {
            targets.push({
              width: size.viewport.width * scale,
              height: size.viewport.height * scale,
              capture: async (f, q) => Buffer.from(await page.screenshot({ type: f, quality: q })),
            });
          }
          for (const target of targets) {
            const result = await captureWithinBudget(target.capture, format as ImageFormat, quality, maxBytes);
            // Numbered only when there's more than one image; a single card keeps the plain name.
            const index = targets.length > 1 ? target.index : undefined;
            const relOut = suffix === undefined ? exportFilePath(relEntry, index, result.format) : exportFilePathWithSuffix(relEntry, suffix, index, result.format);
            await writeOut(relOut, result.buffer);
            budgetWarnings(relOut, format, { ...result, bytes: result.buffer.length });
            files.push({ path: relOut, width: target.width, height: target.height, bytes: result.buffer.length, format: result.format, quality: result.quality });
          }
        } else if (mode === 'print-pdf') {
          pdfs.push(await printBleedPage(page, geometry!));
        } else {
          pdfs.push(await capturePagePdf(page, { width: options.width, height: options.height }));
        }
      }

      if (mode !== 'image' && !options.checkOnly) {
        const finish = (pdf: Buffer): Promise<Buffer> => (geometry ? finishPrintPdf(pdf, geometry, { cropMarks: options.cropMarks, title }) : Promise.resolve(pdf));
        const outputs: Array<{ relOut: string; pdf: Buffer }> = [];
        if (table && options.split) {
          for (const [i, pdf] of pdfs.entries()) outputs.push({ relOut: exportFilePathWithSuffix(relEntry, rowSuffixes[i], undefined, 'pdf'), pdf: await finish(pdf) });
        } else {
          outputs.push({ relOut: exportFilePath(relEntry, undefined, 'pdf'), pdf: await finish(pdfs.length === 1 ? pdfs[0] : await mergePdfs(pdfs, title)) });
        }
        for (const { relOut, pdf } of outputs) {
          await writeOut(relOut, pdf);
          files.push({ path: relOut, width: viewport.width, height: viewport.height, bytes: pdf.length, format: 'pdf' });
          if (maxBytes !== undefined && pdf.length > maxBytes) warnings.push(`${relOut}: ${pdf.length} bytes is over maxBytes (${maxBytes}); PDFs aren't re-encoded.`);
        }
        if (mode === 'page-pdf') {
          sizeSource = 'page-print';
          sizeDetail = options.width !== undefined ? `print pages of ${options.width}×${options.height}px (unless the page's CSS @page size overrides)` : "the page's CSS @page size, else A4";
        }
      }
      // Failed loads are reported as findings too, so the agent sees them with everything else to fix.
      for (const w of warnings) if (w.startsWith('Failed to load: ')) findings.push({ check: 'broken-asset', severity: 'warning', message: w.slice('Failed to load: '.length) });
    } else {
      // Deck modes: capture one image per slide at the measured (or explicit) stage.
      const document = mode === 'deck-pptx' || mode === 'deck-pdf';
      scale = options.scale ?? (document ? 2 : 1);
      const slideImageFormat: ImageFormat = document ? 'png' : (format as ImageFormat);
      const captured = await captureDeckSlides(page, {
        slideCount,
        slides: options.slides,
        width: options.width,
        height: options.height,
        scale,
        format: slideImageFormat,
        quality,
        encode: document ? undefined : (shoot) => captureWithinBudget(shoot, slideImageFormat, quality, maxBytes),
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
        if (maxBytes !== undefined && assembled.length > maxBytes) {
          warnings.push(`${relOut}: ${assembled.length} bytes is over maxBytes (${maxBytes}); ${docFormat.toUpperCase()} isn't re-encoded — try scale: 1.`);
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

    if (!options.checkOnly) {
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
    }

    return {
      ok: true,
      mode,
      files,
      slideCount: pageMode ? undefined : slideCount,
      viewport,
      scale,
      sizeSource,
      sizeDetail,
      warnings,
      browserPath: browser.executablePath,
      findings: pageMode ? findings : undefined,
      checkOnly: options.checkOnly || undefined,
      rows: table ? table.rows.length : undefined,
      print: geometryInfo(printPath ? canvasFormat : undefined, bleed, options.cropMarks),
    };
  } catch (err) {
    return fail('capture-failed', `Export failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await instance?.close().catch(() => undefined);
    await server.close();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function geometryInfo(format: CanvasFormat | undefined, bleed: number | undefined, cropMarks: boolean | undefined): PrintInfo | undefined {
  if (!format || bleed === undefined) return undefined;
  const box = bleedBox(format, bleed);
  return { formatId: format.id, trim: { width: format.width, height: format.height }, bleed, bleedBox: { width: box.width, height: box.height }, cropMarks: !!cropMarks };
}

/** Compact, model-friendly text rendering of a result, shared by every host. */
export function formatExportResult(result: AnyExportResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  if ('output' in result) return formatPackageResult(result);
  const lines = result.checkOnly
    ? [`Checked ${result.rows !== undefined ? `${result.rows} data row(s)` : 'the page'} (checkOnly: no files written).`]
    : [
        `Exported ${result.files.length} file(s)${result.rows !== undefined ? ` from ${result.rows} data row(s)` : ''}:`,
        ...result.files.map(
          (f) => `- ${f.path} — ${f.width}×${f.height}px, ${(f.bytes / 1024).toFixed(0)} KB, ${f.format.toUpperCase()}${f.quality ? ` q${f.quality}` : ''}`,
        ),
      ];
  if (result.slideCount !== undefined) lines.push(`Deck: ${result.slideCount} slide(s) found.`);
  if (result.print) {
    const p = result.print;
    lines.push(
      `Print: ${p.formatId}, trim ${p.trim.width}×${p.trim.height} mm, ${p.bleed} mm bleed (page ${p.bleedBox.width}×${p.bleedBox.height} mm${p.cropMarks ? ' plus a crop-mark slug' : ''}). TrimBox and BleedBox are set.`,
      RGB_NOTE,
    );
  } else {
    lines.push(
      result.mode === 'page-pdf'
        ? `Pages: ${result.sizeDetail}.`
        : `Size: ${result.viewport.width}×${result.viewport.height} ${result.slideCount !== undefined ? 'slide stage' : 'viewport'} at ${result.scale}x — from ${result.sizeDetail}.`,
    );
  }
  if (result.findings) lines.push(...formatPreflight(result.findings));
  // Failed loads already appear above as broken-asset findings.
  const warnings = result.findings ? result.warnings.filter((w) => !w.startsWith('Failed to load: ')) : result.warnings;
  if (warnings.length > 0) lines.push('Warnings:', ...warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
