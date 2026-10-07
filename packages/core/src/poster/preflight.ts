// Preflight (openspec poster-format-pipeline, "export-preflight"):
// deterministic checks run in the export browser before capture. They never
// block an export; findings come back for the agent to fix and re-check.
import type { Page } from 'puppeteer-core';
import { bleedBox, mmToPx, type CanvasFormat } from './formats';
import { applyShape, collectPreflight, measureScalables, type PageFinding, type ShapeCss } from './pageScripts';
import { measureCardMm } from './printPdf';
import { decodeQrPng } from './qr';

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface Finding {
  check: string;
  severity: FindingSeverity;
  message: string;
  selector?: string;
  /** 1-based card number, when the page has several cards. */
  card?: number;
  /** 1-based data row, for bulk exports. */
  row?: number;
  /** The row's nameField value, for bulk exports. */
  rowName?: string;
  /** The canvas format id, for multi-shape exports. */
  shape?: string;
  /** The viewport name, for visual checks of pages (e.g. "mobile"). */
  viewport?: string;
  /** 1-based slide number, for visual checks of decks. */
  slide?: number;
}

export interface PreflightOptions {
  cardSelector: string;
  format?: CanvasFormat;
  /** Print: bleed in mm (defaults to the format's). */
  bleed?: number;
  row?: number;
  rowName?: string;
  /** The card is fluid (data-od-fluid): it was resized to the shape, so size mismatches are export's, not the author's. */
  fluid?: boolean;
  /** Tag findings with this shape (multi-shape exports). */
  shape?: string;
  /** Tag findings with this viewport name (visual checks). */
  viewport?: string;
  /** Tag findings with this slide number (visual checks of decks). */
  slide?: number;
}

const FIXED_DESIGN_HINT = ' This design is fixed-size; use adapt_open_design_artifact to make other shapes, or build it fluid (data-od-fluid) so export can reflow it.';

/** Screen text under this many px (scaled for canvases wider than 1080px) reads poorly in a feed. */
const SCREEN_MIN_TYPE_PX = 14;
/** At most this many findings per check and card; the rest are summarized. */
const MAX_PER_CHECK = 8;

export async function runPreflight(page: Page, options: PreflightOptions): Promise<Finding[]> {
  const format = options.format;
  const print = format?.medium === 'print';
  const bleedMm = print ? (options.bleed ?? format?.bleed ?? 0) : 0;
  const raw: PageFinding[] = await page.evaluate(collectPreflight, {
    cardSelector: options.cardSelector,
    print,
    bleedPx: mmToPx(bleedMm),
    safeInsetPx: format ? (print ? mmToPx(format.safeInset) : format.safeInset) : 0,
    minTypePt: print ? format?.minTypePt : undefined,
    minTypePx: format && !print ? SCREEN_MIN_TYPE_PX * Math.max(1, format.width / 1080) : undefined,
  });
  const findings: Finding[] = [...raw];

  if (print && format) {
    const expected = bleedBox(format, bleedMm);
    const actual = await measureCardMm(page, options.cardSelector);
    if (!actual) {
      findings.push({ check: 'bleed-size', severity: 'error', message: `No ${options.cardSelector} element found; a print piece is one card sized ${expected.width}×${expected.height} mm (trim plus bleed).` });
    } else if (!options.fluid && (Math.abs(actual.width - expected.width) > 1 || Math.abs(actual.height - expected.height) > 1)) {
      const r = (n: number): number => Math.round(n * 10) / 10;
      findings.push({
        check: 'bleed-size',
        severity: 'error',
        message: `The card is ${r(actual.width)}×${r(actual.height)} mm but the bleed box is ${expected.width}×${expected.height} mm (trim ${format.width}×${format.height} mm plus ${bleedMm} mm bleed on every side). Resize the card so backgrounds run into the bleed.${FIXED_DESIGN_HINT}`,
      });
    }
  }

  if (format && !print) {
    const handles = await page.$$(options.cardSelector);
    for (const [i, handle] of handles.entries()) {
      const b = await handle.boundingBox();
      if (b && (Math.abs(b.width - format.width) > 1 || Math.abs(b.height - format.height) > 1)) {
        findings.push({
          check: 'card-size',
          severity: 'error',
          message: `The card is ${Math.round(b.width)}×${Math.round(b.height)}px but ${format.label} is ${format.width}×${format.height}px. Give it that fixed size (and flex-shrink: 0 inside a flex wrapper).${options.fluid ? '' : FIXED_DESIGN_HINT}`,
          card: handles.length > 1 ? i + 1 : undefined,
        });
      }
    }
  }

  findings.push(...(await checkQrCodes(page)));
  for (const f of findings) {
    if (options.row !== undefined) f.row = options.row;
    if (options.rowName) f.rowName = options.rowName;
    if (options.shape) f.shape = options.shape;
    if (options.viewport) f.viewport = options.viewport;
    if (options.slide !== undefined) f.slide = options.slide;
  }
  return capFindings(findings);
}

/** Decodes every `[data-od-qr]` element at 2× and compares it to its attribute. */
async function checkQrCodes(page: Page): Promise<Finding[]> {
  const handles = await page.$$('[data-od-qr]');
  if (handles.length === 0) return [];
  const findings: Finding[] = [];
  const viewport = page.viewport();
  if (viewport) await page.setViewport({ ...viewport, deviceScaleFactor: 2 });
  try {
    for (const handle of handles) {
      const expected = await handle.evaluate((el) => (el as unknown as { getAttribute(n: string): string | null }).getAttribute('data-od-qr') ?? '');
      const box = await handle.boundingBox();
      if (!box || box.width < 1 || box.height < 1) continue;
      let decoded: string | undefined;
      try {
        decoded = decodeQrPng(Buffer.from(await handle.screenshot({ type: 'png' })));
      } catch {
        decoded = undefined;
      }
      if (decoded === undefined) {
        findings.push({ check: 'qr', severity: 'warning', message: `The QR code for "${expected}" couldn't be decoded from the render. It may still scan, but a too-small quiet zone, low contrast or an overlaid logo is the usual cause.`, selector: 'QR code' });
      } else if (expected !== '' && decoded !== expected) {
        findings.push({ check: 'qr', severity: 'error', message: `A QR code labelled "${expected}" actually decodes to "${decoded}".`, selector: 'QR code' });
      }
    }
  } finally {
    if (viewport) await page.setViewport(viewport);
  }
  return findings;
}

function capFindings(findings: Finding[]): Finding[] {
  const counts = new Map<string, number>();
  const out: Finding[] = [];
  const dropped = new Map<string, Finding & { extra: number }>();
  for (const f of findings) {
    const key = `${f.check}|${f.severity}|${f.card ?? ''}|${f.row ?? ''}|${f.viewport ?? ''}|${f.slide ?? ''}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n <= MAX_PER_CHECK) out.push(f);
    else {
      const d = dropped.get(key);
      if (d) d.extra++;
      else dropped.set(key, { ...f, extra: 1 });
    }
  }
  for (const d of dropped.values()) {
    const { extra, ...rest } = d;
    out.push({ ...rest, selector: undefined, message: `…and ${extra} more ${d.check} ${d.severity}(s) like the above.` });
  }
  return out;
}

/** Growth below this when the card grows 1.5× means a size ignored the card. A fixed size grows exactly 1×; a relative size with a max(…) floor still grows somewhat, so it isn't flagged. */
const MIN_FLUID_GROWTH = 1.05;

/**
 * fixed-size (fluid-canvas spec): measures text sizes and graphic widths, renders
 * the card at 1.5× the shape, measures again, restores the shape, and reports
 * elements that didn't grow with the card.
 */
export async function checkFixedSize(page: Page, cardSelector: string, shape: ShapeCss, tag: { shape?: string } = {}): Promise<Finding[]> {
  const scale = (css: string): string => {
    const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(css.trim());
    return m ? `${Number(m[1]) * 1.5}${m[2]}` : css;
  };
  const before = await page.evaluate(measureScalables, cardSelector);
  await page.evaluate(applyShape, cardSelector, { widthCss: scale(shape.widthCss), heightCss: scale(shape.heightCss), bleedCss: shape.bleedCss });
  const after = await page.evaluate(measureScalables, cardSelector);
  await page.evaluate(applyShape, cardSelector, shape);
  const findings: Finding[] = [];
  if (after.length !== before.length) return findings;
  for (const [i, b] of before.entries()) {
    const a = after[i];
    const growth = b.text ? (b.font > 0 ? a.font / b.font : 1.5) : b.width > 0 ? a.width / b.width : 1.5;
    if (growth < MIN_FLUID_GROWTH) {
      findings.push({
        check: 'fixed-size',
        severity: 'warning',
        message: `${b.name} doesn't scale with the poster (its ${b.text ? 'font size' : 'width'} grew ${Math.round(growth * 100) / 100}× when the card grew 1.5×). Size it in cqw/cqh/cqmin so it reflows with every shape.`,
        selector: b.name,
        ...(tag.shape ? { shape: tag.shape } : {}),
      });
    }
  }
  return capFindings(findings);
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.shape ?? '').localeCompare(b.shape ?? '') ||
      (a.row ?? 0) - (b.row ?? 0) ||
      (a.card ?? 0) - (b.card ?? 0) ||
      (a.viewport ?? '').localeCompare(b.viewport ?? '') ||
      (a.slide ?? 0) - (b.slide ?? 0),
  );
}

export function formatFinding(f: Finding): string {
  const where = [f.viewport ? f.viewport : '', f.slide !== undefined ? `slide ${f.slide}` : '', f.shape ? `shape ${f.shape}` : '', f.row !== undefined ? `row ${f.row}${f.rowName ? ` (${f.rowName})` : ''}` : '', f.card !== undefined ? `card ${f.card}` : ''].filter(Boolean).join(', ');
  return `- ${f.severity.toUpperCase()} [${f.check}]${where ? ` ${where}:` : ''} ${f.message}`;
}

/** The preflight section of a formatted export result. */
export function formatPreflight(findings: Finding[], recheck = 're-check with checkOnly: true'): string[] {
  if (findings.length === 0) return ['Preflight: passed (no problems found).'];
  const sorted = sortFindings(findings);
  const errors = sorted.filter((f) => f.severity === 'error').length;
  const warnings = sorted.filter((f) => f.severity === 'warning').length;
  const head =
    errors + warnings === 0 ? 'Preflight: passed, with notes:' : `Preflight: ${errors} error(s), ${warnings} warning(s) — fix the errors, then ${recheck}:`;
  // The same note on every row of a bulk export, or every shape of a multi-shape one, is said once, listing where it applies.
  const noteKey = (f: Finding): string | undefined =>
    f.severity === 'info' && (f.row !== undefined || f.shape !== undefined || f.viewport !== undefined || f.slide !== undefined) ? `${f.check}|${f.card ?? ''}|${f.message}` : undefined;
  const grouped = new Map<string, Finding[]>();
  for (const f of sorted) {
    const key = noteKey(f);
    if (key) grouped.set(key, [...(grouped.get(key) ?? []), f]);
  }
  const lines: string[] = [];
  const emitted = new Set<string>();
  for (const f of sorted) {
    const key = noteKey(f);
    const group = key ? grouped.get(key)! : undefined;
    if (!key || !group || group.length === 1) lines.push(formatFinding(f));
    else if (!emitted.has(key)) {
      emitted.add(key);
      const shapes = [...new Set(group.map((g) => g.shape).filter(Boolean))];
      const rows = [...new Set(group.map((g) => g.row).filter((r) => r !== undefined))];
      const viewports = [...new Set(group.map((g) => g.viewport).filter(Boolean))];
      const slides = [...new Set(group.map((g) => g.slide).filter((n) => n !== undefined))];
      const where = [
        viewports.length ? viewports.join(', ') : '',
        slides.length ? `slides ${slides.join(', ')}` : '',
        shapes.length ? `shapes ${shapes.join(', ')}` : '',
        rows.length ? `rows ${rows.join(', ')}` : '',
        f.card !== undefined ? `card ${f.card}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      lines.push(`- INFO [${f.check}] ${where}: ${f.message}`);
    }
  }
  return [head, ...lines];
}
