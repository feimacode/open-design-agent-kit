// Preflight (openspec poster-format-pipeline, "export-preflight"):
// deterministic checks run in the export browser before capture. They never
// block an export; findings come back for the agent to fix and re-check.
import type { Page } from 'puppeteer-core';
import { bleedBox, mmToPx, type CanvasFormat } from './formats';
import { collectPreflight, type PageFinding } from './pageScripts';
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
}

export interface PreflightOptions {
  cardSelector: string;
  format?: CanvasFormat;
  /** Print: bleed in mm (defaults to the format's). */
  bleed?: number;
  row?: number;
  rowName?: string;
}

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
    } else if (Math.abs(actual.width - expected.width) > 1 || Math.abs(actual.height - expected.height) > 1) {
      const r = (n: number): number => Math.round(n * 10) / 10;
      findings.push({
        check: 'bleed-size',
        severity: 'error',
        message: `The card is ${r(actual.width)}×${r(actual.height)} mm but the bleed box is ${expected.width}×${expected.height} mm (trim ${format.width}×${format.height} mm plus ${bleedMm} mm bleed on every side). Resize the card so backgrounds run into the bleed.`,
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
          message: `The card is ${Math.round(b.width)}×${Math.round(b.height)}px but ${format.label} is ${format.width}×${format.height}px. Give it that fixed size (and flex-shrink: 0 inside a flex wrapper).`,
          card: handles.length > 1 ? i + 1 : undefined,
        });
      }
    }
  }

  findings.push(...(await checkQrCodes(page)));
  for (const f of findings) {
    if (options.row !== undefined) f.row = options.row;
    if (options.rowName) f.rowName = options.rowName;
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
    const key = `${f.check}|${f.severity}|${f.card ?? ''}|${f.row ?? ''}`;
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

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.row ?? 0) - (b.row ?? 0) || (a.card ?? 0) - (b.card ?? 0));
}

export function formatFinding(f: Finding): string {
  const where = [f.row !== undefined ? `row ${f.row}${f.rowName ? ` (${f.rowName})` : ''}` : '', f.card !== undefined ? `card ${f.card}` : ''].filter(Boolean).join(', ');
  return `- ${f.severity.toUpperCase()} [${f.check}]${where ? ` ${where}:` : ''} ${f.message}`;
}

/** The preflight section of a formatted export result. */
export function formatPreflight(findings: Finding[]): string[] {
  if (findings.length === 0) return ['Preflight: passed (no problems found).'];
  const sorted = sortFindings(findings);
  const errors = sorted.filter((f) => f.severity === 'error').length;
  const warnings = sorted.filter((f) => f.severity === 'warning').length;
  const head =
    errors + warnings === 0 ? 'Preflight: passed, with notes:' : `Preflight: ${errors} error(s), ${warnings} warning(s) — fix the errors, then re-check with checkOnly: true:`;
  // The same note on every row of a bulk export is said once, with the rows it applies to.
  const lines: string[] = [];
  const grouped = new Map<string, Finding[]>();
  for (const f of sorted) {
    const key = f.row !== undefined && f.severity === 'info' ? `${f.check}|${f.card ?? ''}|${f.message}` : undefined;
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), f]);
  }
  const emitted = new Set<string>();
  for (const f of sorted) {
    const key = f.row !== undefined && f.severity === 'info' ? `${f.check}|${f.card ?? ''}|${f.message}` : undefined;
    const group = key ? grouped.get(key)! : undefined;
    if (!key || !group || group.length === 1) lines.push(formatFinding(f));
    else if (!emitted.has(key)) {
      emitted.add(key);
      lines.push(`- INFO [${f.check}] rows ${group.map((g) => g.row).join(', ')}${f.card !== undefined ? `, card ${f.card}` : ''}: ${f.message}`);
    }
  }
  return [head, ...lines];
}
