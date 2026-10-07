// The registration-time fact check for source-based designs (openspec
// add-deck-from-source, design decision 5): numbers shown on the page that
// appear in none of the sources. A prompt to verify, never an error —
// derived figures are legitimate when the notes say how they were derived.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { sourceKindFor } from '../vendored/documentExtract';
import { readSource, readSourceMarkdown, resolveSourcePath, sha256Of } from '../workspace/sourceStore';

const MAX_UNMATCHED = 50;
const SNIPPET_RADIUS = 40;

// A number not glued to letters or digits on its left ("Q3", "v2", "H100" are labels, not claims):
// optional currency, then either comma-grouped thousands or plain digits, with an optional decimal part,
// then an optional % or magnitude suffix not followed by more letters.
const NUMBER_PATTERN = /(?<![A-Za-z0-9.,])([$€£¥]\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s?%|(?:k|K|M|B|bn|x)(?![A-Za-z]))?/g;

export interface UnmatchedNumber {
  /** As written on the page, e.g. "$4.2M" or "42%". */
  number: string;
  /** Surrounding visible text. */
  context: string;
}

export interface NumberCheckResult {
  /** Distinct numbers checked (after the ignore rules). */
  checked: number;
  unmatched: UnmatchedNumber[];
  /** Unmatched numbers beyond the reported cap. */
  omitted: number;
}

/** Visible text of an HTML document: scripts, styles and comments removed, tags turned into spaces, common entities decoded. */
export function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** The value a number token stands for, for matching: grouping commas removed, "4.20" ≡ "4.2". */
function numericKey(core: string): string {
  return String(Number(core.replace(/,/g, '')));
}

function ignored(core: string): boolean {
  if (core.includes('.') || core.includes(',')) return false;
  const n = Number(core);
  return n <= 12 || (core.length === 4 && n >= 1900 && n <= 2100);
}

export function numberKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const m of text.matchAll(NUMBER_PATTERN)) keys.add(numericKey(m[2]));
  return keys;
}

/** Numbers in `pageText` (visible text) that appear in none of `sourceTexts`. */
export function checkSourceNumbers(pageText: string, sourceTexts: string[]): NumberCheckResult {
  const known = new Set<string>();
  for (const t of sourceTexts) for (const k of numberKeys(t)) known.add(k);
  const seen = new Set<string>();
  const unmatched: UnmatchedNumber[] = [];
  let omitted = 0;
  for (const m of pageText.matchAll(NUMBER_PATTERN)) {
    const core = m[2];
    if (ignored(core)) continue;
    const key = numericKey(core);
    if (seen.has(key)) continue;
    seen.add(key);
    if (known.has(key)) continue;
    if (unmatched.length >= MAX_UNMATCHED) {
      omitted++;
      continue;
    }
    const at = m.index ?? 0;
    const start = Math.max(0, at - SNIPPET_RADIUS);
    const end = Math.min(pageText.length, at + m[0].length + SNIPPET_RADIUS);
    unmatched.push({
      number: m[0].trim(),
      context: `${start > 0 ? '…' : ''}${pageText.slice(start, end).trim()}${end < pageText.length ? '…' : ''}`,
    });
  }
  return { checked: seen.size, unmatched, omitted };
}

export interface RecordedSource {
  path: string;
  sha256: string;
}

export interface SourceRegistration {
  /** For the manifest. */
  sources: RecordedSource[];
  /** Present for HTML entries. */
  numberCheck?: NumberCheckResult;
  warnings: string[];
}

const MAX_DOCUMENT_SOURCES = 10;
const MAX_FILE_SOURCES = 50;

/**
 * Everything registration needs for `sources`: each source's hash for the
 * manifest (extracting documents if they weren't read yet; other files are
 * only hashed) and, for an HTML entry, the
 * number check against the extracted text. Unreadable sources are reported
 * as warnings and left out; never throws.
 */
export async function prepareSourceRegistration(options: {
  workspaceRoot: string;
  outputDir: string;
  entryPath: string;
  sourcePaths: string[];
}): Promise<SourceRegistration> {
  const warnings: string[] = [];
  const sources: RecordedSource[] = [];
  const texts: string[] = [];
  // Documents are extracted (and feed the number check); any other workspace file, such as the code a
  // diagram was drawn from, is recorded by hash only, so drift can still be detected.
  let documents = 0;
  let files = 0;
  for (const sourcePath of options.sourcePaths) {
    if (!('error' in sourceKindFor(sourcePath))) {
      if (++documents > MAX_DOCUMENT_SOURCES) continue;
      const result = await readSource(options.workspaceRoot, options.outputDir, sourcePath);
      if (!result.ok) {
        warnings.push(`Source not recorded: ${result.error}`);
        continue;
      }
      sources.push({ path: result.record.path, sha256: result.record.sha256 });
      const text = await readSourceMarkdown(options.workspaceRoot, result.record);
      if (text) texts.push(text);
    } else {
      if (++files > MAX_FILE_SOURCES) continue;
      const resolved = await resolveSourcePath(options.workspaceRoot, options.outputDir, sourcePath);
      if ('error' in resolved) {
        warnings.push(`Source not recorded: ${resolved.error}`);
        continue;
      }
      sources.push({ path: resolved.rel, sha256: await sha256Of(resolved.abs) });
    }
  }
  if (documents > MAX_DOCUMENT_SOURCES) warnings.push(`Only the first ${MAX_DOCUMENT_SOURCES} documents were recorded (${documents} given).`);
  if (files > MAX_FILE_SOURCES) warnings.push(`Only the first ${MAX_FILE_SOURCES} other files were recorded (${files} given).`);

  let numberCheck: NumberCheckResult | undefined;
  if (/\.html?$/i.test(options.entryPath) && texts.length > 0) {
    try {
      const html = await fs.readFile(path.join(options.workspaceRoot, options.entryPath), 'utf8');
      numberCheck = checkSourceNumbers(visibleText(html), texts);
    } catch {
      warnings.push('The number check was skipped: the entry file could not be read.');
    }
  }
  return { sources, numberCheck, warnings };
}

/** Human/agent-facing text for a registration result. */
export function formatSourceRegistration(reg: SourceRegistration): string {
  const lines: string[] = [];
  if (reg.sources.length > 0) lines.push(`Sources recorded: ${reg.sources.map((s) => s.path).join(', ')}.`);
  for (const w of reg.warnings) lines.push(`Warning: ${w}`);
  if (reg.numberCheck) {
    const { checked, unmatched, omitted } = reg.numberCheck;
    if (unmatched.length === 0) {
      lines.push(`Number check: all ${checked} numbers on the page appear in the sources.`);
    } else {
      lines.push(
        `Number check: ${unmatched.length + omitted} of ${checked} numbers on the page don't appear in any source. Check each one against the sources, then fix it, or (for a figure you derived) say how in the slide's notes:`,
        ...unmatched.map((u) => `- ${u.number} — "${u.context}"`),
      );
      if (omitted > 0) lines.push(`- … and ${omitted} more`);
    }
  }
  return lines.join('\n');
}

export interface StaleSource {
  path: string;
  reason: 'changed' | 'missing';
}

/** Recorded sources whose file changed since registration, or no longer exists. */
export async function findStaleSources(workspaceRoot: string, outputDir: string, recorded: RecordedSource[]): Promise<StaleSource[]> {
  const stale: StaleSource[] = [];
  for (const source of recorded) {
    const resolved = await resolveSourcePath(workspaceRoot, outputDir, source.path);
    if ('error' in resolved) {
      stale.push({ path: source.path, reason: 'missing' });
      continue;
    }
    if ((await sha256Of(resolved.abs)) !== source.sha256) stale.push({ path: source.path, reason: 'changed' });
  }
  return stale;
}

/** Reads `sources` from a manifest record, ignoring malformed entries. */
export function recordedSources(manifest: Record<string, unknown> | null | undefined): RecordedSource[] {
  const raw = manifest?.sources;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is RecordedSource => !!s && typeof s === 'object' && typeof (s as RecordedSource).path === 'string' && typeof (s as RecordedSource).sha256 === 'string',
  );
}
