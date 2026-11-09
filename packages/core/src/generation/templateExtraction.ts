// A PowerPoint template (.pptx, .potx) as a design system source (openspec
// add-brand-from-screenshot-or-css): the theme's colour scheme and fonts, the
// slide master's text sizes and background, and the images placed on the
// master as marks. Theme XML names each colour's job, so its values are
// `declared`. No browser, no network: the file is unzipped in memory.

import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import * as path from 'node:path';
import { mapTypeScale } from './evidenceToTokens';
import { emptyDraft, fontStackFrom, type SourceDraft } from './sourceExtraction';

export const TEMPLATE_MAX_BYTES = 20 * 1024 * 1024;

/** Theme slot → contract token. */
const SLOT_TOKENS: Array<[string, string]> = [
  ['lt1', '--bg'],
  ['dk1', '--fg'],
  ['lt2', '--surface'],
  ['dk2', '--fg-2'],
  ['accent1', '--accent'],
];

/** Accent 1 values of the stock Office themes (2007, 2013, 2023), upper case. */
const STOCK_ACCENTS = new Set(['4F81BD', '5B9BD5', '4472C4', '156082', '0F9ED5', 'E97132']);
const STOCK_FONTS = new Set(['calibri', 'calibri light', 'aptos', 'aptos display', 'cambria']);

export interface ThemeRead {
  name: string;
  colors: Record<string, string>;
  majorFont?: string;
  minorFont?: string;
}

const attr = (xml: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(xml)?.[1];

/** Colour scheme and fonts from a theme XML; `sysClr` resolves to its `lastClr`. */
export function readTheme(xml: string): ThemeRead {
  const name = attr(/<a:theme\b[^>]*>/.exec(xml)?.[0] ?? '', 'name') ?? '';
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0] ?? '';
  const colors: Record<string, string> = {};
  for (const slot of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
    const block = new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`).exec(scheme)?.[1] ?? '';
    const srgb = /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(block)?.[1];
    const sys = /<a:sysClr\b[^>]*>/.exec(block)?.[0];
    const value = srgb ?? (sys ? attr(sys, 'lastClr') : undefined) ?? (sys && attr(sys, 'val') === 'window' ? 'FFFFFF' : sys && attr(sys, 'val') === 'windowText' ? '000000' : undefined);
    if (value) colors[slot] = value.toUpperCase();
  }
  const font = (kind: 'major' | 'minor') => {
    const block = new RegExp(`<a:${kind}Font>([\\s\\S]*?)</a:${kind}Font>`).exec(xml)?.[1] ?? '';
    const face = attr(/<a:latin\b[^>]*>/.exec(block)?.[0] ?? '', 'typeface');
    return face && !face.startsWith('+') ? face : undefined;
  };
  return { name, colors, majorFont: font('major'), minorFont: font('minor') };
}

/** True for a theme nobody branded: an Office theme name with Office's own fonts and accent. */
export function isStockOfficeTheme(theme: ThemeRead): boolean {
  const officeName = /^office( theme)?( 20\d\d(-20\d\d)?)?$/i.test(theme.name.trim()) || theme.name.trim() === '';
  const fonts = [theme.majorFont, theme.minorFont].filter(Boolean).map((f) => f!.toLowerCase());
  const stockFonts = fonts.length > 0 && fonts.every((f) => STOCK_FONTS.has(f));
  return officeName && stockFonts && STOCK_ACCENTS.has(theme.colors.accent1 ?? '');
}

/** Font sizes (pt) from a master's title and body styles, level 1 and 2. */
function masterSizes(masterXml: string): { title?: number; body?: number; body2?: number } {
  const size = (block: string | undefined, lvl: number) => {
    const l = block ? new RegExp(`<a:lvl${lvl}pPr\\b[\\s\\S]*?</a:lvl${lvl}pPr>`).exec(block)?.[0] : undefined;
    const sz = l ? /<a:defRPr\b[^>]*\bsz="(\d+)"/.exec(l)?.[1] : undefined;
    return sz ? Number(sz) / 100 : undefined;
  };
  const title = /<p:titleStyle>[\s\S]*?<\/p:titleStyle>/.exec(masterXml)?.[0];
  const body = /<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/.exec(masterXml)?.[0];
  return { title: size(title, 1), body: size(body, 1), body2: size(body, 2) };
}

const relTargets = (relsXml: string, type: RegExp): string[] =>
  [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).filter((r) => type.test(attr(r, 'Type') ?? '')).map((r) => attr(r, 'Target') ?? '').filter(Boolean);

/** Resolves a relationship target against the part it belongs to (`ppt/slideMasters/…`). */
const resolvePart = (partDir: string, target: string): string => path.posix.normalize(path.posix.join(partDir, target)).replace(/^\/+/, '');

/** Characters set per font on the slides, the largest size each was set at, and its char-weighted sizes. */
interface SlideFontUse {
  chars: number;
  maxSize: number;
  sizes: Array<{ size: number; chars: number }>;
}

/** What the slides themselves set: fonts by characters, text colours by characters, per run. */
export interface SlideTextUse {
  fonts: Map<string, SlideFontUse>;
  colors: Map<string, number>;
  chars: number;
}

const decodeXml = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Reads every text run on the slides: font (`a:latin`), size (`sz`, hundredths of a point) and solid colour. */
export function readSlideText(slideXmls: string[]): SlideTextUse {
  const fonts = new Map<string, SlideFontUse>();
  const colors = new Map<string, number>();
  let total = 0;
  for (const xml of slideXmls) {
    for (const run of xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const body = run[1];
      const text = decodeXml([...body.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('')).trim();
      if (!text) continue;
      const chars = text.length;
      total += chars;
      const rPr = /<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/.exec(body)?.[0] ?? '';
      const face = attr(/<a:latin\b[^>]*>/.exec(rPr)?.[0] ?? '', 'typeface');
      const sz = Number(attr(/<a:rPr\b[^>]*>/.exec(rPr)?.[0] ?? '', 'sz') ?? '');
      const size = Number.isFinite(sz) && sz > 0 ? sz / 100 : undefined;
      if (face && !face.startsWith('+')) {
        const use = fonts.get(face) ?? { chars: 0, maxSize: 0, sizes: [] };
        use.chars += chars;
        if (size) {
          use.maxSize = Math.max(use.maxSize, size);
          use.sizes.push({ size, chars });
        }
        fonts.set(face, use);
      }
      const color = /<a:solidFill>\s*<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(rPr)?.[1];
      if (color) colors.set(`#${color.toLowerCase()}`, (colors.get(`#${color.toLowerCase()}`) ?? 0) + chars);
    }
  }
  return { fonts, colors, chars: total };
}

/** The char-weighted median size of a font's runs. */
function medianSize(use: SlideFontUse): number | undefined {
  const sorted = [...use.sizes].sort((a, b) => a.size - b.size);
  const half = sorted.reduce((n, s) => n + s.chars, 0) / 2;
  let seen = 0;
  for (const s of sorted) {
    seen += s.chars;
    if (seen >= half) return s.size;
  }
  return undefined;
}

/**
 * Body = the font with the most characters; display = the font with the most
 * characters set at 1.5× the body's median size or larger (the body font when
 * no other is).
 */
export function slideFonts(use: SlideTextUse): { body?: string; display?: string; bodyChars?: number; displayChars?: number } {
  const ranked = [...use.fonts.entries()].sort((a, b) => b[1].chars - a[1].chars);
  if (ranked.length === 0) return {};
  const [body, bodyUse] = ranked[0];
  const bodySize = medianSize(bodyUse);
  let display = body;
  let displayChars = 0;
  if (bodySize) {
    for (const [face, u] of use.fonts) {
      const big = u.sizes.filter((s) => s.size >= bodySize * 1.5).reduce((n, s) => n + s.chars, 0);
      if (big > displayChars) {
        display = face;
        displayChars = big;
      }
    }
  }
  return { body, display, bodyChars: bodyUse.chars, displayChars };
}

export interface ReadTemplateOptions {
  /**
   * The file is a Canva export (openspec add-design-system-from-canva): Canva
   * writes fonts and colours on each text run and often keeps a stock Office
   * theme, so fonts come from the slides, a stock theme's colours become
   * candidates, and an image on most pages is kept as a mark.
   */
  canva?: boolean;
}

export interface TemplateReadResult {
  draft: SourceDraft;
  /** Accents 1–6, for charts. */
  chartPalette: string[];
  /** Master images to save as marks: bundle-relative name → bytes. */
  images: Array<{ name: string; data: Buffer }>;
  /** Other masters' themes that differ from the first. */
  conflicts: Array<{ token: string; value: string; master: string }>;
}

/** Reads a .pptx or .potx. Throws for a legacy .ppt or a file that isn't a presentation. */
export async function readPowerPointTemplate(fileName: string, data: Buffer, options: ReadTemplateOptions = {}): Promise<TemplateReadResult> {
  if (/\.(ppt|pot|pps)$/i.test(fileName)) throw new Error(`${fileName} is a legacy binary PowerPoint file. Open it in PowerPoint (or Keynote, LibreOffice) and save it as .pptx or .potx, then try again.`);
  if (data.length > TEMPLATE_MAX_BYTES) throw new Error(`${fileName} is larger than 20 MB.`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error(`${fileName} isn't a PowerPoint file this can read (.pptx or .potx).`);
  }
  const read = async (p: string) => (await zip.file(p)?.async('string')) ?? undefined;
  const presentation = await read('ppt/presentation.xml');
  if (!presentation) throw new Error(`${fileName} has no ppt/presentation.xml, so it isn't a PowerPoint presentation or template.`);
  const draft = emptyDraft(path.basename(fileName), 'declared');
  const presRels = (await read('ppt/_rels/presentation.xml.rels')) ?? '';
  const masters = relTargets(presRels, /slideMaster$/).map((t) => resolvePart('ppt', t));
  if (masters.length === 0) masters.push('ppt/slideMasters/slideMaster1.xml');

  const conflicts: TemplateReadResult['conflicts'] = [];
  const images: TemplateReadResult['images'] = [];
  let chartPalette: string[] = [];
  let first = true;
  for (const master of masters) {
    const masterXml = await read(master);
    if (!masterXml) continue;
    const masterDir = path.posix.dirname(master);
    const rels = (await read(path.posix.join(masterDir, '_rels', `${path.posix.basename(master)}.rels`))) ?? '';
    const themePath = relTargets(rels, /theme$/).map((t) => resolvePart(masterDir, t))[0];
    const themeXml = themePath ? await read(themePath) : undefined;
    const masterName = attr(/<p:cSld\b[^>]*>/.exec(masterXml)?.[0] ?? '', 'name') || path.posix.basename(master, '.xml');
    if (!themeXml) continue;
    const theme = readTheme(themeXml);
    const values: Record<string, string> = {};
    for (const [slot, token] of SLOT_TOKENS) if (theme.colors[slot]) values[token] = `#${theme.colors[slot].toLowerCase()}`;
    // A master with its own solid background overrides light 1.
    const bg = /<p:bg>[\s\S]*?<\/p:bg>/.exec(masterXml)?.[0];
    const bgHex = bg ? /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(bg)?.[1] : undefined;
    if (bgHex) values['--bg'] = `#${bgHex.toLowerCase()}`;
    if (theme.majorFont) values['--font-display'] = fontStackFrom(theme.majorFont);
    if (theme.minorFont) values['--font-body'] = fontStackFrom(theme.minorFont);

    if (first) {
      first = false;
      if (isStockOfficeTheme(theme)) {
        if (options.canva) {
          for (const slot of ['lt1', 'dk1', 'accent1', 'accent2']) if (theme.colors[slot]) draft.candidates.push({ value: `#${theme.colors[slot].toLowerCase()}`, label: `stock theme ${slot}` });
          draft.notes.push(`${draft.source} carries the stock Office theme ("${theme.name || 'Office'}"), as Canva exports often do: its colours are candidates only, so the page images decide the colour roles, and fonts come from the text on the slides.`);
        } else {
          draft.notes.push(`${draft.source} uses the stock Office theme ("${theme.name || 'Office'}", ${theme.majorFont ?? 'default'} fonts): it has no brand theme, so no colour or font tokens were drafted from it.`);
        }
        break;
      }
      const where = (slot: string) => `theme "${theme.name}" ${slot}`;
      for (const [slot, token] of SLOT_TOKENS) if (values[token]) draft.tokens[token] = { value: values[token], where: token === '--bg' && bgHex ? `master "${masterName}" background` : where(slot) };
      if (values['--font-display']) draft.tokens['--font-display'] = { value: values['--font-display'], where: `theme "${theme.name}" heading font` };
      if (values['--font-body']) draft.tokens['--font-body'] = { value: values['--font-body'], where: `theme "${theme.name}" body font` };
      chartPalette = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((s) => theme.colors[s]).filter(Boolean).map((h) => `#${h.toLowerCase()}`);
      for (const slot of ['accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink']) if (theme.colors[slot]) draft.candidates.push({ value: `#${theme.colors[slot].toLowerCase()}`, label: `theme ${slot}` });
      // Master text sizes on the type scale, body anchored as --text-base (16px).
      const sizes = masterSizes(masterXml);
      if (sizes.body) {
        const scale = 16 / sizes.body;
        const scaled = [sizes.title, sizes.body, sizes.body2].filter((n): n is number => typeof n === 'number').map((n) => Math.round(n * scale));
        for (const [k, v] of Object.entries(mapTypeScale(16, scaled))) draft.tokens[k] = { value: v, where: `master "${masterName}" text sizes (${[sizes.title, sizes.body, sizes.body2].filter(Boolean).join('/')} pt, body as 16px)` };
      }
      // Images on the master (logos, footer marks).
      for (const target of relTargets(rels, /image$/)) {
        const part = resolvePart(masterDir, target);
        const buf = await zip.file(part)?.async('nodebuffer');
        if (buf && buf.length <= 5_000_000) images.push({ name: `template-${path.posix.basename(part)}`, data: buf });
      }
      const slideSize = /<p:sldSz\b[^>]*>/.exec(presentation)?.[0];
      if (slideSize) {
        const cx = Number(attr(slideSize, 'cx'));
        const cy = Number(attr(slideSize, 'cy'));
        if (cx && cy) draft.notes.push(`Slides are ${Math.round((cx / 914400) * 100) / 100} × ${Math.round((cy / 914400) * 100) / 100} in (${(cx / cy).toFixed(2)}:1).`);
      }
      if (chartPalette.length) draft.notes.push(`Chart palette (theme accents 1–6): ${chartPalette.join(', ')}.`);
    } else {
      for (const [token, value] of Object.entries(values)) {
        if (draft.tokens[token] && draft.tokens[token].value !== value) conflicts.push({ token, value, master: masterName });
      }
    }
  }
  if (masters.length > 1 && conflicts.length > 0) draft.notes.push(`The template has ${masters.length} masters; the first is drafted and the others' differing values are listed under conflicts.`);
  if (options.canva) await readCanvaSlides(zip, presRels, draft, images);
  return { draft, chartPalette, images, conflicts };
}

/** Canva mode: fonts and text colours from the slides' runs, and images repeated on most pages as marks. */
async function readCanvaSlides(zip: JSZip, presRels: string, draft: SourceDraft, images: TemplateReadResult['images']): Promise<void> {
  const slidePaths = relTargets(presRels, /\/slide$/).map((t) => resolvePart('ppt', t));
  const slides: Array<{ path: string; xml: string }> = [];
  for (const p of slidePaths) {
    const xml = await zip.file(p)?.async('string');
    if (xml) slides.push({ path: p, xml });
  }
  if (slides.length === 0) return;

  const use = readSlideText(slides.map((s) => s.xml));
  const fonts = slideFonts(use);
  if (fonts.body) {
    const theme = draft.tokens['--font-body']?.value;
    draft.tokens['--font-body'] = { value: fontStackFrom(fonts.body), where: `text on the slides (${fonts.bodyChars} characters)` };
    if (theme && theme !== draft.tokens['--font-body'].value) draft.notes.push(`The theme's body font (${theme}) differs from the font the slides use, which was taken.`);
  }
  if (fonts.display) {
    const theme = draft.tokens['--font-display']?.value;
    draft.tokens['--font-display'] = { value: fontStackFrom(fonts.display), where: fonts.displayChars ? `large text on the slides (${fonts.displayChars} characters)` : 'text on the slides (no larger font set)' };
    if (theme && theme !== draft.tokens['--font-display'].value) draft.notes.push(`The theme's heading font (${theme}) differs from the font the slides' large text uses, which was taken.`);
  }
  if (!fonts.body && use.chars > 0) draft.notes.push('The slides set no font on their text runs, so no font was drafted from them.');
  if (use.chars === 0) draft.notes.push('The slides have no editable text (Canva may have exported it as images), so fonts need confirming.');
  const colours = [...use.colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  for (const [value, chars] of colours) draft.candidates.push({ value, label: `text colour on the slides (${chars} characters)` });

  // Images placed on most pages (logo, footer mark), by content, not by part name.
  if (slides.length < 2) return;
  const known = new Set(images.map((i) => createHash('sha1').update(i.data).digest('hex')));
  const seen = new Map<string, { name: string; data: Buffer; slides: Set<number> }>();
  for (const [index, slide] of slides.entries()) {
    const dir = path.posix.dirname(slide.path);
    const rels = (await zip.file(path.posix.join(dir, '_rels', `${path.posix.basename(slide.path)}.rels`))?.async('string')) ?? '';
    for (const target of relTargets(rels, /image$/)) {
      const part = resolvePart(dir, target);
      const buf = await zip.file(part)?.async('nodebuffer');
      if (!buf || buf.length > 5_000_000) continue;
      const hash = createHash('sha1').update(buf).digest('hex');
      if (known.has(hash)) continue;
      const entry = seen.get(hash) ?? { name: `template-repeated-${path.posix.basename(part)}`, data: buf, slides: new Set<number>() };
      entry.slides.add(index);
      seen.set(hash, entry);
    }
  }
  const threshold = Math.max(2, Math.ceil(slides.length * 0.6));
  const repeated = [...seen.values()].filter((e) => e.slides.size >= threshold).slice(0, 4);
  for (const e of repeated) images.push({ name: e.name, data: e.data });
  if (repeated.length) draft.notes.push(`${repeated.length} image(s) appear on ${threshold} or more of the ${slides.length} pages (likely a logo or footer mark) and were kept as marks.`);
}
