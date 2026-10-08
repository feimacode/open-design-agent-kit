// Renders a registered HTML artifact in a headless Chromium-family browser
// and writes upload-ready files next to it, under `exports/`: PNG/JPEG images
// (openspec social-post-export), and deck PPTX/PDF or page PDF (openspec
// deck-pptx-pdf-export). Host-agnostic: the VS Code tool, the MCP tool, and the
// CLI all call exportArtifact().
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'puppeteer-core';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import type { JsonRecord } from '../vendored/artifactManifest';
import { openArtifactPage, type ArtifactPageSession } from './artifactPage';
import { checkArtifact } from './checkArtifact';
import { findCollectionArtifacts } from '../workspace/collectionScan';
import { findBrowser } from './browserDiscovery';
import { assemblePdf, assemblePptx } from './deck/assemble';
import { captureDeckSlides, capturePagePdf, countSlides, resolveExportMode, validateSlideNumbers, type ExportMode } from './deck/captureDeck';
import { ELEMENT_LAYOUT_VIEWPORT, isValidDimension, resolveExportSize, type SizeSource } from './exportSize';
import { exportInline, formatInlineExportResult, type InlineExportResult, type PasteTarget } from './inlineExport';
import { formatPackageResult, isPackageFormat, packageArtifact, type PackageExportResult, type PackageFormat } from './packageArtifact';
import { checkDataAgainstFields, loadDataTable, rowFileSuffixes, scanBoundFields, type DataTable } from '../poster/data';
import { bleedBox, DEFAULT_SHEET_FORMAT_IDS, getFormat, isFluidHtml, unknownFormatError, type CanvasFormat } from '../poster/formats';
import { applyShape, bindRow, fitBoundText, type ShapeCss } from '../poster/pageScripts';
import { checkFixedSize, formatPreflight, runPreflight, type Finding } from '../poster/preflight';
import { finishPrintPdf, mergePdfs, preparePrintPage, printBleedPage, RGB_NOTE, type PrintGeometry } from '../poster/printPdf';
import { qrSvg } from '../poster/qr';
import { composeShapeSheet, type ShapeThumbnail } from '../poster/shapeSheet';

export type ImageFormat = 'png' | 'jpeg';
/** Formats rendered in a headless browser. */
export type CaptureFormat = ImageFormat | 'pdf' | 'pptx';
/** Inlined-style HTML for inboxes (`email`) and for pasting into editors (`paste`). */
export type InlineFormat = 'email' | 'paste';
/** Every format: captures, the browserless `standalone`/`site` packaging formats, and the inlined `email`/`paste`. */
export type ExportFormat = CaptureFormat | PackageFormat | InlineFormat;
const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'pdf', 'pptx', 'standalone', 'site', 'email', 'paste'];

function isInlineFormat(format: string | undefined): format is InlineFormat {
  return format === 'email' || format === 'paste';
}

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
  /** Fluid designs: several canvas shapes in one export, one file each. */
  presets?: string[];
  /** Fluid designs: also write exports/<name>-shapes.png showing every shape. */
  shapeSheet?: boolean;
  /** paste: where it will be pasted. */
  target?: PasteTarget;
  /** Fluid designs: also write exports/campaign-sheet.png — every shape plus the first screen of every other piece in the master's collection. */
  campaignSheet?: boolean;
  /** The workspace's Open Design output directory, for finding the collection's other pieces. Default ".open-design". */
  outputDir?: string;
}

/** How one shape is exported: its canvas, output format, print geometry, capture settings, and the fluid resize. */
interface ShapePlan {
  canvas?: CanvasFormat;
  source: 'preset' | 'recorded-format';
  format: CaptureFormat;
  printPath: boolean;
  bleed?: number;
  selector?: string;
  maxBytes?: number;
  shape?: ShapeCss;
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
      /** Print geometry, one per print-format PDF shape. */
      prints?: PrintInfo[];
      /** The shapes exported, for multi-shape exports. */
      shapes?: string[];
      /** Workspace-relative path of the shape sheet, when one was written. */
      shapeSheet?: string;
      /** Workspace-relative path of the campaign sheet, when one was written. */
      campaignSheet?: string;
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
const EXPORTABLE_RENDERERS = new Set(['html', 'deck-html', 'mini-app', 'svg', 'diagram']);
const CARD_SELECTOR = '[data-od-card]';
const MAX_BLEED_MM = 20;
/** Rows × shapes per export. */
const MAX_OUTPUTS = 400;
const MAX_PRESETS = 15;

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
  if (isInlineFormat(o.format)) {
    const other = (['width', 'height', 'scale', 'quality', 'selector', 'maxBytes', 'deck', 'slides', 'badge', 'preset', 'bleed', 'cropMarks', 'checkOnly', 'data', 'presets', 'shapeSheet'] as const).filter((k) => o[k] !== undefined);
    if (other.length > 0) return `${other.join(', ')} ${other.length === 1 ? "doesn't" : "don't"} apply to the "${o.format}" format (it takes target and baseUrl).`;
    return undefined;
  }
  if (o.target !== undefined) return 'target applies to the "paste" format only.';
  if (!isPackageFormat(o.format) && (o.badge !== undefined || o.baseUrl !== undefined)) {
    return 'badge applies to the "standalone" and "site" formats, and baseUrl to "site", "email" and "paste".';
  }
  if (o.preset !== undefined && !getFormat(o.preset)) return unknownFormatError(o.preset);
  if (o.bleed !== undefined && !(typeof o.bleed === 'number' && o.bleed >= 0 && o.bleed <= MAX_BLEED_MM)) return `bleed must be between 0 and ${MAX_BLEED_MM} (mm).`;
  if (isPackageFormat(o.format) && (o.preset !== undefined || o.checkOnly || o.data !== undefined || o.bleed !== undefined || o.cropMarks !== undefined)) {
    return `preset, bleed, cropMarks, checkOnly and data apply to image and PDF exports, not "${o.format}".`;
  }
  if (o.format === 'pptx' && (o.preset !== undefined || o.data !== undefined)) return 'preset and data apply to images and PDFs, not PPTX.';
  if (o.data === undefined && (o.sheet !== undefined || o.nameField !== undefined || o.split !== undefined)) return 'sheet, nameField and split apply only with data.';
  if (o.data !== undefined && o.slides !== undefined) return 'data applies to page exports, not deck slides.';
  if (o.presets !== undefined) {
    if (!Array.isArray(o.presets) || o.presets.length < 1 || o.presets.length > MAX_PRESETS) return `presets must list 1–${MAX_PRESETS} format ids.`;
    for (const id of o.presets) if (!getFormat(id)) return unknownFormatError(id);
    if (new Set(o.presets).size !== o.presets.length) return 'presets lists a format twice.';
    if (o.preset !== undefined || o.width !== undefined || o.height !== undefined) return "presets can't be combined with preset, width or height.";
  }
  if (isPackageFormat(o.format) && (o.presets !== undefined || o.shapeSheet || o.campaignSheet)) return `presets, shapeSheet and campaignSheet apply to image and PDF exports, not "${o.format}".`;
  if (o.format === 'pptx' && (o.presets !== undefined || o.shapeSheet || o.campaignSheet)) return 'presets, shapeSheet and campaignSheet apply to images and PDFs, not PPTX.';
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
export type AnyExportResult = ExportArtifactResult | PackageExportResult | InlineExportResult;

export function exportArtifact(options: ExportArtifactOptions & { format: PackageFormat }): Promise<PackageExportResult>;
export function exportArtifact(options: ExportArtifactOptions & { format?: CaptureFormat }): Promise<ExportArtifactResult>;
export function exportArtifact(options: ExportArtifactOptions): Promise<AnyExportResult>;
export async function exportArtifact(options: ExportArtifactOptions): Promise<AnyExportResult> {
  const invalid = validateOptions(options);
  if (invalid) return fail('invalid-args', invalid);
  if (isInlineFormat(options.format)) {
    return exportInline({
      workspaceRoot: options.workspaceRoot,
      entryPath: options.entryPath,
      format: options.format,
      target: options.target,
      baseUrl: options.baseUrl,
      browserPath: options.browserPath,
      readyTimeoutMs: options.readyTimeoutMs,
      settleMs: options.settleMs,
    });
  }

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
    return fail('unsupported-kind', `Artifacts rendered as "${renderer}" can't be exported to an image — only HTML-based artifacts (html, deck-html, mini-app, svg, diagram).`);
  }

  const manifest = artifact.manifest;
  const sourceSkillId = typeof manifest.sourceSkillId === 'string' ? manifest.sourceSkillId : undefined;
  const kind = typeof manifest.kind === 'string' ? manifest.kind : undefined;
  const title = typeof manifest.title === 'string' ? manifest.title : undefined;

  // Canvas format: an explicit preset, else the format recorded at registration. With `presets`
  // (fluid designs only), each listed format is its own shape, planned the same way.
  const fluid = isFluidHtml(artifact.entryContent);
  const presetFormat = getFormat(options.preset);
  const recordedId = manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as JsonRecord).format : undefined;
  const recordedFormat = typeof recordedId === 'string' ? getFormat(recordedId) : undefined;
  if ((options.presets !== undefined || options.shapeSheet || options.campaignSheet) && !fluid) {
    return fail(
      'invalid-args',
      `presets, shapeSheet and campaignSheet need a fluid design (a [data-od-card] with data-od-fluid), which reflows to any shape. ${options.entryPath} is fixed-size: use adapt_open_design_artifact to make other shapes.`,
    );
  }
  const explicitSize = options.width !== undefined && options.height !== undefined;
  const plan = (canvas: CanvasFormat | undefined, source: 'preset' | 'recorded-format'): ShapePlan => {
    // A print shape (preset or the recorded default) exports its print PDF unless a format is asked for.
    const format: CaptureFormat = (options.format as CaptureFormat | undefined) ?? (canvas?.medium === 'print' && !explicitSize ? 'pdf' : 'png');
    const printPath = canvas?.medium === 'print' && format === 'pdf' && !explicitSize;
    const bleed = canvas?.medium === 'print' && !explicitSize ? (options.bleed ?? canvas.bleed ?? 0) : undefined;
    const imageFormat = format === 'png' || format === 'jpeg';
    // A preset fills in what the agent used to copy from a table; explicit arguments still win. Fluid cards are always captured by their card.
    const preset = source === 'preset' ? canvas : undefined;
    const selector = options.selector ?? ((preset || fluid) && imageFormat ? CARD_SELECTOR : undefined);
    const maxBytes = options.maxBytes ?? (preset && imageFormat ? preset.maxBytes : undefined);
    // A fluid card is resized to the shape: explicit px, else the format (mm for print, with bleed).
    let shape: ShapeCss | undefined;
    if (fluid && explicitSize) shape = { widthCss: `${options.width}px`, heightCss: `${options.height}px`, bleedCss: '0mm' };
    else if (fluid && canvas) {
      const unit = canvas.medium === 'print' ? 'mm' : 'px';
      shape = { widthCss: `${canvas.width}${unit}`, heightCss: `${canvas.height}${unit}`, bleedCss: `${bleed ?? 0}mm` };
    }
    return { canvas, source, format, printPath, bleed, selector, maxBytes, shape };
  };
  const multiShape = options.presets !== undefined;
  const plans: ShapePlan[] = multiShape
    ? options.presets!.map((id) => plan(getFormat(id)!, 'preset'))
    : [plan(presetFormat ?? recordedFormat, presetFormat ? 'preset' : 'recorded-format')];
  const first = plans[0];
  if ((options.bleed !== undefined || options.cropMarks !== undefined) && !plans.some((p) => p.printPath)) {
    return fail('invalid-args', 'bleed and cropMarks apply to PDF exports of print formats (a print preset such as "a3", or an artifact registered with one).');
  }
  const format = first.format;
  const maxBytes = first.maxBytes;

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
    const outputs = table.rows.length * plans.length;
    if (outputs > MAX_OUTPUTS) {
      return fail('invalid-args', `${table.rows.length} rows × ${plans.length} shapes is ${outputs} outputs, over the limit of ${MAX_OUTPUTS} per export. Split the data or the shapes into several exports.`);
    }
  }

  const aspectHint = sourceSkillId && options.lookupAspectHint ? await options.lookupAspectHint(sourceSkillId) : undefined;
  const sizeFor = (p: ShapePlan) =>
    resolveExportSize({
      width: options.width,
      height: options.height,
      aspectHint,
      sourceSkillId,
      selector: p.selector,
      canvas: p.canvas ? { format: p.canvas, source: p.source, bleed: p.bleed } : undefined,
    });
  // Cards captured by selector get a roomier layout viewport, so a preview wrapper (padding, a centring
  // flex body) can't squeeze a fixed-size card below its format size.
  const layoutFor = (p: ShapePlan, s: ReturnType<typeof sizeFor>) =>
    p.selector && p.canvas?.medium === 'screen' && (s.source === 'preset' || s.source === 'recorded-format')
      ? { width: Math.max(Math.ceil(s.viewport.width * 1.25), ELEMENT_LAYOUT_VIEWPORT.width), height: Math.max(s.viewport.height, ELEMENT_LAYOUT_VIEWPORT.height) }
      : s.viewport;
  const size = sizeFor(first);
  const quality = format === 'jpeg' ? (options.quality ?? 90) : undefined;

  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return fail('no-browser', browser.message);

  const warnings: string[] = [...dataWarnings];
  const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath));
  let session: ArtifactPageSession | undefined;
  try {
    session = await openArtifactPage({ workspaceRoot: options.workspaceRoot, relEntry, executablePath: browser.executablePath });
    const { browser: instance, page } = session;
    const layout = layoutFor(first, size);
    // A format can ask for a capture scale (retina email headers); an explicit scale always wins.
    const scaleFor = (p: ShapePlan): number => options.scale ?? p.canvas?.scale ?? 1;
    await page.setViewport({ width: layout.width, height: layout.height, deviceScaleFactor: scaleFor(first) });
    await loadPage(page, session.url, options.readyTimeoutMs ?? 15000, options.settleMs ?? 500, warnings);

    // Non-mutating: page-mode exports must see the original DOM.
    const slideCount = await countSlides(page);
    let mode: ExportMode;
    if (first.printPath) {
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
    if (!pageMode && (table || options.checkOnly || multiShape || options.shapeSheet || options.campaignSheet)) {
      return fail('invalid-args', `data, checkOnly, presets and shapeSheet apply to page exports (images and page PDFs), not decks (${mode}).`);
    }

    const exportedAt = new Date().toISOString();
    const files: ExportedFile[] = [];
    const findings: Finding[] = [];
    const prints: PrintInfo[] = [];
    let shapeSheetPath: string | undefined;
    let campaignSheetPath: string | undefined;
    let scale = scaleFor(first);
    let viewport = size.viewport;
    let sizeSource: SizeSource = size.source;
    let sizeDetail = fluid && first.shape ? `${size.detail}, reflowed (fluid design)` : size.detail;
    if (multiShape) sizeDetail = `presets ${options.presets!.join(', ')}, each reflowed (fluid design)`;

    const writeOut = async (relOut: string, buffer: Buffer): Promise<void> => {
      const absOut = path.join(options.workspaceRoot, relOut);
      await fs.mkdir(path.dirname(absOut), { recursive: true });
      await fs.writeFile(absOut, buffer);
    };
    const budgetWarnings = (relOut: string, requested: ExportFormat, budget: number | undefined, got: { format: ImageFormat; quality?: number; overBudget?: boolean; bytes: number }) => {
      if (got.format !== requested) {
        warnings.push(`${relOut}: the ${requested.toUpperCase()} was over ${budget} bytes, so it was re-encoded as JPEG (quality ${got.quality}).`);
      }
      if (got.overBudget) {
        warnings.push(`${relOut}: ${got.bytes} bytes is still over the ${budget}-byte budget at the lowest quality tried (${got.quality ?? 'lossless'}) — simplify the design (fewer gradients/photos) or reduce scale.`);
      }
    };

    if (pageMode) {
      // Export passes, then (shape sheet only) render-only passes for the sheet's remaining shapes.
      type Pass = { plan: ShapePlan; exported: boolean };
      const passes: Pass[] = plans.map((p) => ({ plan: p, exported: true }));
      const wantSheet = !!options.shapeSheet || !!options.campaignSheet;
      if (wantSheet) {
        const covered = new Set(plans.map((p) => p.canvas?.id));
        for (const id of multiShape ? [] : DEFAULT_SHEET_FORMAT_IDS) if (!covered.has(id)) passes.push({ plan: plan(getFormat(id)!, 'preset'), exported: false });
      }
      const tagShapes = multiShape || wantSheet;
      const thumbnails: ShapeThumbnail[] = [];
      const rows: Array<Record<string, string> | undefined> = table ? table.rows : [undefined];
      const qrFields = scanBoundFields(artifact.entryContent).qrFields;
      const bind = async (row: Record<string, string>): Promise<void> => {
        const qr: Record<string, string> = {};
        for (const field of qrFields) if (row[field]) qr[field] = await qrSvg(row[field]);
        await page.evaluate(bindRow, row, qr);
      };
      let isolated = false;

      for (const [passIndex, pass] of passes.entries()) {
        const p = pass.plan;
        const passScale = scaleFor(p);
        const shapeId = tagShapes ? p.canvas?.id : undefined;
        const cardSelector = p.selector ?? CARD_SELECTOR;
        if (passIndex > 0) {
          const s = sizeFor(p);
          const l = layoutFor(p, s);
          await page.setViewport({ width: l.width, height: l.height, deviceScaleFactor: scaleFor(p) });
        }
        if (p.shape) await page.evaluate(applyShape, cardSelector, p.shape);
        const geometry: PrintGeometry | undefined = p.printPath ? { trimWidth: p.canvas!.width, trimHeight: p.canvas!.height, bleed: p.bleed! } : undefined;
        // Print isolation first: it strips any preview wrapper, so the card is measured and printed as authored.
        if (geometry && !isolated) {
          if (!(await preparePrintPage(page, cardSelector, geometry))) {
            return fail('selector-no-match', `No ${cardSelector} element in ${options.entryPath}; a print piece is one card sized to the bleed box.`);
          }
          isolated = true;
        }
        const passMode: ExportMode = multiShape || !pass.exported ? (p.printPath ? 'print-pdf' : p.format === 'pdf' ? 'page-pdf' : 'image') : mode;
        const passRows = pass.exported ? rows : [table ? table.rows[0] : undefined];
        const pdfs: Buffer[] = [];
        const passFindingsStart = findings.length;

        for (const [i, row] of passRows.entries()) {
          const rowNo = row && pass.exported ? i + 1 : undefined;
          const rowName = row && pass.exported && options.nameField ? row[options.nameField] : undefined;
          if (row) await bind(row);
          findings.push(...fitFindings(await page.evaluate(fitBoundText, cardSelector), { row: rowNo, rowName, shape: shapeId }));
          findings.push(...(await runPreflight(page, { cardSelector, format: p.canvas, bleed: p.bleed, row: rowNo, rowName, fluid, shape: shapeId })));
          if (fluid && p.shape && i === 0) findings.push(...(await checkFixedSize(page, cardSelector, p.shape, { shape: shapeId })));
          if (wantSheet && i === 0) {
            const handle = await page.$(cardSelector);
            if (handle) thumbnails.push({ label: p.canvas?.label ?? 'Default', png: Buffer.from(await handle.screenshot({ type: 'png' })), errors: 0 });
          }
          if (options.checkOnly || !pass.exported) continue;
          const nameParts = [row ? rowSuffixes[i] : undefined, multiShape ? p.canvas!.id : undefined].filter((x): x is string => !!x);
          const suffix = nameParts.length > 0 ? nameParts.join('-') : undefined;

          if (passMode === 'image') {
            type Target = { index?: number; capture: (f: ImageFormat, q?: number) => Promise<Buffer>; width: number; height: number };
            const targets: Target[] = [];
            if (p.selector) {
              let handles;
              try {
                handles = await page.$$(p.selector);
              } catch (err) {
                return fail('invalid-args', `Invalid selector "${p.selector}": ${err instanceof Error ? err.message : String(err)}`);
              }
              if (handles.length === 0) return fail('selector-no-match', `Selector "${p.selector}" matched no elements in ${options.entryPath}.`);
              for (const [j, handle] of handles.entries()) {
                const box = await handle.boundingBox();
                if (!box || box.width < 1 || box.height < 1) {
                  if (i === 0) warnings.push(`Element ${j + 1} matching "${p.selector}" has no visible box — skipped.`);
                  continue;
                }
                targets.push({
                  index: j + 1,
                  width: Math.round(box.width * passScale),
                  height: Math.round(box.height * passScale),
                  capture: async (f, q) => Buffer.from(await handle.screenshot({ type: f, quality: q })),
                });
              }
              if (targets.length === 0) return fail('selector-no-match', `No element matching "${p.selector}" has a visible box.`);
            } else {
              const s = sizeFor(p);
              targets.push({
                width: s.viewport.width * passScale,
                height: s.viewport.height * passScale,
                capture: async (f, q) => Buffer.from(await page.screenshot({ type: f, quality: q })),
              });
            }
            const imageFormat = p.format as ImageFormat;
            const passQuality = imageFormat === 'jpeg' ? (options.quality ?? 90) : undefined;
            for (const target of targets) {
              const result = await captureWithinBudget(target.capture, imageFormat, passQuality, p.maxBytes);
              // Numbered only when there's more than one image; a single card keeps the plain name.
              const index = targets.length > 1 ? target.index : undefined;
              const relOut = suffix === undefined ? exportFilePath(relEntry, index, result.format) : exportFilePathWithSuffix(relEntry, suffix, index, result.format);
              await writeOut(relOut, result.buffer);
              budgetWarnings(relOut, p.format, p.maxBytes, { ...result, bytes: result.buffer.length });
              files.push({ path: relOut, width: target.width, height: target.height, bytes: result.buffer.length, format: result.format, quality: result.quality });
            }
          } else if (passMode === 'print-pdf') {
            pdfs.push(await printBleedPage(page, geometry!));
          } else {
            pdfs.push(await capturePagePdf(page, { width: options.width, height: options.height }));
          }
        }
        if (wantSheet) {
          const last = thumbnails[thumbnails.length - 1];
          if (last) last.errors = findings.slice(passFindingsStart).filter((f) => f.severity === 'error').length;
        }

        if (passMode !== 'image' && pass.exported && !options.checkOnly) {
          const finish = (pdf: Buffer): Promise<Buffer> => (geometry ? finishPrintPdf(pdf, geometry, { cropMarks: options.cropMarks, title }) : Promise.resolve(pdf));
          const shapePart = multiShape ? p.canvas!.id : undefined;
          const outputs: Array<{ relOut: string; pdf: Buffer }> = [];
          if (table && options.split) {
            for (const [i, pdf] of pdfs.entries()) {
              outputs.push({ relOut: exportFilePathWithSuffix(relEntry, [rowSuffixes[i], shapePart].filter(Boolean).join('-'), undefined, 'pdf'), pdf: await finish(pdf) });
            }
          } else {
            const merged = await finish(pdfs.length === 1 ? pdfs[0] : await mergePdfs(pdfs, title));
            outputs.push({ relOut: shapePart ? exportFilePathWithSuffix(relEntry, shapePart, undefined, 'pdf') : exportFilePath(relEntry, undefined, 'pdf'), pdf: merged });
          }
          const s = sizeFor(p);
          for (const { relOut, pdf } of outputs) {
            await writeOut(relOut, pdf);
            files.push({ path: relOut, width: s.viewport.width, height: s.viewport.height, bytes: pdf.length, format: 'pdf' });
            if (p.maxBytes !== undefined && pdf.length > p.maxBytes) warnings.push(`${relOut}: ${pdf.length} bytes is over maxBytes (${p.maxBytes}); PDFs aren't re-encoded.`);
          }
          if (passMode === 'page-pdf' && !multiShape) {
            sizeSource = 'page-print';
            sizeDetail = options.width !== undefined ? `print pages of ${options.width}×${options.height}px (unless the page's CSS @page size overrides)` : "the page's CSS @page size, else A4";
          }
        }
        if (p.printPath && pass.exported && !options.checkOnly) {
          const info = geometryInfo(p.canvas, p.bleed, options.cropMarks);
          if (info) prints.push(info);
        }
      }

      if (options.shapeSheet && thumbnails.length > 0) {
        shapeSheetPath = exportFilePathWithSuffix(relEntry, 'shapes', undefined, 'png');
        await writeOut(shapeSheetPath, await composeShapeSheet(instance, thumbnails, title));
      }
      if (options.campaignSheet && thumbnails.length > 0) {
        // Every shape of the master, then the first screen of each other piece in its collection (landing page,
        // email…), each with its own visual check so its error dot is real.
        const tiles = [...thumbnails];
        const collectionId = typeof manifest.collectionId === 'string' ? manifest.collectionId : undefined;
        const members = collectionId ? await findCollectionArtifacts(options.workspaceRoot, options.outputDir ?? '.open-design', collectionId) : [];
        for (const member of members) {
          if (path.posix.normalize(member.entryPath) === path.posix.normalize(relEntry.split(path.sep).join('/'))) continue;
          const checked = await checkArtifact({ workspaceRoot: options.workspaceRoot, entryPath: member.entryPath, browserPath: options.browserPath, maxImages: 1, viewports: [{ name: 'desktop', width: 1440, height: 900 }], settleMs: options.settleMs, outputDir: options.outputDir });
          if (!checked.ok || checked.images.length === 0) {
            warnings.push(`Campaign sheet: couldn't capture ${member.entryPath}${checked.ok ? '' : ` (${checked.error})`}.`);
            continue;
          }
          const label = member.title || member.screenRole || path.posix.basename(member.entryPath);
          tiles.push({ label, png: checked.images[0].data, mime: checked.images[0].mime, errors: checked.findings.filter((f) => f.severity === 'error').length });
        }
        campaignSheetPath = path.posix.join(path.posix.dirname(relEntry.split(path.sep).join('/')), 'exports', 'campaign-sheet.png');
        await writeOut(campaignSheetPath, await composeShapeSheet(instance, tiles, title, `${title ?? 'Campaign'} — every piece`));
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
          budgetWarnings(relOut, format, maxBytes, got);
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
      prints: prints.length > 0 ? prints : undefined,
      shapes: multiShape ? options.presets : undefined,
      shapeSheet: shapeSheetPath,
      campaignSheet: campaignSheetPath,
    };
  } catch (err) {
    return fail('capture-failed', `Export failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await session?.close();
  }
}

/** data-od-fit results as info findings (text that still overflows is preflight's overflow error). */
export function fitFindings(fitted: Array<{ name: string; percent: number; fits: boolean }>, tag: { row?: number; rowName?: string; shape?: string } = {}): Finding[] {
  return fitted
    .filter((f) => f.fits)
    .map((f) => ({
      check: 'fit',
      severity: 'info' as const,
      message: `${f.name} was set at ${f.percent}% of its size to fit (data-od-fit).`,
      selector: f.name,
      ...(tag.row !== undefined ? { row: tag.row } : {}),
      ...(tag.rowName ? { rowName: tag.rowName } : {}),
      ...(tag.shape ? { shape: tag.shape } : {}),
    }));
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
  if ('inline' in result) return formatInlineExportResult(result);
  const checked = [result.rows !== undefined ? `${result.rows} data row(s)` : 'the page', result.shapes ? `at ${result.shapes.length} shapes` : result.shapeSheet ? 'at every shape' : ''].filter(Boolean).join(' ');
  const lines = result.checkOnly
    ? [`Checked ${checked} (checkOnly: ${result.shapeSheet ? 'only the shape sheet was written' : 'no files written'}).`]
    : [
        `Exported ${result.files.length} file(s)${result.rows !== undefined ? ` from ${result.rows} data row(s)` : ''}:`,
        ...result.files.map(
          (f) => `- ${f.path} — ${f.width}×${f.height}px, ${(f.bytes / 1024).toFixed(0)} KB, ${f.format.toUpperCase()}${f.quality ? ` q${f.quality}` : ''}`,
        ),
      ];
  if (result.slideCount !== undefined) lines.push(`Deck: ${result.slideCount} slide(s) found.`);
  if (result.campaignSheet) lines.push(`Campaign sheet: ${result.campaignSheet} — every shape and every other piece in the collection; a red dot marks pieces with errors.`);
  if (result.shapeSheet) lines.push(`Shape sheet: ${result.shapeSheet} — the design at every shape; a red dot marks shapes with preflight errors.`);
  if (result.prints) {
    for (const p of result.prints) {
      lines.push(
        `Print: ${p.formatId}, trim ${p.trim.width}×${p.trim.height} mm, ${p.bleed} mm bleed (page ${p.bleedBox.width}×${p.bleedBox.height} mm${p.cropMarks ? ' plus a crop-mark slug' : ''}). TrimBox and BleedBox are set.`,
      );
    }
    lines.push(RGB_NOTE);
    if (result.shapes) lines.push(`Size: ${result.sizeDetail}.`);
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
