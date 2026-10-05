// Print-ready PDF (openspec poster-format-pipeline, "print-export"): the
// card is authored at the bleed box, printed 1:1 in screen media so the PDF
// matches the preview, then pdf-lib marks TrimBox/BleedBox and, optionally,
// draws crop marks in a slug area around the page.
import { cmyk, PDFDocument } from 'pdf-lib';
import type { Page } from 'puppeteer-core';
import { MM_PER_INCH, pxToMm } from './formats';
import { isolateCardForPrint } from './pageScripts';

const PT_PER_MM = 72 / MM_PER_INCH;
/** Extra page area around the bleed box that carries the crop marks. */
export const CROP_SLUG_MM = 10;
/** Gap between the bleed edge and the start of a crop mark. */
const CROP_GAP_MM = 1;
const CROP_LINE_PT = 0.25;

export interface PrintGeometry {
  /** Trim size, mm. */
  trimWidth: number;
  trimHeight: number;
  /** Bleed on every side, mm. */
  bleed: number;
}

export const bleedWidth = (g: PrintGeometry): number => g.trimWidth + 2 * g.bleed;
export const bleedHeight = (g: PrintGeometry): number => g.trimHeight + 2 * g.bleed;

/** The rendered card's size in mm, or undefined when there is no card. */
export async function measureCardMm(page: Page, cardSelector: string): Promise<{ width: number; height: number } | undefined> {
  const handle = await page.$(cardSelector);
  const box = await handle?.boundingBox();
  if (!box) return undefined;
  return { width: pxToMm(box.width), height: pxToMm(box.height) };
}

/** Isolates the card for printing (once per page) and switches to screen media. */
export async function preparePrintPage(page: Page, cardSelector: string, g: PrintGeometry): Promise<boolean> {
  await page.emulateMediaType('screen');
  return page.evaluate(isolateCardForPrint, cardSelector, bleedWidth(g), bleedHeight(g));
}

/** Prints the (already isolated) page as one bleed-box-sized page. */
export async function printBleedPage(page: Page, g: PrintGeometry): Promise<Buffer> {
  return Buffer.from(
    await page.pdf({
      width: `${bleedWidth(g)}mm`,
      height: `${bleedHeight(g)}mm`,
      printBackground: true,
      preferCSSPageSize: false,
      pageRanges: '1',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    }),
  );
}

/** Sets TrimBox/BleedBox on every page and, with cropMarks, adds a slug with corner marks. */
export async function finishPrintPdf(pdf: Buffer, g: PrintGeometry, options: { cropMarks?: boolean; title?: string } = {}): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  if (options.title) doc.setTitle(options.title);
  const W = bleedWidth(g) * PT_PER_MM;
  const H = bleedHeight(g) * PT_PER_MM;
  const b = g.bleed * PT_PER_MM;
  for (const page of doc.getPages()) {
    // Chrome rounds the paper size up slightly and draws from the top-left, so the
    // exact bleed box sits at the top of the page it made: shift every box by the difference.
    const y0 = Math.max(0, page.getSize().height - H);
    page.setBleedBox(0, y0, W, H);
    page.setTrimBox(b, y0 + b, W - 2 * b, H - 2 * b);
    if (!options.cropMarks) {
      page.setMediaBox(0, y0, W, H);
      page.setCropBox(0, y0, W, H);
      continue;
    }
    const s = CROP_SLUG_MM * PT_PER_MM;
    page.setMediaBox(-s, y0 - s, W + 2 * s, H + 2 * s);
    page.setCropBox(-s, y0 - s, W + 2 * s, H + 2 * s);
    const gap = CROP_GAP_MM * PT_PER_MM;
    const end = s - CROP_GAP_MM * PT_PER_MM;
    const color = cmyk(1, 1, 1, 1);
    const line = (x1: number, y1: number, x2: number, y2: number): void =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: CROP_LINE_PT, color });
    for (const x of [b, W - b]) {
      line(x, y0 - gap, x, y0 - end);
      line(x, y0 + H + gap, x, y0 + H + end);
    }
    for (const y of [y0 + b, y0 + H - b]) {
      line(-gap, y, -end, y);
      line(W + gap, y, W + end, y);
    }
  }
  return Buffer.from(await doc.save());
}

/** Concatenates single- or multi-page PDFs in order. */
export async function mergePdfs(pdfs: Buffer[], title?: string): Promise<Buffer> {
  const out = await PDFDocument.create();
  if (title) out.setTitle(title);
  for (const pdf of pdfs) {
    const src = await PDFDocument.load(pdf);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  return Buffer.from(await out.save());
}

export const RGB_NOTE =
  'Color: this PDF is RGB (sRGB). Most print shops convert it automatically; if yours requires CMYK or PDF/X, convert it with your printer\'s tool or a PDF/X converter first.';
