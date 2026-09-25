// Deck capture: decides deck-vs-page, prepares the deck, and captures one image
// per slide through the in-page scripts in ./pageScripts (ported from upstream
// Open Design's desktop deck capture — see that file's header). Capture is kept
// separate from assembly (./assemble) so a future editable-PPTX pass can reuse
// everything up to pinDeckStage and swap only the per-slide loop.
import type { Page } from 'puppeteer-core';
import { exportsForKind } from '../exportFormats';
import type { SlideImage } from './assemble';
import { countRealSlides, measureSlide, pinDeckStage, prepareDeckStage, restackActiveSlide, showSlide } from './pageScripts';
import {
  DECK_STAGE_SELECTOR,
  DEFAULT_SLIDE_H,
  DEFAULT_SLIDE_W,
  HIDE_CHROME_SELECTOR,
  PRESENTER_CLONE_SELECTOR,
  SLIDE_MAX_PX,
  SLIDE_MIN_PX,
  SLIDE_SELECTOR,
} from './selectors';

export type DocumentFormat = 'png' | 'jpeg' | 'pdf' | 'pptx';

export type ExportMode =
  /** The pre-existing image path: viewport or per-selector screenshots. */
  | 'image'
  /** One image per slide (all, or `slides`), written as numbered PNG/JPEG files. */
  | 'deck-images'
  | 'deck-pdf'
  | 'deck-pptx'
  | 'page-pdf';

export type ModeResolution = { ok: true; mode: ExportMode } | { ok: false; code: 'no-slides' | 'not-a-deck' | 'unsupported-format'; error: string };

export interface ModeInput {
  format: DocumentFormat;
  /** Explicit caller signal; undefined = infer. */
  deck?: boolean;
  slides?: number[];
  kind?: string;
  renderer?: string;
  sourceSkillId?: string;
  /** Non-mutating count of real slide surfaces in the loaded page. */
  slideCount: number;
}

/**
 * Deck-or-page (openspec deck-pptx-pdf-export, design D2): an explicit `deck`
 * wins; else a registered deck (kind `deck` / renderer `deck-html`); else an
 * artifact from a deck-mode skill (`od:deck:*`) with ≥2 real slides. `.slide`
 * markup alone never makes a page a deck. The requested format is then checked
 * against what that kind can export (exportsForKind), with deck-ness applied.
 */
export function resolveExportMode(input: ModeInput): ModeResolution {
  const inferred =
    input.kind === 'deck' || input.renderer === 'deck-html' || (input.slideCount >= 2 && (input.sourceSkillId ?? '').startsWith('od:deck:'));
  const isDeck = input.deck ?? inferred;
  const wantsSlides = input.slides !== undefined && input.slides.length > 0;

  const effectiveKind = isDeck ? 'deck' : input.kind;
  const allowed = effectiveKind ? exportsForKind(effectiveKind) : undefined;
  if (allowed && !allowed.includes(input.format)) {
    if (input.format === 'pptx') {
      return {
        ok: false,
        code: 'not-a-deck',
        error: `PPTX export applies to decks, and this artifact (kind "${input.kind}") isn't one. If it really is a slide deck, pass deck: true. Supported formats for it: ${allowed.join(', ')}.`,
      };
    }
    return { ok: false, code: 'unsupported-format', error: `Artifacts of kind "${effectiveKind}" can't be exported as ${input.format}. Supported: ${allowed.join(', ')}.` };
  }

  if (isDeck && input.slideCount === 0 && (input.format === 'pptx' || input.format === 'pdf' || wantsSlides || input.deck === true)) {
    return { ok: false, code: 'no-slides', error: `No slide elements (${SLIDE_SELECTOR}) were found, so this can't be exported as a deck.` };
  }
  if (!isDeck && (input.format === 'pptx' || wantsSlides)) {
    return {
      ok: false,
      code: 'not-a-deck',
      error: `${input.format === 'pptx' ? 'PPTX export' : 'Exporting specific slides'} applies to decks, and this artifact isn't one. If it really is a slide deck, pass deck: true.`,
    };
  }

  switch (input.format) {
    case 'pptx':
      return { ok: true, mode: 'deck-pptx' };
    case 'pdf':
      return { ok: true, mode: isDeck ? 'deck-pdf' : 'page-pdf' };
    default:
      return { ok: true, mode: wantsSlides || input.deck === true ? 'deck-images' : 'image' };
  }
}

export async function countSlides(page: Page): Promise<number> {
  return page.evaluate(countRealSlides, SLIDE_SELECTOR, PRESENTER_CLONE_SELECTOR);
}

export interface CaptureDeckOptions {
  slideCount: number;
  /** 1-based slide numbers; default every slide. */
  slides?: number[];
  width?: number;
  height?: number;
  scale: number;
  format: 'png' | 'jpeg';
  quality?: number;
  /**
   * Optional per-slide encoder (e.g. a byte-budget fitter). Receives a
   * screenshot function for the currently shown slide; default: one shot in
   * `format`/`quality`.
   */
  encode?: (shoot: (format: 'png' | 'jpeg', quality?: number) => Promise<Buffer>) => Promise<EncodedSlide>;
}

export interface EncodedSlide {
  buffer: Buffer;
  format: 'png' | 'jpeg';
  quality?: number;
  overBudget?: boolean;
}

export interface CapturedSlide extends SlideImage {
  /** 1-based slide number in the deck. */
  number: number;
  quality?: number;
  overBudget?: boolean;
}

export interface CaptureDeckResult {
  slides: CapturedSlide[];
  stage: { w: number; h: number };
  warnings: string[];
}

/** Returns an error message for out-of-range or malformed slide numbers, or undefined. */
export function validateSlideNumbers(slides: number[] | undefined, slideCount: number): string | undefined {
  if (!slides) return undefined;
  const bad = slides.filter((n) => !Number.isInteger(n) || n < 1 || n > slideCount);
  return bad.length > 0 ? `Slide number(s) ${bad.join(', ')} out of range — this deck has slides 1–${slideCount}.` : undefined;
}

// A captured slide whose PNG compresses to almost nothing is (near-)uniform —
// usually a deck convention showSlide didn't reveal. ~1 byte per 400 pixels is
// far below any slide carrying real text or imagery.
function looksBlank(buffer: Buffer, width: number, height: number, jpeg: boolean): boolean {
  return !jpeg && buffer.length < (width * height) / 400;
}

export async function captureDeckSlides(page: Page, options: CaptureDeckOptions): Promise<CaptureDeckResult> {
  const warnings: string[] = [];
  // Like upstream, lay the deck out at the default 1920×1080 stage before
  // measuring: decks sized in viewport units (100vw × 100vh) would otherwise
  // measure as whatever viewport the page happened to load in.
  await page.setViewport({ width: options.width ?? DEFAULT_SLIDE_W, height: options.height ?? DEFAULT_SLIDE_H, deviceScaleFactor: options.scale });
  await page.evaluate(prepareDeckStage, HIDE_CHROME_SELECTOR, DECK_STAGE_SELECTOR);
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

  let stage: { w: number; h: number };
  if (options.width !== undefined && options.height !== undefined) {
    stage = { w: options.width, h: options.height };
  } else {
    const measured = await page.evaluate(measureSlide, SLIDE_SELECTOR, DECK_STAGE_SELECTOR, PRESENTER_CLONE_SELECTOR).catch(() => null);
    const valid =
      measured &&
      Number.isFinite(measured.w) &&
      Number.isFinite(measured.h) &&
      measured.w >= SLIDE_MIN_PX &&
      measured.w <= SLIDE_MAX_PX &&
      measured.h >= SLIDE_MIN_PX &&
      measured.h <= SLIDE_MAX_PX;
    stage = valid ? { w: Math.round(measured!.w), h: Math.round(measured!.h) } : { w: DEFAULT_SLIDE_W, h: DEFAULT_SLIDE_H };
    if (!valid) warnings.push(`Couldn't measure the deck's slide size — captured at ${DEFAULT_SLIDE_W}×${DEFAULT_SLIDE_H}.`);
  }

  await page.setViewport({ width: stage.w, height: stage.h, deviceScaleFactor: options.scale });
  await page.evaluate(pinDeckStage, stage.w, stage.h, DECK_STAGE_SELECTOR);

  const numbers = options.slides ?? Array.from({ length: options.slideCount }, (_, i) => i + 1);
  const captured: CapturedSlide[] = [];
  let warnedMoveFallback = false;
  for (const number of numbers) {
    const index = number - 1;
    const rect = await page.evaluate(showSlide, SLIDE_SELECTOR, PRESENTER_CLONE_SELECTOR, index);
    const onStage = rect != null && Math.abs(rect.x) <= 2 && Math.abs(rect.y) <= 2 && rect.w >= stage.w * 0.5 && rect.h >= stage.h * 0.5;
    if (!onStage) {
      const moved = await page.evaluate(restackActiveSlide, SLIDE_SELECTOR, PRESENTER_CLONE_SELECTOR, index, stage.w, stage.h);
      if (moved === false && !warnedMoveFallback) {
        warnings.push("This browser lacks Element.moveBefore, so off-screen slides were re-parented instead: live canvas/iframe content on them may have reset. Use a newer Chrome/Edge for exact capture.");
        warnedMoveFallback = true;
      }
      await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    }
    const shoot = async (format: 'png' | 'jpeg', quality?: number): Promise<Buffer> =>
      Buffer.from(await page.screenshot({ type: format, quality: format === 'jpeg' ? (quality ?? 90) : undefined, clip: { x: 0, y: 0, width: stage.w, height: stage.h } }));
    const encoded: EncodedSlide = options.encode
      ? await options.encode(shoot)
      : { buffer: await shoot(options.format, options.quality), format: options.format, quality: options.format === 'jpeg' ? (options.quality ?? 90) : undefined };
    const jpeg = encoded.format === 'jpeg';
    if (looksBlank(encoded.buffer, stage.w * options.scale, stage.h * options.scale, jpeg)) {
      warnings.push(`Slide ${number} looks blank (a single flat color) — the deck may reveal slides in a way this export doesn't recognize.`);
    }
    captured.push({ number, buffer: encoded.buffer, jpeg, quality: encoded.quality, overBudget: encoded.overBudget });
  }
  return { slides: captured, stage, warnings };
}

/**
 * Page-mode PDF through the browser's print engine: vector, selectable text,
 * paginated by the page's own print CSS. `@page` size wins when declared;
 * otherwise an explicit width/height (CSS px), else A4.
 */
export async function capturePagePdf(page: Page, size: { width?: number; height?: number }): Promise<Buffer> {
  await page.emulateMediaType('print');
  const dims =
    size.width !== undefined && size.height !== undefined ? { width: `${size.width}px`, height: `${size.height}px` } : { format: 'a4' as const };
  return Buffer.from(
    await page.pdf({ ...dims, printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }),
  );
}
