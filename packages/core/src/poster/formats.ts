// Named canvas formats (openspec poster-format-pipeline, "poster-formats"):
// the one table brief preparation, export presets, adaptation and the
// workflow prompts all read, so a size is never hand-copied between them.
// Screen formats are CSS pixels; print formats are trim sizes in mm, with
// bleed added around them (authored into the card, see composeCanvasSection).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type FormatMedium = 'screen' | 'print';

export interface CanvasFormat {
  id: string;
  label: string;
  medium: FormatMedium;
  /** Screen: CSS px. Print: trim size in mm. */
  width: number;
  height: number;
  unit: 'px' | 'mm';
  /** Keep text and logos this far inside the trim edge (same unit). */
  safeInset: number;
  /** Print only: default bleed in mm on every side. */
  bleed?: number;
  /** Print only: smallest readable body text, in points, at this size's viewing distance. */
  minTypePt?: number;
  /** Screen only: the platform's upload limit. */
  maxBytes?: number;
  /** Several same-size cards in one file (carousels, card sets). */
  multiCard?: boolean;
  /** The recipe to use when the user didn't name one. */
  skillHint?: string;
}

/** 3 mm is the ISO convention; US printers ask for 0.125 in. */
const ISO_BLEED = 3;
const US_BLEED = 3.175;

const LIST: CanvasFormat[] = [
  { id: 'x-image', label: 'X single image', medium: 'screen', width: 1600, height: 900, unit: 'px', safeInset: 48, maxBytes: 5_000_000, skillHint: 'od:prototype:card-twitter' },
  { id: 'ig-square', label: 'Square carousel (Instagram / LinkedIn)', medium: 'screen', width: 1080, height: 1080, unit: 'px', safeInset: 48, maxBytes: 8_000_000, multiCard: true, skillHint: 'od:prototype:social-carousel' },
  { id: 'ig-portrait', label: 'Instagram portrait', medium: 'screen', width: 1080, height: 1350, unit: 'px', safeInset: 48, maxBytes: 8_000_000, skillHint: 'od:prototype:poster-hero' },
  { id: 'story', label: 'Story / Reels / TikTok cover', medium: 'screen', width: 1080, height: 1920, unit: 'px', safeInset: 48, maxBytes: 8_000_000, skillHint: 'od:prototype:poster-hero' },
  { id: 'xhs-card', label: 'Xiaohongshu cards', medium: 'screen', width: 1080, height: 1440, unit: 'px', safeInset: 48, multiCard: true, skillHint: 'od:prototype:card-xiaohongshu' },
  { id: 'yt-thumbnail', label: 'YouTube thumbnail', medium: 'screen', width: 1280, height: 720, unit: 'px', safeInset: 48, maxBytes: 2_000_000, skillHint: 'od:prototype:social-youtube-thumbnail' },
  { id: 'a4', label: 'A4 (210×297 mm)', medium: 'print', width: 210, height: 297, unit: 'mm', safeInset: 5, bleed: ISO_BLEED, minTypePt: 9, skillHint: 'od:prototype:poster-hero' },
  { id: 'a3', label: 'A3 (297×420 mm)', medium: 'print', width: 297, height: 420, unit: 'mm', safeInset: 5, bleed: ISO_BLEED, minTypePt: 10, skillHint: 'od:prototype:poster-hero' },
  { id: 'a2', label: 'A2 (420×594 mm)', medium: 'print', width: 420, height: 594, unit: 'mm', safeInset: 10, bleed: ISO_BLEED, minTypePt: 14, skillHint: 'od:prototype:poster-hero' },
  { id: 'a1', label: 'A1 (594×841 mm)', medium: 'print', width: 594, height: 841, unit: 'mm', safeInset: 10, bleed: ISO_BLEED, minTypePt: 18, skillHint: 'od:prototype:poster-hero' },
  { id: 'a0', label: 'A0 (841×1189 mm)', medium: 'print', width: 841, height: 1189, unit: 'mm', safeInset: 15, bleed: ISO_BLEED, minTypePt: 24, skillHint: 'od:prototype:poster-hero' },
  { id: 'letter', label: 'US Letter (8.5×11 in)', medium: 'print', width: 215.9, height: 279.4, unit: 'mm', safeInset: 5, bleed: US_BLEED, minTypePt: 9, skillHint: 'od:prototype:poster-hero' },
  { id: 'tabloid', label: 'Tabloid (11×17 in)', medium: 'print', width: 279.4, height: 431.8, unit: 'mm', safeInset: 5, bleed: US_BLEED, minTypePt: 10, skillHint: 'od:prototype:poster-hero' },
  { id: 'poster-18x24', label: 'Poster 18×24 in', medium: 'print', width: 457.2, height: 609.6, unit: 'mm', safeInset: 10, bleed: US_BLEED, minTypePt: 14, skillHint: 'od:prototype:poster-hero' },
  { id: 'poster-24x36', label: 'Poster 24×36 in', medium: 'print', width: 609.6, height: 914.4, unit: 'mm', safeInset: 12, bleed: US_BLEED, minTypePt: 18, skillHint: 'od:prototype:poster-hero' },
];

export const FORMATS: Readonly<Record<string, CanvasFormat>> = Object.freeze(Object.fromEntries(LIST.map((f) => [f.id, f])));
export const FORMAT_IDS: readonly string[] = LIST.map((f) => f.id);

export function getFormat(id: string | undefined): CanvasFormat | undefined {
  return id === undefined ? undefined : FORMATS[id];
}

export function unknownFormatError(id: string): string {
  return `Unknown format "${id}". Valid format ids: ${FORMAT_IDS.join(', ')}.`;
}

/** One line per format, for tool descriptions. */
export function formatCatalogSummary(): string {
  return LIST.map((f) => `${f.id} (${f.unit === 'px' ? `${f.width}×${f.height}px` : `${f.width}×${f.height}mm print`})`).join(', ');
}

export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_INCH = 96;
export const mmToPx = (mm: number): number => (mm * CSS_PX_PER_INCH) / MM_PER_INCH;
export const pxToMm = (px: number): number => (px * MM_PER_INCH) / CSS_PX_PER_INCH;

/** Rounds to 0.01 mm, which keeps 3.175-mm bleeds readable without float noise. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Trim plus bleed on every side, in mm. A screen format's box is its own size. */
export function bleedBox(format: CanvasFormat, bleed = format.bleed ?? 0): { width: number; height: number; bleed: number } {
  if (format.medium === 'screen') return { width: format.width, height: format.height, bleed: 0 };
  return { width: round2(format.width + 2 * bleed), height: round2(format.height + 2 * bleed), bleed };
}

const fmt = (n: number): string => String(round2(n));

/** The "Canvas" section appended to a brief when a format is given (poster-formats spec). */
const SHARED_CANVAS_RULES = `Every \`[data-od-field="<column>"]\` element marks text (or an \`img\` \`src\` / \`a\` \`href\`) that can be filled per row from a spreadsheet at export time, so give such fields room for longer values (\`text-wrap: balance\`, no fixed one-line widths). Put any QR code in as inline SVG carrying \`data-od-qr="<the encoded text>"\` (make one with create_open_design_qr_code; never draw a fake one) or mark its slot \`data-od-qr-field="<column>"\` for a per-row code. Before exporting, run export_open_design_artifact with \`checkOnly: true\` and fix every preflight error it reports.`;

export function composeCanvasSection(format: CanvasFormat): string {
  const shared = SHARED_CANVAS_RULES;
  if (format.medium === 'screen') {
    const cards = format.multiCard
      ? 'For several cards, stack them vertically in the one HTML file, each its own `[data-od-card]` element at exactly this size.'
      : 'The design is **one** `[data-od-card]` element at exactly this size.';
    return `## Canvas — ${format.label} (\`${format.id}\`)\n\n- Size: **${format.width}×${format.height} px**. ${cards} Give the card \`overflow: hidden\` and a fixed \`width\`/\`height\` in px.\n- Safe area: keep all text, logos and key subjects at least **${format.safeInset}px** inside the card's edges. Backgrounds can run to the edge.\n- Make the hook readable at thumbnail size.\n\n${shared}`;
  }
  const box = bleedBox(format);
  return `## Canvas — ${format.label} print (\`${format.id}\`)\n\nThis is a **print** piece. A print shop trims it to ${fmt(format.width)}×${fmt(format.height)} mm, and needs artwork that runs ${fmt(box.bleed)} mm past every trim edge (bleed) so no white slivers show after cutting.\n\n- The design is **one** \`[data-od-card]\` element sized **${fmt(box.width)}mm × ${fmt(box.height)}mm** (the trim size plus ${fmt(box.bleed)} mm bleed on every side), with \`overflow: hidden\`, \`position: relative\` and \`box-sizing: border-box\`. Use \`mm\` (or \`px\`) for the card; **never** viewport units (\`vw\`, \`vh\`, \`vmin\`), which change between the preview and the printer.\n- Page setup: \`body { margin: 0 }\`, and nothing else on the page outside the card.\n- Full-bleed backgrounds, photos and color fields fill the whole card, out to its edges.\n- Text, logos, QR codes and anything that must not be cut sit at least **${fmt(box.bleed + format.safeInset)} mm** inside the card's edges (bleed ${fmt(box.bleed)} mm plus a ${fmt(format.safeInset)} mm safe margin).\n- Minimum type size: **${format.minTypePt} pt** for any text meant to be read (1 pt = 1/72 in; \`font-size: ${format.minTypePt}pt\` works directly). Headlines should be several times larger: a poster is read from a distance.\n- Raster images need at least 150 ppi at their printed size (an image printed 100 mm wide needs at least 591 px). Prefer SVG and CSS for graphics.\n- Colors print from RGB; very saturated screen colors (neon greens, electric blues) come out duller on paper.\n\n${shared}`;
}

/** A3: the default shape of a fluid poster brief that names no format. */
export const DEFAULT_FLUID_FORMAT_ID = 'a3';

/**
 * Resolves a brief's canvas: fluid by default for print formats, fixed for screen
 * formats (social recipes need exact pixels), and no canvas at all when neither a
 * format nor `fluid: true` is given. `fluid: true` alone defaults the shape to A3.
 */
export function resolveBriefCanvas(formatId: string | undefined, fluid: boolean | undefined): { format?: CanvasFormat; fluid: boolean } | { error: string } {
  const format = getFormat(formatId);
  if (formatId !== undefined && !format) return { error: unknownFormatError(formatId) };
  if (!format) return fluid ? { format: FORMATS[DEFAULT_FLUID_FORMAT_ID], fluid: true } : { fluid: false };
  return { format, fluid: fluid ?? format.medium === 'print' };
}

/** True when the HTML has a `[data-od-card]` element that also carries `data-od-fluid`. */
export function isFluidHtml(html: string): boolean {
  for (const m of html.matchAll(/<[a-z][\w-]*\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (/(?:^|\s)data-od-card(?=[\s=/]|$)/i.test(attrs) && /(?:^|\s)data-od-fluid(?=[\s=/]|$)/i.test(attrs)) return true;
  }
  return false;
}

/** The "Canvas" section for a fluid brief (fluid-canvas spec): one design, any shape, chosen at export. */
export function composeFluidCanvasSection(format: CanvasFormat): string {
  const print = format.medium === 'print';
  const unit = print ? 'mm' : 'px';
  const w = `${fmt(format.width)}${unit}`;
  const h = `${fmt(format.height)}${unit}`;
  // 48px covers every screen format's safe margin, and is wider than every print safe area at its own size.
  const safe = print ? 'calc(var(--od-bleed) + max(48px, 6cqmin))' : 'max(48px, 6cqmin)';
  const typeRule = print
    ? `Body text at least **${format.minTypePt} pt** at this size: write it as \`font-size: max(${format.minTypePt}pt, 2.4cqmin)\` so it never drops below that on smaller shapes. Headlines are much larger, in \`cqmin\`/\`cqw\`.`
    : 'Body text at least 14px at this size: write it as `font-size: max(14px, 2.4cqmin)`. Headlines are much larger, in `cqmin`/`cqw`.';
  return `## Canvas — fluid poster, default shape ${format.label} (\`${format.id}\`)

This design is **fluid**: one file that reflows to any shape. Its default shape is ${fmt(format.width)}×${fmt(format.height)} ${unit}${print ? ' (trim size)' : ''}, but the user can pick another shape (A-series, US poster sizes, Instagram, Story, X) at export or in the preview, and export resizes the card by changing two CSS variables. Build it so every shape works.

\`\`\`html
<div data-od-card data-od-fluid>
  <div class="od-safe"> … all text, logos and QR codes … </div>
</div>
\`\`\`

\`\`\`css
body { margin: 0; }
[data-od-card] {
  --od-w: ${w}; --od-h: ${h};  /* the default shape; export overrides these */
  --od-bleed: 0mm;              /* export sets this for print; never set it yourself */
  width: calc(var(--od-w) + 2 * var(--od-bleed));
  height: calc(var(--od-h) + 2 * var(--od-bleed));
  container-type: size; position: relative; overflow: hidden; box-sizing: border-box;
}
.od-safe { position: absolute; inset: ${safe}; }
@container (aspect-ratio > 1.2) { /* wide shapes (X 16:9, landscape): e.g. headline left, details right */ }
@container (aspect-ratio < 0.6) { /* tall shapes (Story 9:16): e.g. bigger headline, more vertical rhythm */ }
\`\`\`

- **Size everything inside the card relative to it:** \`cqw\`, \`cqh\`, \`cqmin\`, \`%\`, \`em\` or \`fr\`. No \`px\`, \`mm\` or \`pt\` sizes except hairline borders (2px or less) and the \`max(…)\` minimums below. Preflight renders the poster at a second size and flags anything that didn't scale. Never use viewport units (\`vw\`, \`vh\`).
- **Lay out for three bands:** the default (portrait, about 1:1.3 to 1:1.6, which covers every print poster and Instagram 4:5), wide (\`aspect-ratio > 1.2\`) and tall (\`aspect-ratio < 0.6\`). Prefer grid/flex flow over absolute positions so blocks can't collide when the shape changes.
- **What to drop on small or extreme shapes:** mark secondary elements \`data-od-priority="2"\` (supporting details) or \`"3"\` (decoration) and hide them with \`display: none\` inside the wide or tall rule when space is tight. Never hide the headline, date/time/place, call to action, QR code or logo.
- **Photos:** \`object-fit: cover\` with an \`object-position\` on the part that matters (e.g. a face at \`50% 25%\`), so wide and tall crops keep it.
- ${typeRule}
${print ? '- **Bleed:** build at the trim size. Backgrounds fill the whole card; export grows the card by the bleed and moves `.od-safe` in by the same amount.\n- Raster images need at least 150 ppi at their printed size; prefer SVG and CSS for graphics.\n' : ''}
${SHARED_CANVAS_RULES}`;
}

/**
 * The `metadata` registration writes. Re-registering an artifact (after an edit,
 * say) keeps what its manifest already recorded (the default shape, export and
 * share records, remix origin), then sets the canvas `format` when one is given
 * and `fluid` from the HTML as it is now. Undefined when there is nothing to record.
 */
export async function posterRegistrationMetadata(workspaceRoot: string, entryPath: string, format: string | undefined): Promise<Record<string, unknown> | undefined> {
  const abs = path.resolve(workspaceRoot, entryPath);
  let html = '';
  try {
    html = await fs.readFile(abs, 'utf8');
  } catch {
    // A missing entry is reported by the manifest writer itself.
  }
  let previous: Record<string, unknown> = {};
  try {
    const manifest = JSON.parse(await fs.readFile(`${abs}.artifact.json`, 'utf8'));
    if (manifest?.metadata && typeof manifest.metadata === 'object' && !Array.isArray(manifest.metadata)) previous = manifest.metadata;
  } catch {
    // First registration, or an unreadable sidecar: nothing to keep.
  }
  const metadata: Record<string, unknown> = { ...previous };
  if (format) metadata.format = format;
  if (isFluidHtml(html)) metadata.fluid = true;
  else delete metadata.fluid;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
