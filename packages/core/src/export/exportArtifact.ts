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
import { campaignSheetPaths, tileErrors, writeCampaignSheetSidecar, type CampaignSheetTile } from './campaignSheet';
import { checkArtifact } from './checkArtifact';
import { findCollectionArtifacts } from '../workspace/collectionScan';
import { findBrowser } from './browserDiscovery';
import { assemblePdf, assemblePptx } from './deck/assemble';
import { assembleEditablePptx, editableReport, formatEditableReport, type EditableReport } from './deck/assembleEditable';
import { captureDeckSlides, captureEditableDeck, capturePagePdf, countSlides, resolveExportMode, validateSlideNumbers, type ExportMode } from './deck/captureDeck';
import { ELEMENT_LAYOUT_VIEWPORT, isValidDimension, resolveExportSize, type SizeSource } from './exportSize';
import { exportInline, formatInlineExportResult, type InlineExportResult, type PasteTarget } from './inlineExport';
import type { MotionFormat } from './motion/ffmpeg';
import { exportMotion, formatMotionExportResult, isMotionFormat, type MotionExportResult } from './motion/motionExport';
import { ASSET_RESOLUTIONS, type AssetResolution, type BinaryFetch } from './embedAssets';
import { formatPackageResult, isPackageFormat, packageArtifact, type PackageExportResult, type PackageFormat } from './packageArtifact';
import { checkDataAgainstFields, loadDataTable, rowFileSuffixes, scanBoundFields, type DataTable } from '../poster/data';
import { bleedBox, DEFAULT_SHEET_FORMAT_IDS, getFormat, isFluidHtml, unknownFormatError, type CanvasFormat } from '../poster/formats';
import { applyShape, bindRow, fitBoundText, showCardForPrint, type ShapeCss } from '../poster/pageScripts';
import { bleedBoxPx, captureDpiFor, type PrintHouse, type PrintHouseFormat } from '../poster/printHouses';
import { cropPngCentre, pngToJpeg, setJpegDpi, setPngDpi } from './printImage';
import { checkFixedSize, formatPreflight, runPreflight, type Finding } from '../poster/preflight';
import { finishPrintPdf, mergePdfs, preparePrintPage, printBleedPage, RGB_NOTE, type PrintGeometry } from '../poster/printPdf';
import { qrSvg } from '../poster/qr';
import { composeShapeSheet, type ShapeThumbnail } from '../poster/shapeSheet';
import { isFullyOpaquePng, usesWebgl, waitForScene, webglFindings } from './webgl';
import { wrapInDeviceShell } from './deviceShellImage';
import { hasIncludes, resolveIncludes } from './flowIncludes';
import { DEVICE_CONTENT_SIZES, parseDevice } from '../preview/deviceShell';

export type ImageFormat = 'png' | 'jpeg';
/** Formats rendered in a headless browser. */
export type CaptureFormat = ImageFormat | 'pdf' | 'pptx';
/** Inlined-style HTML for inboxes (`email`) and for pasting into editors (`paste`). */
export type InlineFormat = 'email' | 'paste';
/** Every format: captures, the browserless `standalone`/`site` packaging formats, and the inlined `email`/`paste`. */
export type ExportFormat = CaptureFormat | PackageFormat | InlineFormat | MotionFormat;
const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'pdf', 'pptx', 'standalone', 'site', 'email', 'paste', 'mp4', 'webm', 'gif'];

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
  /** Decks with format "pptx": native text boxes, shapes and pictures instead of one picture per slide (openspec add-editable-pptx-export). */
  editable?: boolean;
  /** Export each matching element as its own numbered image. */
  selector?: string;
  /** PNG with no page background (omitBackground), for cut-outs such as a 3D product shot. Image exports of pages only. */
  transparent?: boolean;
  /** Device screens (data-od-device): draw the kit's device frame around PNG and JPEG exports. Default true; false exports the bare screen. */
  shell?: boolean;
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
  /** standalone: download the page's declared remote assets (3D scene spec or asset block) and embed them. */
  embedAssets?: boolean;
  /** standalone with embedAssets: the highest Poly Haven resolution to fetch (1k, 2k or 4k; default 1k). */
  maxResolution?: AssetResolution;
  /** Tests: the downloader embedAssets uses. */
  assetFetch?: BinaryFetch;
  /** A canvas format id (see ../poster/formats.ts): fills in size, selector, byte budget, or the print path. */
  preset?: string;
  /** Print PDFs: bleed in mm on every side (default: the format's). */
  bleed?: number;
  /** Print PDFs: add crop marks in a slug around the page. */
  cropMarks?: boolean;
  /** PNG/JPEG of a print format: render the bleed box at this many dots per inch, 150–600 (default 300; openspec add-print-house-images). */
  dpi?: number;
  /** A print house's profile: each card face is written at the exact size it asks for. Hosts resolve the id with ContentIndex.getPrintHouse. */
  printHouse?: PrintHouse;
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
  /**
   * Where image, PDF and PPTX files go (openspec desktop-visible-design-folder): "classic" (default) writes
   * <design-dir>/exports/<name>[-<shape id>].<ext>; "visible" writes them beside the design as
   * <name>-<size label>.<ext> and never overwrites a file the manifest doesn't record as an earlier export.
   */
  layout?: ExportLayout;
  /** mp4/webm/gif: frames per second, 1–60 (default 30, 15 for GIF). */
  fps?: number;
  /** mp4/webm/gif: seconds, 0.5–60 (default: resolved from the page). */
  duration?: number;
  /** gif: loop forever (default true). */
  loop?: boolean;
  /** mp4/webm/gif: explicit ffmpeg (setting/flag); falls back to discovery. */
  ffmpegPath?: string;
  /** mp4/webm/gif: progress after each captured frame. */
  onProgress?: (frame: number, total: number) => void;
  /** mp4/webm/gif: checked between frames. */
  isCancelled?: () => boolean;
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
  /** Print images: the capture resolution (device scale = dpi / 96). */
  dpi?: number;
  /** Print images: the dpi written into the file. */
  densityDpi?: number;
  /** Print house: the exact size to cut the capture to, removing only bleed. */
  cut?: { width: number; height: number };
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
      /** Print images: the dpi written into the files. */
      dpi?: number;
      /** The print house whose sizes were used. */
      printHouse?: { id: string; label: string; source: string; checkedAt: string };
      /** Editable PPTX: what was made native per slide, what is on the background picture, and the fonts used. */
      editable?: EditableReport;
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
/** Print images: dots per inch when none is given; what card and sticker printers ask for. */
export const DEFAULT_PRINT_DPI = 300;
const MAX_IMAGE_PX = 8192;
const BACK_SELECTOR = '[data-od-card][data-od-side="back"]';

function fail(code: ExportErrorCode, error: string): ExportArtifactResult {
  return { ok: false, code, error };
}

function validateOptions(o: ExportArtifactOptions): string | undefined {
  if ((o.width === undefined) !== (o.height === undefined)) return 'width and height must be given together.';
  if (o.width !== undefined && (!isValidDimension(o.width) || !isValidDimension(o.height!))) {
    return 'width and height must be integers between 16 and 8192.';
  }
  if (o.scale !== undefined && !(o.scale >= 1 && o.scale <= 3)) return 'scale must be between 1 and 3.';
  if (o.dpi !== undefined && !(Number.isInteger(o.dpi) && o.dpi >= 150 && o.dpi <= 600)) return 'dpi must be a whole number from 150 to 600.';
  if (o.dpi !== undefined && o.scale !== undefined) return "dpi and scale can't be combined: dpi sets the resolution of print images.";
  if (o.printHouse !== undefined && (o.dpi !== undefined || o.scale !== undefined || o.width !== undefined || o.height !== undefined || o.presets !== undefined || o.selector !== undefined)) {
    return "printHouse sets the size and resolution itself; it can't be combined with dpi, scale, width/height, presets or selector.";
  }
  if (o.quality !== undefined && !(Number.isInteger(o.quality) && o.quality >= 1 && o.quality <= 100)) {
    return 'quality must be an integer between 1 and 100.';
  }
  if (o.format !== undefined && !EXPORT_FORMATS.includes(o.format)) return `format must be one of ${EXPORT_FORMATS.join(', ')}.`;
  if (o.editable && o.format !== 'pptx') return `editable applies to format "pptx" only (an editable PowerPoint of a deck), not "${o.format ?? 'png'}".`;
  if (o.format !== 'standalone' && (o.embedAssets !== undefined || o.maxResolution !== undefined)) return 'embedAssets and maxResolution apply to the "standalone" format only.';
  if (o.maxResolution !== undefined && !ASSET_RESOLUTIONS.includes(o.maxResolution)) return `maxResolution must be one of ${ASSET_RESOLUTIONS.join(', ')}.`;
  if (o.maxResolution !== undefined && !o.embedAssets) return 'maxResolution applies only with embedAssets.';
  if (o.slides !== undefined && (!Array.isArray(o.slides) || o.slides.length === 0 || !o.slides.every((n) => Number.isInteger(n) && n >= 1))) {
    return 'slides must be a non-empty list of 1-based slide numbers.';
  }
  if (o.selector !== undefined && (o.format === 'pdf' || o.format === 'pptx' || o.slides !== undefined)) {
    return 'selector applies to image exports of pages; it can\'t be combined with pdf/pptx or slides.';
  }
  if (o.maxBytes !== undefined && !(Number.isInteger(o.maxBytes) && o.maxBytes > 0)) return 'maxBytes must be a positive integer.';
  if (o.transparent && o.format !== undefined && o.format !== 'png') return `transparent exports a PNG (the only image format with transparency), not "${o.format}".`;
  if (o.selector !== undefined && o.selector.trim() === '') return 'selector must not be empty.';
  if (o.shell !== undefined && o.format !== undefined && o.format !== 'png' && o.format !== 'jpeg') return `shell applies to PNG and JPEG exports of device screens, not "${o.format}".`;
  if (isPackageFormat(o.format) && (o.selector !== undefined || o.slides !== undefined || o.maxBytes !== undefined)) {
    return `selector, slides and maxBytes apply to image, PDF and PPTX exports, not "${o.format}".`;
  }
  if (isMotionFormat(o.format)) {
    const other = (['quality', 'selector', 'deck', 'slides', 'badge', 'baseUrl', 'bleed', 'cropMarks', 'dpi', 'printHouse', 'checkOnly', 'data', 'presets', 'shapeSheet', 'campaignSheet', 'target', 'transparent'] as const).filter((k) => o[k] !== undefined);
    if (other.length > 0) return `${other.join(', ')} ${other.length === 1 ? "doesn't" : "don't"} apply to the "${o.format}" format (it takes fps, duration, loop, width/height or preset, scale and maxBytes).`;
    return undefined;
  }
  if (o.fps !== undefined || o.duration !== undefined || o.loop !== undefined) return 'fps, duration and loop apply to the mp4, webm and gif formats only.';
  if (isInlineFormat(o.format)) {
    const other = (['width', 'height', 'scale', 'quality', 'selector', 'maxBytes', 'deck', 'slides', 'badge', 'preset', 'bleed', 'cropMarks', 'dpi', 'printHouse', 'checkOnly', 'data', 'presets', 'shapeSheet', 'transparent'] as const).filter((k) => o[k] !== undefined);
    if (other.length > 0) return `${other.join(', ')} ${other.length === 1 ? "doesn't" : "don't"} apply to the "${o.format}" format (it takes target and baseUrl).`;
    return undefined;
  }
  if (o.target !== undefined) return 'target applies to the "paste" format only.';
  if (!isPackageFormat(o.format) && (o.badge !== undefined || o.baseUrl !== undefined)) {
    return 'badge applies to the "standalone" and "site" formats, and baseUrl to "site", "email" and "paste".';
  }
  if (o.preset !== undefined && !getFormat(o.preset)) return unknownFormatError(o.preset);
  if (o.bleed !== undefined && !(typeof o.bleed === 'number' && o.bleed >= 0 && o.bleed <= MAX_BLEED_MM)) return `bleed must be between 0 and ${MAX_BLEED_MM} (mm).`;
  if (isPackageFormat(o.format) && (o.preset !== undefined || o.checkOnly || o.data !== undefined || o.bleed !== undefined || o.cropMarks !== undefined || o.dpi !== undefined || o.printHouse !== undefined)) {
    return `preset, bleed, cropMarks, dpi, printHouse, checkOnly and data apply to image and PDF exports, not "${o.format}".`;
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

const EXTENSIONS: Record<CaptureFormat, string> = { png: 'png', jpeg: 'jpg', pdf: 'pdf', pptx: 'pptx' };

/** Where exports go: under exports/ (classic) or beside the design (visible, openspec desktop-visible-design-folder). */
export type ExportLayout = 'classic' | 'visible';

function exportDirFor(posixEntry: string, layout: ExportLayout): string {
  const dir = path.posix.dirname(posixEntry);
  return layout === 'visible' ? dir : path.posix.join(dir, 'exports');
}

/** `<artifact-dir>/exports/<entry-basename>[-NN].<ext>` (beside the entry in the visible layout), workspace-relative with forward slashes. */
export function exportFilePath(entryPath: string, index: number | undefined, format: CaptureFormat, layout: ExportLayout = 'classic'): string {
  const posixEntry = entryPath.replace(/\\/g, '/');
  const base = path.posix.basename(posixEntry, path.posix.extname(posixEntry));
  const suffix = index === undefined ? '' : `-${String(index).padStart(2, '0')}`;
  return path.posix.join(exportDirFor(posixEntry, layout), `${base}${suffix}.${EXTENSIONS[format]}`);
}

/** `<artifact-dir>/exports/<entry-basename>-<suffix>[-NN].<ext>` (beside the entry in the visible layout), for data-bound and shape exports. */
export function exportFilePathWithSuffix(entryPath: string, suffix: string, index: number | undefined, format: CaptureFormat, layout: ExportLayout = 'classic'): string {
  const posixEntry = entryPath.replace(/\\/g, '/');
  const base = path.posix.basename(posixEntry, path.posix.extname(posixEntry));
  const n = index === undefined ? '' : `-${String(index).padStart(2, '0')}`;
  return path.posix.join(exportDirFor(posixEntry, layout), `${base}-${suffix}${n}.${EXTENSIONS[format]}`);
}

const SIDE_EXPORT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.pptx']);

/**
 * Whether `relPath` is one of the entry's exports: anything in its exports/ folder (except the site bundle when
 * `includeSite` is false), or, for the visible layout, an image, PDF or PPTX beside it named `<entry>.<ext>` or
 * `<entry>-….<ext>`.
 */
export function isExportOfEntry(entryPath: string, relPath: string, includeSite = true): boolean {
  const posixEntry = entryPath.replace(/\\/g, '/');
  const rel = path.posix.normalize(relPath.replace(/\\/g, '/'));
  if (rel.includes('/../') || rel.startsWith('../')) return false;
  const dir = path.posix.dirname(posixEntry);
  const exportsDir = path.posix.join(dir, 'exports');
  if (rel.startsWith(`${exportsDir}/`)) return includeSite || !rel.startsWith(`${exportsDir}/site/`);
  if (path.posix.dirname(rel) !== dir) return false;
  const ext = path.posix.extname(rel).toLowerCase();
  if (!SIDE_EXPORT_EXTENSIONS.has(ext)) return false;
  const base = path.posix.basename(posixEntry, path.posix.extname(posixEntry));
  const name = path.posix.basename(rel, path.posix.extname(rel));
  return name === base || name.startsWith(`${base}-`);
}

/**
 * `relOut`, or the first free `<name>-2.<ext>`, `<name>-3.<ext>`… when a file is already there that `recorded`
 * (the manifest's earlier exports) doesn't list: in the visible layout exports share the design's folder with the
 * user's own files, which an export must never replace.
 */
export async function freeExportPath(workspaceRoot: string, relOut: string, recorded: ReadonlySet<string>): Promise<string> {
  const ext = path.posix.extname(relOut);
  const stem = relOut.slice(0, relOut.length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? relOut : `${stem}-${n}${ext}`;
    if (recorded.has(candidate)) return candidate;
    try {
      await fs.access(path.join(workspaceRoot, candidate));
    } catch {
      return candidate;
    }
  }
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

/**
 * Loads the page and waits for it to be ready: network idle, fonts, a 3D
 * scene's `window.odScene.ready` (stopping its turntable for stills unless
 * `still: false`), then `settleMs`.
 */
export async function loadPage(page: Page, url: string, readyTimeoutMs: number, settleMs: number, warnings: string[], options: { still?: boolean } = {}): Promise<void> {
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
  await waitForScene(page, readyTimeoutMs, warnings, { still: options.still ?? true });
  if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));

  // The browser's own automatic /favicon.ico probe isn't something the artifact asked for.
  for (const f of failed) if (!/\/favicon\.ico \(/.test(f)) warnings.push(`Failed to load: ${f}`);
}

/** A capture result, or a packaging result for the `standalone`/`site` formats. */
export type AnyExportResult = ExportArtifactResult | PackageExportResult | InlineExportResult | MotionExportResult;

export function exportArtifact(options: ExportArtifactOptions & { format: PackageFormat }): Promise<PackageExportResult>;
export function exportArtifact(options: ExportArtifactOptions & { format?: CaptureFormat }): Promise<ExportArtifactResult>;
export function exportArtifact(options: ExportArtifactOptions): Promise<AnyExportResult>;
export async function exportArtifact(options: ExportArtifactOptions): Promise<AnyExportResult> {
  const invalid = validateOptions(options);
  if (invalid) return fail('invalid-args', invalid);
  if (isMotionFormat(options.format)) {
    return exportMotion({ ...options, format: options.format });
  }
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
      // Shared fragments and sample data filled in, as the preview shows them.
      entryContent: hasIncludes(artifact.entryContent)
        ? (await resolveIncludes(artifact.entryContent, path.resolve(options.workspaceRoot, relEntry), path.resolve(options.workspaceRoot))).html
        : artifact.entryContent,
      manifest: artifact.manifest,
      format: options.format,
      badge: options.badge,
      badgeSetting: options.badgeSetting,
      baseUrl: options.baseUrl,
      embedAssets: options.embedAssets,
      maxResolution: options.maxResolution,
      assetFetch: options.assetFetch,
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
  // A device screen (openspec add-platform-shells) is captured at its device's content size, then framed.
  const device = parseDevice(artifact.entryContent);
  const deviceSize = device ? DEVICE_CONTENT_SIZES[device.device === 'tablet' ? `tablet-${device.orientation ?? 'landscape'}` : device.device] : undefined;
  if (options.shell !== undefined && !device) return fail('invalid-args', `shell applies to device screens (data-od-device on <body>), and ${options.entryPath} declares no device.`);
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
  // A print house names the file type, size and resolution for the design's format (openspec add-print-house-images).
  let houseEntry: PrintHouseFormat | undefined;
  const house = options.printHouse;
  if (house) {
    const canvas = presetFormat ?? recordedFormat;
    const takes = house.formats.map((f) => f.format).join(', ');
    if (!canvas) return fail('invalid-args', `${house.label} takes ${takes}: pass preset with one of those, or register the design with it.`);
    houseEntry = house.formats.find((f) => f.format === canvas.id);
    if (!houseEntry) return fail('invalid-args', `${house.label} takes ${takes}, and this design is ${canvas.id}. Export it at 300 dpi without printHouse, or make it at one of those sizes.`);
    if (options.format !== undefined && options.format !== houseEntry.type) return fail('invalid-args', `${house.label} wants ${houseEntry.type.toUpperCase()} files for ${canvas.id}; leave format out.`);
  }
  const requestedFormat = (options.format as CaptureFormat | undefined) ?? houseEntry?.type;
  const plan = (canvas: CanvasFormat | undefined, source: 'preset' | 'recorded-format'): ShapePlan => {
    // A print shape (preset or the recorded default) exports its print PDF unless a format is asked for.
    const format: CaptureFormat = requestedFormat ?? (canvas?.medium === 'print' && !explicitSize ? 'pdf' : 'png');
    const printPath = canvas?.medium === 'print' && format === 'pdf' && !explicitSize;
    const bleed = canvas?.medium === 'print' && !explicitSize ? (options.bleed ?? canvas.bleed ?? 0) : undefined;
    const imageFormat = format === 'png' || format === 'jpeg';
    // A preset fills in what the agent used to copy from a table; explicit arguments still win. Fluid cards are always captured by their card.
    const preset = source === 'preset' ? canvas : undefined;
    // Print images are always captured by the card, so each face comes out at its bleed box.
    const printImage = canvas?.medium === 'print' && imageFormat && !explicitSize;
    const selector = options.selector ?? ((preset || fluid || printImage) && imageFormat ? CARD_SELECTOR : undefined);
    const maxBytes = options.maxBytes ?? (preset && imageFormat ? preset.maxBytes : undefined);
    // A fluid card is resized to the shape: explicit px, else the format (mm for print, with bleed).
    let shape: ShapeCss | undefined;
    if (fluid && explicitSize) shape = { widthCss: `${options.width}px`, heightCss: `${options.height}px`, bleedCss: '0mm' };
    else if (fluid && canvas) {
      const unit = canvas.medium === 'print' ? 'mm' : 'px';
      shape = { widthCss: `${canvas.width}${unit}`, heightCss: `${canvas.height}${unit}`, bleedCss: `${bleed ?? 0}mm` };
    }
    // Print images are captured at print resolution: the printer's size, else dpi, else 300 dpi.
    let dpi: number | undefined;
    let densityDpi: number | undefined;
    let cut: { width: number; height: number } | undefined;
    if (printImage) {
      if (houseEntry && houseEntry.format === canvas.id && houseEntry.width && houseEntry.height) {
        dpi = captureDpiFor(canvas, houseEntry);
        densityDpi = houseEntry.dpi ?? DEFAULT_PRINT_DPI;
        cut = { width: houseEntry.width, height: houseEntry.height };
      } else {
        dpi = options.dpi ?? DEFAULT_PRINT_DPI;
        densityDpi = dpi;
      }
    }
    return { canvas, source, format, printPath, bleed, selector, maxBytes, shape, dpi, densityDpi, cut };
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
  if (options.dpi !== undefined && !plans.every((p) => p.dpi !== undefined)) {
    return fail('invalid-args', 'dpi applies to PNG or JPEG exports of print formats (a print preset such as "trading-card" or "a6", or an artifact registered with one).');
  }
  for (const p of plans) {
    if (p.dpi === undefined || !p.canvas) continue;
    const px = bleedBoxPx(p.canvas, p.dpi, p.bleed);
    if (px.width > MAX_IMAGE_PX || px.height > MAX_IMAGE_PX) {
      const box = bleedBox(p.canvas, p.bleed);
      const fits = Math.floor((MAX_IMAGE_PX * 25.4) / Math.max(box.width, box.height));
      return fail('invalid-args', `${p.canvas.id} at ${p.dpi} dpi would be ${px.width}×${px.height} px, over the ${MAX_IMAGE_PX} px limit. The largest dpi that fits is ${fits}; or export a PDF, which has no such limit.`);
    }
  }

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
      width: options.width ?? (deviceSize && !p.canvas && !p.selector ? deviceSize.width : undefined),
      height: options.height ?? (deviceSize && !p.canvas && !p.selector ? deviceSize.height : undefined),
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
    const scaleFor = (p: ShapePlan): number => options.scale ?? p.canvas?.scale ?? (p.dpi ? p.dpi / 96 : 1);
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
        editable: options.editable,
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
    if (options.transparent && (mode !== 'image' || plans.some((p) => p.format !== 'png'))) {
      return fail('invalid-args', `transparent applies to PNG image exports of pages, not ${mode === 'image' ? 'this format' : mode}.`);
    }
    if (!pageMode && (table || options.checkOnly || multiShape || options.shapeSheet || options.campaignSheet)) {
      return fail('invalid-args', `data, checkOnly, presets and shapeSheet apply to page exports (images and page PDFs), not decks (${mode}).`);
    }

    const exportedAt = new Date().toISOString();
    const files: ExportedFile[] = [];
    const findings: Finding[] = [];
    // A 3D scene that couldn't get a WebGL context, or rendered nothing.
    if (usesWebgl(artifact.entryContent)) findings.push(...(await webglFindings(page, warnings)));
    const prints: PrintInfo[] = [];
    let shapeSheetPath: string | undefined;
    let campaignSheetPath: string | undefined;
    let editableResult: EditableReport | undefined;
    let scale = scaleFor(first);
    let viewport = size.viewport;
    let sizeSource: SizeSource = size.source;
    let sizeDetail = fluid && first.shape ? `${size.detail}, reflowed (fluid design)` : size.detail;
    if (multiShape) sizeDetail = `presets ${options.presets!.join(', ')}, each reflowed (fluid design)`;

    const exportLayout: ExportLayout = options.layout ?? 'classic';
    const recordedExports = new Set(
      (Array.isArray((manifest.metadata as JsonRecord | undefined)?.exports) ? ((manifest.metadata as JsonRecord).exports as JsonRecord[]) : [])
        .map((r) => r?.path)
        .filter((p): p is string => typeof p === 'string'),
    );
    const written = new Set<string>();
    /** Writes the file and returns where it went (in the visible layout, possibly a free `-2` name). */
    const writeOut = async (wanted: string, buffer: Buffer): Promise<string> => {
      const relOut = exportLayout === 'visible' && !written.has(wanted) ? await freeExportPath(options.workspaceRoot, wanted, recordedExports) : wanted;
      written.add(relOut);
      const absOut = path.join(options.workspaceRoot, relOut);
      await fs.mkdir(path.dirname(absOut), { recursive: true });
      await fs.writeFile(absOut, buffer);
      return relOut;
    };
    /** The name part for a shape: its id under exports/, its file label beside the design. */
    const shapeName = (canvas: CanvasFormat | undefined): string | undefined => (canvas ? (exportLayout === 'visible' ? canvas.fileLabel : canvas.id) : undefined);
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
      // The campaign sidecar's facts for each thumbnail, in the same order.
      const sheetTiles: Omit<CampaignSheetTile, 'image'>[] = [];
      const rows: Array<Record<string, string> | undefined> = table ? table.rows : [undefined];
      const qrFields = scanBoundFields(artifact.entryContent).qrFields;
      const bind = async (row: Record<string, string>): Promise<void> => {
        const qr: Record<string, string> = {};
        for (const field of qrFields) if (row[field]) qr[field] = await qrSvg(row[field]);
        await page.evaluate(bindRow, row, qr);
      };
      let isolated = false;
      // Card backs (openspec add-print-house-images): [data-od-card][data-od-side="back"], paired with the front before
      // it, or shared by every front when there is one. A back with no bound fields is the same on every row.
      const cardFaces = (await page.evaluate(
        `Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(CARD_SELECTOR)})).map(function (el) { return { back: el.getAttribute('data-od-side') === 'back', fields: !!el.querySelector('[data-od-field],[data-od-qr-field]') }; })`,
      )) as Array<{ back: boolean; fields: boolean }>;
      const hasBack = cardFaces.some((c) => c.back) && house?.backs !== 'none';
      const frontIndexes = cardFaces.map((c, i) => (c.back ? -1 : i)).filter((i) => i >= 0);
      const backIndexes = cardFaces.map((c, i) => (c.back ? i : -1)).filter((i) => i >= 0);
      const sharedBack = backIndexes.length === 1;
      /** The front a back belongs to: every front for a shared back, else the front just before it. */
      const frontsOfBack = (b: number): number[] => (sharedBack ? frontIndexes : frontIndexes.filter((f) => f < b && !frontIndexes.some((g) => g > f && g < b)).slice(-1));
      const tagFaces = (list: Finding[], only?: 'front' | 'back'): Finding[] => {
        if (!hasBack) return list;
        for (const f of list) f.face = only ?? (f.card !== undefined && cardFaces[f.card - 1]?.back ? 'back' : 'front');
        return list;
      };

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
        const passFilesStart = files.length;
        const passTilesStart = sheetTiles.length;

        for (const [i, row] of passRows.entries()) {
          const rowNo = row && pass.exported ? i + 1 : undefined;
          const rowName = row && pass.exported && options.nameField ? row[options.nameField] : undefined;
          if (row) await bind(row);
          findings.push(...fitFindings(await page.evaluate(fitBoundText, cardSelector), { row: rowNo, rowName, shape: shapeId }));
          findings.push(...tagFaces(await runPreflight(page, { cardSelector, format: p.canvas, bleed: p.bleed, row: rowNo, rowName, fluid, shape: shapeId }), p.printPath ? 'front' : undefined));
          if (fluid && p.shape && i === 0) findings.push(...(await checkFixedSize(page, cardSelector, p.shape, { shape: shapeId })));
          if (wantSheet && i === 0) {
            const handle = await page.$(cardSelector);
            if (handle) {
              thumbnails.push({ label: p.canvas?.label ?? 'Default', png: Buffer.from(await handle.screenshot({ type: 'png' })), errors: 0 });
              sheetTiles.push({ label: p.canvas?.label ?? 'Default', shape: p.canvas?.id, errors: [] });
            }
          }
          if (options.checkOnly || !pass.exported) continue;
          const rowPart = row ? rowSuffixes[i] : undefined;
          const shapePartOfName = multiShape || exportLayout === 'visible' ? shapeName(p.canvas) : undefined;
          const nameParts = [rowPart, shapePartOfName].filter((x): x is string => !!x);
          const suffix = nameParts.length > 0 ? nameParts.join('-') : undefined;

          if (passMode === 'image') {
            type Target = { index?: number; capture: (f: ImageFormat, q?: number) => Promise<Buffer>; width: number; height: number; side?: 'front' | 'back'; rowFree?: boolean };
            const targets: Target[] = [];
            if (p.selector) {
              let handles;
              try {
                handles = await page.$$(p.selector);
              } catch (err) {
                return fail('invalid-args', `Invalid selector "${p.selector}": ${err instanceof Error ? err.message : String(err)}`);
              }
              if (handles.length === 0) return fail('selector-no-match', `Selector "${p.selector}" matched no elements in ${options.entryPath}.`);
              const faced = hasBack && p.selector === CARD_SELECTOR && handles.length === cardFaces.length;
              for (const [j, handle] of handles.entries()) {
                const box = await handle.boundingBox();
                if (!box || box.width < 1 || box.height < 1) {
                  if (i === 0) warnings.push(`Element ${j + 1} matching "${p.selector}" has no visible box — skipped.`);
                  continue;
                }
                const capture = async (f: ImageFormat, q?: number) => Buffer.from(await handle.screenshot({ type: f, quality: q, omitBackground: !!options.transparent }));
                const width = Math.round(box.width * passScale);
                const height = Math.round(box.height * passScale);
                if (!faced) {
                  targets.push({ index: j + 1, width, height, capture });
                  continue;
                }
                const frontNo = (f: number): number | undefined => (frontIndexes.length > 1 ? frontIndexes.indexOf(f) + 1 : undefined);
                if (!cardFaces[j].back) {
                  targets.push({ index: frontNo(j), width, height, capture, side: 'front' });
                  continue;
                }
                // A back with no bound fields is written once for the whole export, unless the printer wants one per card.
                const perCard = house?.backs === 'per-card';
                const rowFree = !cardFaces[j].fields && !perCard;
                if (rowFree && i > 0) continue;
                const owners = frontsOfBack(j);
                const indexes = sharedBack && !perCard ? [undefined] : owners.map(frontNo);
                for (const index of indexes) targets.push({ index, width, height, capture, side: 'back', rowFree });
              }
              if (targets.length === 0) return fail('selector-no-match', `No element matching "${p.selector}" has a visible box.`);
            } else {
              const s = sizeFor(p);
              const target: Target = {
                width: s.viewport.width * passScale,
                height: s.viewport.height * passScale,
                capture: async (f, q) => Buffer.from(await page.screenshot({ type: f, quality: q, omitBackground: !!options.transparent })),
              };
              if (device && options.shell !== false && !p.canvas) {
                const bare = target.capture;
                const background = (await page.evaluate(
                  `(function(){var b=getComputedStyle(document.body).backgroundColor;return /^(?:transparent|rgba\\(0, 0, 0, 0\\))$/.test(b)?getComputedStyle(document.documentElement).backgroundColor:b})()`,
                )) as string;
                target.capture = async (f, q) => {
                  const framed = await wrapInDeviceShell(instance, await bare('png'), { ...device, background }, { title, scale: passScale, format: f, quality: q });
                  target.width = framed.width;
                  target.height = framed.height;
                  return framed.buffer;
                };
              }
              targets.push(target);
            }
            const imageFormat = p.format as ImageFormat;
            const passQuality = imageFormat === 'jpeg' ? (options.quality ?? 90) : undefined;
            for (const target of targets) {
              let result: { buffer: Buffer; format: ImageFormat; quality?: number; overBudget: boolean };
              if (p.dpi !== undefined) {
                // Print images: cut to the printer's exact size (removing only bleed), and record the dpi in the file.
                let buffer: Buffer;
                if (p.cut) {
                  let cropped: Buffer;
                  try {
                    cropped = cropPngCentre(await target.capture('png'), p.cut.width, p.cut.height);
                  } catch (err) {
                    return fail('capture-failed', `Couldn't cut the card to ${p.cut.width}×${p.cut.height} px: ${err instanceof Error ? err.message : String(err)}.`);
                  }
                  buffer = imageFormat === 'jpeg' ? await pngToJpeg(instance, cropped, passQuality ?? 90) : cropped;
                  target.width = p.cut.width;
                  target.height = p.cut.height;
                } else buffer = await target.capture(imageFormat, passQuality);
                buffer = imageFormat === 'png' ? setPngDpi(buffer, p.densityDpi!) : setJpegDpi(buffer, p.densityDpi!);
                result = { buffer, format: imageFormat, quality: passQuality, overBudget: false };
              } else {
                // A transparent PNG is never re-encoded as JPEG to fit a budget: that would lose the transparency.
                result = await captureWithinBudget(target.capture, imageFormat, passQuality, options.transparent ? undefined : p.maxBytes);
              }
              // Numbered only when there's more than one image; a single card keeps the plain name. Faces are named -front / -back.
              const index = target.side ? target.index : targets.length > 1 ? target.index : undefined;
              const targetSuffix = target.side ? [...(target.rowFree ? [shapePartOfName] : [rowPart, shapePartOfName]), target.side].filter((x): x is string => !!x).join('-') : suffix;
              const relOut = await writeOut(targetSuffix === undefined ? exportFilePath(relEntry, index, result.format, exportLayout) : exportFilePathWithSuffix(relEntry, targetSuffix, index, result.format, exportLayout), result.buffer);
              if (options.transparent) {
                if (p.maxBytes !== undefined && result.buffer.length > p.maxBytes) warnings.push(`${relOut}: ${result.buffer.length} bytes is over maxBytes (${p.maxBytes}); transparent PNGs aren't re-encoded.`);
                if (isFullyOpaquePng(result.buffer)) {
                  warnings.push(`${relOut}: no pixel is transparent — the page or scene paints its own background. Make html/body background transparent (and, for a 3D scene, the renderer's alpha on with no scene background).`);
                }
              } else budgetWarnings(relOut, p.format, p.maxBytes, { ...result, bytes: result.buffer.length });
              files.push({ path: relOut, width: target.width, height: target.height, bytes: result.buffer.length, format: result.format, quality: result.quality });
            }
          } else if (passMode === 'print-pdf') {
            const front = await printBleedPage(page, geometry!);
            // Duplex: the first front's back follows it on the next page.
            const firstFront = frontIndexes[0];
            const back = hasBack && firstFront !== undefined ? backIndexes.find((b) => frontsOfBack(b).includes(firstFront)) : undefined;
            if (back === undefined) pdfs.push(front);
            else {
              await page.evaluate(showCardForPrint, CARD_SELECTOR, back);
              findings.push(...tagFaces(await runPreflight(page, { cardSelector: BACK_SELECTOR, format: p.canvas, bleed: p.bleed, row: rowNo, rowName, fluid, shape: shapeId }), 'back'));
              const backPdf = await printBleedPage(page, geometry!);
              await page.evaluate(showCardForPrint, CARD_SELECTOR, firstFront);
              pdfs.push(await mergePdfs([front, backPdf], title));
            }
          } else {
            pdfs.push(await capturePagePdf(page, { width: options.width, height: options.height }));
          }
        }
        if (wantSheet) {
          const last = thumbnails[thumbnails.length - 1];
          if (last) last.errors = findings.slice(passFindingsStart).filter((f) => f.severity === 'error').length;
          const tile = sheetTiles[sheetTiles.length - 1];
          if (tile && sheetTiles.length > passTilesStart) {
            tile.errors = tileErrors(findings.slice(passFindingsStart));
            if (files[passFilesStart]) tile.file = files[passFilesStart].path;
          }
        }

        if (passMode !== 'image' && pass.exported && !options.checkOnly) {
          const finish = (pdf: Buffer): Promise<Buffer> => (geometry ? finishPrintPdf(pdf, geometry, { cropMarks: options.cropMarks, title }) : Promise.resolve(pdf));
          const shapePart = multiShape || exportLayout === 'visible' ? shapeName(p.canvas) : undefined;
          const outputs: Array<{ relOut: string; pdf: Buffer }> = [];
          if (table && options.split) {
            for (const [i, pdf] of pdfs.entries()) {
              outputs.push({ relOut: exportFilePathWithSuffix(relEntry, [rowSuffixes[i], shapePart].filter(Boolean).join('-'), undefined, 'pdf', exportLayout), pdf: await finish(pdf) });
            }
          } else {
            const merged = await finish(pdfs.length === 1 ? pdfs[0] : await mergePdfs(pdfs, title));
            outputs.push({ relOut: shapePart ? exportFilePathWithSuffix(relEntry, shapePart, undefined, 'pdf', exportLayout) : exportFilePath(relEntry, undefined, 'pdf', exportLayout), pdf: merged });
          }
          const s = sizeFor(p);
          for (const output of outputs) {
            const { pdf } = output;
            const relOut = await writeOut(output.relOut, pdf);
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
        shapeSheetPath = await writeOut(exportFilePathWithSuffix(relEntry, exportLayout === 'visible' ? 'all-sizes' : 'shapes', undefined, 'png', exportLayout), await composeShapeSheet(instance, thumbnails, title));
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
          sheetTiles.push({ label, entryPath: member.entryPath, errors: tileErrors(checked.findings) });
        }
        const master = relEntry.split(path.sep).join('/');
        campaignSheetPath = campaignSheetPaths(master).sheet;
        await writeOut(campaignSheetPath, await composeShapeSheet(instance, tiles, title, `${title ?? 'Campaign'} — every piece`));
        await writeCampaignSheetSidecar({ workspaceRoot: options.workspaceRoot, master, title, tiles: sheetTiles, images: tiles.map((t) => ({ data: t.png, mime: t.mime })), createdAt: exportedAt });
      }
      // Failed loads are reported as findings too, so the agent sees them with everything else to fix.
      for (const w of warnings) if (w.startsWith('Failed to load: ')) findings.push({ check: 'broken-asset', severity: 'warning', message: w.slice('Failed to load: '.length) });
    } else if (mode === 'deck-pptx-editable') {
      // Editable PPTX: native objects from the browser's layout plus a background picture per slide.
      scale = options.scale ?? 2;
      const captured = await captureEditableDeck(page, { slideCount, slides: options.slides, width: options.width, height: options.height, scale });
      warnings.push(...captured.warnings);
      viewport = { width: captured.stage.w, height: captured.stage.h };
      sizeSource = options.width !== undefined ? 'explicit' : 'deck-stage';
      sizeDetail = options.width !== undefined ? `explicit ${options.width}×${options.height}` : `the deck's measured slide size ${captured.stage.w}×${captured.stage.h}`;
      const assembled = await assembleEditablePptx(captured.slides, { title, stage: captured.stage });
      editableResult = editableReport(captured.slides);
      const relOut = await writeOut(exportFilePathWithSuffix(relEntry, 'editable', undefined, 'pptx', exportLayout), assembled);
      files.push({ path: relOut, width: Math.round(captured.stage.w * scale), height: Math.round(captured.stage.h * scale), bytes: assembled.length, format: 'pptx' });
      if (maxBytes !== undefined && assembled.length > maxBytes) warnings.push(`${relOut}: ${assembled.length} bytes is over maxBytes (${maxBytes}); PPTX isn't re-encoded — try scale: 1.`);
      if (assembled.length > 50 * 1024 * 1024) warnings.push(`${relOut} is over 50 MB — scale: 1 roughly quarters it.`);
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
        const relOut = await writeOut(exportFilePath(relEntry, undefined, docFormat, exportLayout), assembled);
        files.push({ path: relOut, width: pxW, height: pxH, bytes: assembled.length, format: docFormat });
        if (maxBytes !== undefined && assembled.length > maxBytes) {
          warnings.push(`${relOut}: ${assembled.length} bytes is over maxBytes (${maxBytes}); ${docFormat.toUpperCase()} isn't re-encoded — try scale: 1.`);
        }
        if (assembled.length > 50 * 1024 * 1024) warnings.push(`${relOut} is over 50 MB — scale: 1 roughly quarters it.`);
      } else {
        for (const slide of captured.slides) {
          const got = { format: (slide.jpeg ? 'jpeg' : 'png') as ImageFormat, quality: slide.quality, overBudget: slide.overBudget, bytes: slide.buffer.length };
          // Always numbered by the slide's own number, even for a single slide.
          const relOut = await writeOut(exportFilePath(relEntry, slide.number, got.format, exportLayout), slide.buffer);
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
      dpi: plans.find((p) => p.densityDpi !== undefined)?.densityDpi,
      printHouse: house ? { id: house.id, label: house.label, source: house.source, checkedAt: house.checkedAt } : undefined,
      editable: editableResult,
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
  if ('motion' in result) return formatMotionExportResult(result);
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
  if (result.editable) lines.push(...formatEditableReport(result.editable));
  if (result.printHouse) {
    lines.push(`Print house: sized for ${result.printHouse.label} at ${result.dpi} dpi, from their published spec (${result.printHouse.source}, checked ${result.printHouse.checkedAt}). Check it against their upload page before ordering.`);
  } else if (result.dpi !== undefined && !result.checkOnly) {
    lines.push(`Print images at ${result.dpi} dpi, bleed included; the dpi is written into each file.`);
  }
  if (result.campaignSheet) {
    lines.push(`Campaign sheet: ${result.campaignSheet} — every shape and every other piece in the collection; a red dot marks pieces with errors. Its tiles, with their errors, are listed in ${result.campaignSheet.replace(/\.png$/, '.json')}.`);
  }
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
