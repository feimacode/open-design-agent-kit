// Export sizing rules (openspec social-post-export, "Export Size Resolution";
// poster-format-pipeline added the canvas-format step): explicit size → the
// `preset` (or the manifest's recorded format) → the source skill's
// aspect_hint → per-element boxes when a selector is given → 1080×1080.
import { bleedBox, mmToPx, type CanvasFormat } from '../poster/formats';

export interface Size {
  width: number;
  height: number;
}

export type SizeSource = 'explicit' | 'preset' | 'recorded-format' | 'skill-aspect-hint' | 'element' | 'default' | 'deck-stage' | 'page-print';

export interface ResolvedExportSize {
  /** Browser viewport (CSS pixels) the page is laid out in. */
  viewport: Size;
  source: SizeSource;
  /** Human-readable explanation, reported back to the caller. */
  detail: string;
}

export const DEFAULT_EXPORT_SIZE: Size = { width: 1080, height: 1080 };
/** Layout viewport when cropping to elements with no other size information. */
export const ELEMENT_LAYOUT_VIEWPORT: Size = { width: 1920, height: 1080 };

const MIN_DIMENSION = 16;
const MAX_DIMENSION = 8192;

/**
 * Parses the first `W×H` (or `WxH` / `W*H`) pair out of upstream's free-form
 * aspect_hint, e.g. "1600×900 (16:9)" → 1600×900, "1280×720 或 1080×1080" →
 * 1280×720. Returns undefined for hints with no pixel pair ("A4 / 长页面").
 */
export function parseAspectHint(hint: string | undefined): Size | undefined {
  if (!hint) return undefined;
  const match = /(\d{2,5})\s*[×xX*]\s*(\d{2,5})/.exec(hint);
  if (!match) return undefined;
  const size = { width: Number(match[1]), height: Number(match[2]) };
  return isValidDimension(size.width) && isValidDimension(size.height) ? size : undefined;
}

export function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_DIMENSION && value <= MAX_DIMENSION;
}

export function resolveExportSize(input: {
  width?: number;
  height?: number;
  aspectHint?: string;
  sourceSkillId?: string;
  selector?: string;
  /** A canvas format from `preset`, or else the manifest's `metadata.format`. */
  canvas?: { format: CanvasFormat; source: 'preset' | 'recorded-format'; bleed?: number };
}): ResolvedExportSize {
  if (input.width !== undefined && input.height !== undefined) {
    return { viewport: { width: input.width, height: input.height }, source: 'explicit', detail: `explicit ${input.width}×${input.height}` };
  }
  if (input.canvas) {
    const { format, source } = input.canvas;
    const label = source === 'preset' ? `preset "${format.id}"` : `the artifact's recorded format "${format.id}"`;
    if (format.medium === 'screen') {
      return { viewport: { width: format.width, height: format.height }, source, detail: `${label} (${format.width}×${format.height})` };
    }
    const box = bleedBox(format, input.canvas.bleed);
    return {
      viewport: { width: Math.ceil(mmToPx(box.width)), height: Math.ceil(mmToPx(box.height)) },
      source,
      detail: `${label} (${box.width}×${box.height} mm with bleed)`,
    };
  }
  const hinted = parseAspectHint(input.aspectHint);
  if (hinted) {
    return {
      viewport: hinted,
      source: 'skill-aspect-hint',
      detail: `aspect hint "${input.aspectHint}" of source skill ${input.sourceSkillId ?? '(unknown)'}`,
    };
  }
  if (input.selector) {
    return {
      viewport: ELEMENT_LAYOUT_VIEWPORT,
      source: 'element',
      detail: `each element's own bounding box (laid out in a ${ELEMENT_LAYOUT_VIEWPORT.width}×${ELEMENT_LAYOUT_VIEWPORT.height} viewport)`,
    };
  }
  const why = input.aspectHint
    ? `the source skill's aspect hint "${input.aspectHint}" has no W×H pair`
    : input.sourceSkillId
      ? `source skill ${input.sourceSkillId} has no aspect hint`
      : 'the artifact has no source skill';
  return { viewport: DEFAULT_EXPORT_SIZE, source: 'default', detail: `default ${DEFAULT_EXPORT_SIZE.width}×${DEFAULT_EXPORT_SIZE.height} (${why})` };
}
