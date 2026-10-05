// Named canvas formats (openspec poster-format-pipeline, "poster-formats"):
// the one table brief preparation, export presets, adaptation and the
// workflow prompts all read, so a size is never hand-copied between them.
// Screen formats are CSS pixels; print formats are trim sizes in mm, with
// bleed added around them (authored into the card, see composeCanvasSection).

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
export function composeCanvasSection(format: CanvasFormat): string {
  const shared = `Every \`[data-od-field="<column>"]\` element marks text (or an \`img\` \`src\` / \`a\` \`href\`) that can be filled per row from a spreadsheet at export time, so give such fields room for longer values (\`text-wrap: balance\`, no fixed one-line widths). Put any QR code in as inline SVG carrying \`data-od-qr="<the encoded text>"\` (make one with create_open_design_qr_code; never draw a fake one) or mark its slot \`data-od-qr-field="<column>"\` for a per-row code. Before exporting, run export_open_design_artifact with \`checkOnly: true\` and fix every preflight error it reports.`;
  if (format.medium === 'screen') {
    const cards = format.multiCard
      ? 'For several cards, stack them vertically in the one HTML file, each its own `[data-od-card]` element at exactly this size.'
      : 'The design is **one** `[data-od-card]` element at exactly this size.';
    return `## Canvas — ${format.label} (\`${format.id}\`)\n\n- Size: **${format.width}×${format.height} px**. ${cards} Give the card \`overflow: hidden\` and a fixed \`width\`/\`height\` in px.\n- Safe area: keep all text, logos and key subjects at least **${format.safeInset}px** inside the card's edges. Backgrounds can run to the edge.\n- Make the hook readable at thumbnail size.\n\n${shared}`;
  }
  const box = bleedBox(format);
  return `## Canvas — ${format.label} print (\`${format.id}\`)\n\nThis is a **print** piece. A print shop trims it to ${fmt(format.width)}×${fmt(format.height)} mm, and needs artwork that runs ${fmt(box.bleed)} mm past every trim edge (bleed) so no white slivers show after cutting.\n\n- The design is **one** \`[data-od-card]\` element sized **${fmt(box.width)}mm × ${fmt(box.height)}mm** (the trim size plus ${fmt(box.bleed)} mm bleed on every side), with \`overflow: hidden\`, \`position: relative\` and \`box-sizing: border-box\`. Use \`mm\` (or \`px\`) for the card; **never** viewport units (\`vw\`, \`vh\`, \`vmin\`), which change between the preview and the printer.\n- Page setup: \`body { margin: 0 }\`, and nothing else on the page outside the card.\n- Full-bleed backgrounds, photos and color fields fill the whole card, out to its edges.\n- Text, logos, QR codes and anything that must not be cut sit at least **${fmt(box.bleed + format.safeInset)} mm** inside the card's edges (bleed ${fmt(box.bleed)} mm plus a ${fmt(format.safeInset)} mm safe margin).\n- Minimum type size: **${format.minTypePt} pt** for any text meant to be read (1 pt = 1/72 in; \`font-size: ${format.minTypePt}pt\` works directly). Headlines should be several times larger: a poster is read from a distance.\n- Raster images need at least 150 ppi at their printed size (an image printed 100 mm wide needs at least 591 px). Prefer SVG and CSS for graphics.\n- Colors print from RGB; very saturated screen colors (neon greens, electric blues) come out duller on paper.\n\n${shared}`;
}
