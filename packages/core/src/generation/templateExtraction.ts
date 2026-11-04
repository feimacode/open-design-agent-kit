// A PowerPoint template (.pptx, .potx) as a design system source (openspec
// add-brand-from-screenshot-or-css): the theme's colour scheme and fonts, the
// slide master's text sizes and background, and the images placed on the
// master as marks. Theme XML names each colour's job, so its values are
// `declared`. No browser, no network: the file is unzipped in memory.

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
export async function readPowerPointTemplate(fileName: string, data: Buffer): Promise<TemplateReadResult> {
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
        draft.notes.push(`${draft.source} uses the stock Office theme ("${theme.name || 'Office'}", ${theme.majorFont ?? 'default'} fonts): it has no brand theme, so no colour or font tokens were drafted from it.`);
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
  return { draft, chartPalette, images, conflicts };
}
