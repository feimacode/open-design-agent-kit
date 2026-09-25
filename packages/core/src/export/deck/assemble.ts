// Screenshot-based PPTX/PDF assembly, adapted from upstream Open Design's
// apps/daemon/src/deck-export.ts (commit 1b47e60bd466, Apache-2.0 — see
// ../../vendored/SOURCE.md): one full-bleed image per slide (PPTX), one page per
// slide image (PDF). Pixel-perfect, not editable.
import { PDFDocument } from 'pdf-lib';
import * as PptxGenJSModule from 'pptxgenjs';

export interface SlideImage {
  buffer: Buffer;
  jpeg: boolean;
}

type PptxInstance = InstanceType<typeof import('pptxgenjs').default>;
export type PptxConstructor = { new (): PptxInstance };

// pptxgenjs's default export resolves to different shapes depending on how it
// was loaded: the bare CJS namespace is the class, pure ESM's default is the
// class, and some CJS-interop loaders (tsx, bundlers) double-wrap it as
// default.default. Resolve every known shape once.
export function resolvePptxConstructor(mod: unknown): PptxConstructor {
  if (typeof mod === 'function') return mod as PptxConstructor;
  const candidate = (mod as { default?: unknown } | null | undefined)?.default;
  if (typeof candidate === 'function') return candidate as PptxConstructor;
  const nested = (candidate as { default?: unknown } | null | undefined)?.default;
  if (typeof nested === 'function') return nested as PptxConstructor;
  throw new Error(
    'unable to resolve the PptxGenJS constructor from the pptxgenjs module shape ' +
      `(typeof module: ${typeof mod}, typeof default: ${typeof candidate})`,
  );
}

// Custom layouts keep PowerPoint's 16:9 width (13.333in) so a 4:3, square, or
// portrait deck gets a correctly proportioned slide instead of a letterboxed 16:9.
const PPTX_SLIDE_WIDTH_IN = 13.333;

export async function assemblePptx(images: SlideImage[], opts: { title?: string; aspect?: number } = {}): Promise<Buffer> {
  if (images.length === 0) throw new Error('no slides to export');
  const PptxGenJS = resolvePptxConstructor(PptxGenJSModule);
  const pptx = new PptxGenJS();
  const aspect = opts.aspect && Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : 16 / 9;
  if (Math.abs(aspect - 16 / 9) < 0.01) {
    pptx.layout = 'LAYOUT_16x9';
  } else {
    const height = Number((PPTX_SLIDE_WIDTH_IN / aspect).toFixed(3));
    pptx.defineLayout({ name: 'OD_DECK', width: PPTX_SLIDE_WIDTH_IN, height });
    pptx.layout = 'OD_DECK';
  }
  pptx.author = 'Open Design';
  if (opts.title) pptx.title = opts.title;
  pptx.subject = 'Screenshot-based PPTX';
  for (const img of images) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `data:image/${img.jpeg ? 'jpeg' : 'png'};base64,${img.buffer.toString('base64')}`,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%',
    });
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

// pdf-lib sizes pages in points, not pixels: normalize each page so its longest
// side is 960pt (PowerPoint's 16:9 page is 960×540pt) with the image's aspect
// ratio — the image still embeds at full pixel resolution.
const PDF_PAGE_LONGEST_PT = 960;

export async function assemblePdf(images: SlideImage[], opts: { title?: string } = {}): Promise<Buffer> {
  if (images.length === 0) throw new Error('no slides to export');
  const pdf = await PDFDocument.create();
  if (opts.title) pdf.setTitle(opts.title);
  pdf.setProducer('Open Design');
  for (const img of images) {
    const image = img.jpeg ? await pdf.embedJpg(img.buffer) : await pdf.embedPng(img.buffer);
    const aspect = image.height > 0 ? image.width / image.height : 1;
    const [width, height] = aspect >= 1 ? [PDF_PAGE_LONGEST_PT, PDF_PAGE_LONGEST_PT / aspect] : [PDF_PAGE_LONGEST_PT * aspect, PDF_PAGE_LONGEST_PT];
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return Buffer.from(await pdf.save());
}
