// Adapted from open-design `apps/daemon/src/document-preview.ts` (Apache-2.0).
// See ./SOURCE.md ("Document extraction") for the commit and every
// extension: upstream builds a flat text preview; this turns a document into
// structured Markdown (headings, lists, tables, slide order, notes) plus its
// embedded images, as source material for a deck.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';

const execFileP = promisify(execFile);

// Upstream's limits were sized for a preview (10 MB in, 50 MB out). Real
// decks and reports carry images, so the input and total limits are raised;
// the per-XML-entry limit (what the regexes actually scan) is upstream's.
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_XML_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SHEET_ROWS = 200;
const PDF_TIMEOUT_MS = 20_000;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

export type SourceKind = 'docx' | 'pptx' | 'xlsx' | 'pdf' | 'markdown' | 'text' | 'csv';

export const SUPPORTED_SOURCE_EXTENSIONS: Record<string, SourceKind> = {
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.xlsx': 'xlsx',
  '.pdf': 'pdf',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  '.csv': 'csv',
};

const LEGACY_EXTENSIONS: Record<string, string> = { '.doc': '.docx', '.ppt': '.pptx', '.xls': '.xlsx' };

export interface ExtractedAsset {
  name: string;
  data: Buffer;
}

export interface ExtractResult {
  kind: SourceKind;
  markdown: string;
  assets: ExtractedAsset[];
  warnings: string[];
  /** Set for a PDF whose text couldn't be extracted here: what the agent should do instead. */
  pdfNote?: string;
}

export class DocumentExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentExtractError';
  }
}

type ZipEntryWithSize = JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
type XmlAttrs = Record<string, string>;

/** The source kind for a file name, or an error message for legacy and unknown formats. */
export function sourceKindFor(fileName: string): { kind: SourceKind } | { error: string } {
  const ext = path.extname(fileName).toLowerCase();
  const kind = SUPPORTED_SOURCE_EXTENSIONS[ext];
  if (kind) return { kind };
  if (LEGACY_EXTENSIONS[ext]) {
    return { error: `${ext} is an old binary Office format. Save it as ${LEGACY_EXTENSIONS[ext]} and read that instead.` };
  }
  return { error: `Unsupported source type "${ext || fileName}". Supported: ${Object.keys(SUPPORTED_SOURCE_EXTENSIONS).join(', ')}.` };
}

export async function extractDocument(fileName: string, buffer: Buffer): Promise<ExtractResult> {
  const resolved = sourceKindFor(fileName);
  if ('error' in resolved) throw new DocumentExtractError(resolved.error);
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new DocumentExtractError(`${path.basename(fileName)} is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`);
  }
  const { kind } = resolved;
  if (kind === 'markdown' || kind === 'text' || kind === 'csv') {
    return { kind, markdown: buffer.toString('utf8').replace(/\r\n/g, '\n'), assets: [], warnings: [] };
  }
  if (kind === 'pdf') return extractPdf(buffer);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentExtractError(`${path.basename(fileName)} isn't a valid ${kind.toUpperCase()} file (it couldn't be opened as a zip archive).`);
  }
  assertZipSize(zip);
  const warnings: string[] = [];
  const markdown = kind === 'docx' ? await extractDocx(zip, warnings) : kind === 'pptx' ? await extractPptx(zip, warnings) : await extractXlsx(zip, warnings);
  const mediaDir = kind === 'docx' ? 'word/media/' : kind === 'pptx' ? 'ppt/media/' : 'xl/media/';
  const assets = await extractMedia(zip, mediaDir, warnings);
  return { kind, markdown, assets, warnings };
}

// ---------- PDF ----------

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'od-source-'));
  const tmpFile = path.join(tmpDir, 'input.pdf');
  await writeFile(tmpFile, buffer, { flag: 'wx' });
  try {
    const { stdout } = await execFileP('pdftotext', ['-layout', tmpFile, '-'], { timeout: PDF_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
    // pdftotext separates pages with a form feed; one section per page gives the agent an outline to navigate.
    const pages = stdout.split('\f').map((p) =>
      p
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
    while (pages.length > 0 && pages[pages.length - 1] === '') pages.pop();
    if (pages.every((p) => p === '')) {
      return {
        kind: 'pdf',
        markdown: '',
        assets: [],
        warnings: ['The PDF has no extractable text (it may be scanned images).'],
        pdfNote: 'No text could be extracted. If you can read PDFs yourself, read the original file; otherwise ask the user for a text version.',
      };
    }
    return { kind: 'pdf', markdown: pages.map((p, i) => `## Page ${i + 1}\n\n${p}`).join('\n\n'), assets: [], warnings: [] };
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException)?.code === 'ENOENT';
    return {
      kind: 'pdf',
      markdown: '',
      assets: [],
      warnings: [missing ? 'pdftotext (poppler) is not installed, so PDF text was not extracted here.' : `pdftotext failed: ${err instanceof Error ? err.message : String(err)}`],
      pdfNote:
        'Read the original PDF with your own file-reading tools if you can (Claude Code can). Otherwise ask the user to install poppler (for `pdftotext`) or to provide a DOCX or text version.',
    };
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- DOCX ----------

interface DocxStyle {
  name: string;
  basedOn?: string;
  outlineLevel?: number;
  numbered: boolean;
}

/** Paragraph styles from `word/styles.xml`. Real documents often use custom heading and bullet styles ("VCAA Heading 2"), recognisable only here. */
async function docxStyles(zip: JSZip): Promise<Map<string, DocxStyle>> {
  const xml = await readZipText(zip, 'word/styles.xml').catch(() => '');
  const styles = new Map<string, DocxStyle>();
  for (const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = parseAttrs(m[1] ?? '')['w:styleId'];
    if (!id) continue;
    const body = m[2] ?? '';
    const outline = extractFirst(body, /<w:outlineLvl\s+w:val="(\d)"/);
    styles.set(id, {
      name: extractFirst(body, /<w:name\s+w:val="([^"]+)"/),
      basedOn: extractFirst(body, /<w:basedOn\s+w:val="([^"]+)"/) || undefined,
      outlineLevel: outline === '' ? undefined : Number(outline),
      numbered: /<w:numPr\b/.test(body),
    });
  }
  return styles;
}

/** Walks a style and its `basedOn` ancestors (cycle-safe), returning the first defined value. */
function inheritedStyle<T>(styles: Map<string, DocxStyle>, id: string, pick: (s: DocxStyle) => T | undefined): T | undefined {
  const seen = new Set<string>();
  for (let cur: string | undefined = id; cur && !seen.has(cur); cur = styles.get(cur)?.basedOn) {
    seen.add(cur);
    const style = styles.get(cur);
    if (!style) return undefined;
    const value = pick(style);
    if (value !== undefined) return value;
  }
  return undefined;
}

async function extractDocx(zip: JSZip, warnings: string[]): Promise<string> {
  const xml = await readZipText(zip, 'word/document.xml');
  const styles = await docxStyles(zip);
  const blocks: string[] = [];
  // Top-level blocks in document order. Tables are matched first so their inner paragraphs aren't also emitted.
  for (const m of xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    const block = m[0];
    if (block.startsWith('<w:tbl')) {
      const rows = Array.from(block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)).map((r) =>
        Array.from(r[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map((c) =>
          Array.from(c[0].matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g))
            .map((p) => docxParagraphText(p[0]))
            .filter(Boolean)
            .join(' '),
        ),
      );
      const table = markdownTable(rows);
      if (table) blocks.push(table);
      continue;
    }
    const text = docxParagraphText(block);
    if (!text) continue;
    const styleId = extractFirst(block, /<w:pStyle\s+w:val="([^"]+)"/);
    // A table of contents repeats the headings that follow; skip it.
    if (/^toc\s*\d|^table of contents/i.test(styles.get(styleId)?.name || styleId)) continue;
    const level = docxHeadingLevel(block, styleId, styles);
    if (level) blocks.push(`${'#'.repeat(level)} ${text}`);
    else if (/<w:numPr\b/.test(block) || inheritedStyle(styles, styleId, (s) => (s.numbered ? true : undefined))) blocks.push(`- ${text}`);
    else blocks.push(text);
  }
  if (/<w:txbxContent\b/.test(xml)) warnings.push('The document has text boxes; text inside them may appear out of order.');
  if (Object.keys(zip.files).some((n) => /^word\/charts\//.test(n))) {
    warnings.push('The document has charts; their data was not extracted (only their images, if any). Ask the user for the numbers if they matter.');
  }
  return joinBlocks(blocks);
}

/** Paragraph text from its runs. Runs split words mid-way, so they are concatenated as-is (upstream trimmed and space-joined them). */
function docxParagraphText(xml: string): string {
  const parts: string[] = [];
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
    if (m[1] !== undefined) parts.push(decodeXml(m[1]));
    else parts.push(m[0].startsWith('<w:tab') ? ' ' : '\n');
  }
  return parts.join('').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Heading level from, in order: the paragraph's own outline level; the style's
 * name or id ("Title", "Heading 2", "VCAA Heading 2"); the style's (or an
 * ancestor's) outline level, which localised styles ("Überschrift 1") carry.
 */
function docxHeadingLevel(xml: string, styleId: string, styles: Map<string, DocxStyle>): number | undefined {
  const direct = extractFirst(xml, /<w:outlineLvl\s+w:val="(\d)"/);
  if (direct !== '' && Number(direct) <= 5) return Number(direct) + 1;
  if (!styleId) return undefined;
  const name = styles.get(styleId)?.name || styleId;
  if (/^title$/i.test(name) || /^title$/i.test(styleId)) return 1;
  const named = name.match(/\bheading\s*([1-6])\b/i) ?? styleId.match(/heading\s*([1-6])$/i);
  if (named) return Number(named[1]);
  const outline = inheritedStyle(styles, styleId, (s) => s.outlineLevel);
  if (outline !== undefined && outline <= 5) return outline + 1;
  return undefined;
}

// ---------- PPTX ----------

async function extractPptx(zip: JSZip, warnings: string[]): Promise<string> {
  const slidePaths = await pptxSlideOrder(zip);
  if (slidePaths.length === 0) {
    warnings.push('No slides were found.');
    return '';
  }
  const sections: string[] = [];
  for (const [i, slidePath] of slidePaths.entries()) {
    const xml = await readZipText(zip, slidePath).catch(() => '');
    let title = '';
    const shapes: string[][] = [];
    for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
      const placeholder = extractFirst(sp[0], /<p:ph\b[^>]*\btype="([^"]+)"/);
      const paragraphs = drawingParagraphs(sp[0]);
      if (paragraphs.length === 0) continue;
      if (!title && (placeholder === 'title' || placeholder === 'ctrTitle')) title = paragraphs.join(' ');
      else if (placeholder !== 'sldNum' && placeholder !== 'dt' && placeholder !== 'ftr') shapes.push(paragraphs);
    }
    // Decks built from plain text boxes have no title placeholder: take the first box's first line when it is short enough to be one.
    if (!title && shapes.length > 0 && shapes[0][0].length <= 100) title = shapes[0].shift()!;
    const body: string[] = shapes.flat().map((p) => `- ${p}`);
    for (const tbl of xml.matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/g)) {
      const rows = Array.from(tbl[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)).map((r) =>
        Array.from(r[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)).map((c) => drawingParagraphs(c[0]).join(' ')),
      );
      const table = markdownTable(rows);
      if (table) body.push(table);
    }
    if (/<c:chart\b/.test(xml)) body.push('_(chart: data not extracted)_');
    const notes = await pptxNotes(zip, slidePath);
    const parts = [`## Slide ${i + 1}${title ? `: ${title}` : ''}`];
    if (body.length > 0) parts.push(joinBlocks(body));
    if (notes) parts.push(notes.split('\n').map((l) => `> ${l}`).join('\n').replace(/^> /, '> Notes: '));
    sections.push(parts.join('\n\n'));
  }
  return sections.join('\n\n');
}

/** Slide parts in presentation order (`p:sldIdLst` through the relationships), falling back to numeric file order. */
async function pptxSlideOrder(zip: JSZip): Promise<string[]> {
  const presentation = await readZipText(zip, 'ppt/presentation.xml').catch(() => '');
  const rels = relationships(await readZipText(zip, 'ppt/_rels/presentation.xml.rels').catch(() => ''));
  const ordered: string[] = [];
  for (const m of presentation.matchAll(/<p:sldId\b([^>]*)\/?>/g)) {
    const target = rels.get(parseAttrs(m[1] ?? '')['r:id'] ?? '');
    if (!target) continue;
    const resolved = path.posix.normalize(path.posix.join('ppt', target.replace(/^\/?ppt\//, '')));
    if (zip.file(resolved)) ordered.push(resolved);
  }
  if (ordered.length > 0) return ordered;
  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(numericPathSort);
}

async function pptxNotes(zip: JSZip, slidePath: string): Promise<string> {
  const relsPath = path.posix.join(path.posix.dirname(slidePath), '_rels', `${path.posix.basename(slidePath)}.rels`);
  const relsXml = await readZipText(zip, relsPath).catch(() => '');
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(m[1] ?? '');
    if (!/\/notesSlide$/.test(attrs.Type ?? '') || !attrs.Target) continue;
    const notesPath = path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), attrs.Target));
    const xml = await readZipText(zip, notesPath).catch(() => '');
    const lines: string[] = [];
    for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
      if (extractFirst(sp[0], /<p:ph\b[^>]*\btype="([^"]+)"/) !== 'body') continue;
      lines.push(...drawingParagraphs(sp[0]));
    }
    return lines.join('\n');
  }
  return '';
}

/** DrawingML paragraphs (`a:p`), each its runs concatenated. */
function drawingParagraphs(xml: string): string[] {
  return Array.from(xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g))
    .map((p) =>
      Array.from(p[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g))
        .map((t) => (t[1] !== undefined ? decodeXml(t[1]) : ' '))
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

// ---------- XLSX ----------

async function extractXlsx(zip: JSZip, warnings: string[]): Promise<string> {
  const sharedStrings = await readSharedStrings(zip);
  const sheets = await readWorkbook(zip);
  const sections: string[] = [];
  for (const sheet of sheets) {
    const xml = await readZipText(zip, sheet.path).catch(() => '');
    const rows = worksheetRows(xml, sharedStrings);
    const kept = rows.slice(0, MAX_SHEET_ROWS);
    if (rows.length > MAX_SHEET_ROWS) {
      warnings.push(`Sheet "${sheet.name}": kept the first ${MAX_SHEET_ROWS} of ${rows.length} rows (${rows.length - MAX_SHEET_ROWS} left out).`);
    }
    sections.push(`## Sheet: ${sheet.name}\n\n${markdownTable(kept) || '_(no cell values)_'}`);
  }
  if (Object.keys(zip.files).some((n) => /^xl\/charts\//.test(n))) warnings.push('The workbook has charts; only their underlying cells were extracted.');
  return sections.join('\n\n');
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await readZipText(zip, 'xl/sharedStrings.xml').catch(() => '');
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((m) =>
    Array.from(m[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
      .map((t) => decodeXml(t[1] ?? ''))
      .join(''),
  );
}

async function readWorkbook(zip: JSZip): Promise<Array<{ name: string; path: string }>> {
  const workbookXml = await readZipText(zip, 'xl/workbook.xml').catch(() => '');
  const rels = relationships(await readZipText(zip, 'xl/_rels/workbook.xml.rels').catch(() => ''));
  const sheets: Array<{ name: string; path: string }> = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(sheet[1] ?? '');
    const target = attrs['r:id'] ? rels.get(attrs['r:id']) : undefined;
    if (!target) continue;
    sheets.push({ name: attrs.name || `Sheet ${sheets.length + 1}`, path: `xl/${target.replace(/^\/?xl\//, '')}` });
  }
  if (sheets.length > 0) return sheets;
  return Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(numericPathSort)
    .map((name, i) => ({ name: `Sheet ${i + 1}`, path: name }));
}

/** Rows as arrays positioned by each cell's column reference, so empty cells keep columns aligned (upstream dropped them). */
function worksheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
    const values: string[] = [];
    let next = 0;
    for (const cell of row[0].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = parseAttrs(cell[1] ?? '');
      const body = cell[2] ?? '';
      const col = attrs.r ? columnIndex(attrs.r) : next;
      next = col + 1;
      let value = '';
      if (attrs.t === 's') {
        const idx = Number(extractFirst(body, /<v>([\s\S]*?)<\/v>/));
        value = Number.isInteger(idx) ? (sharedStrings[idx] ?? '') : '';
      } else if (attrs.t === 'inlineStr') {
        value = Array.from(body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
          .map((t) => decodeXml(t[1] ?? ''))
          .join('');
      } else {
        value = decodeXml(extractFirst(body, /<v>([\s\S]*?)<\/v>/));
      }
      values[col] = value.trim();
    }
    if (values.some((v) => v)) rows.push(Array.from(values, (v) => v ?? ''));
  }
  return rows;
}

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ---------- Shared helpers ----------

async function extractMedia(zip: JSZip, dir: string, warnings: string[]): Promise<ExtractedAsset[]> {
  const assets: ExtractedAsset[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.startsWith(dir)) continue;
    const ext = path.posix.extname(name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const size = (entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0;
    if (size > MAX_IMAGE_BYTES) {
      warnings.push(`Skipped image ${path.posix.basename(name)}: larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
      continue;
    }
    assets.push({ name: path.posix.basename(name), data: await entry.async('nodebuffer') });
  }
  return assets.sort((a, b) => numericPathSort(a.name, b.name));
}

function relationships(xml: string): Map<string, string> {
  const rels = new Map<string, string>();
  for (const rel of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(rel[1] ?? '');
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target);
  }
  return rels;
}

function markdownTable(rows: string[][]): string {
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  if (nonEmpty.length === 0) return '';
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const cell = (s: string | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ')} |`;
  return [line(nonEmpty[0]), `|${' --- |'.repeat(width)}`, ...nonEmpty.slice(1).map(line)].join('\n');
}

function joinBlocks(blocks: string[]): string {
  // Keep consecutive list items together; separate everything else with a blank line.
  let out = '';
  for (const [i, b] of blocks.entries()) {
    if (i === 0) out = b;
    else out += b.startsWith('- ') && blocks[i - 1].startsWith('- ') ? `\n${b}` : `\n\n${b}`;
  }
  return out;
}

async function readZipText(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new DocumentExtractError(`missing ${name}`);
  const size = (entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0;
  if (size > MAX_XML_ENTRY_BYTES) throw new DocumentExtractError(`${name} is too large to extract.`);
  const xml = await entry.async('text');
  assertSafeXml(xml);
  return xml;
}

function parseAttrs(raw: string): XmlAttrs {
  const attrs: XmlAttrs = {};
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[m[1]] = decodeXml(m[2] ?? '');
  return attrs;
}

function extractFirst(raw: string, pattern: RegExp): string {
  const m = raw.match(pattern);
  return m ? (m[1] ?? '') : '';
}

function decodeXml(raw: unknown): string {
  return String(raw)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function assertZipSize(zip: JSZip): void {
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    total += (entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new DocumentExtractError('The document expands to more than 200 MB, so it was not extracted.');
  }
}

function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) throw new DocumentExtractError('The document contains XML entity declarations, which are not supported.');
}

function numericPathSort(a: string, b: string): number {
  const an = Number(a.match(/(\d+)(?=\.[a-z]+$)/i)?.[1] ?? 0);
  const bn = Number(b.match(/(\d+)(?=\.[a-z]+$)/i)?.[1] ?? 0);
  return an - bn || a.localeCompare(b);
}
