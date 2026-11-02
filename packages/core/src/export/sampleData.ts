// Sample data for app screens (openspec add-sample-data). A collection keeps
// one data file, `_shared/data.json` beside its screens (a single screen:
// `<name>.data.json` beside it), and screens bind to it:
//
//   <td data-od-bind="invoices[2].total" data-od-format="currency">…</td>
//   <tr data-od-repeat="invoices"><td data-od-bind=".customer">…</td></tr>
//   <img data-od-bind-src=".avatar" alt="">
//
// The kit fills them wherever it serves a design, the same way it fills shared
// navigation (flowIncludes.ts). A repeat's template element is filled with the
// first item and stays in the file; the other items are rendered after it as
// copies marked data-od-preview-only, so a save from the preview keeps the
// binds and the one template. Paths starting with "." are relative to the
// repeat's current item; others start at the top of the data file.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import type { Finding } from '../poster/preflight';

export const SHARED_DATA_PATH = '_shared/data.json';
export const MAX_DATA_BYTES = 1_000_000;
/** A repeat renders at most this many items. */
export const MAX_REPEAT_ITEMS = 200;
/** Thin data: fewer items than this in a repeated table or list. */
export const MIN_TABLE_ROWS = 12;
/** Thin data: no value at least this long in a repeated table or list. */
export const LONG_VALUE_CHARS = 30;
const FORMATS = ['currency', 'date', 'datetime', 'time', 'number', 'percent'] as const;
type Format = (typeof FORMATS)[number];

export interface SampleData {
  locale?: string;
  currency?: string;
  [collection: string]: unknown;
}

/** True when the page binds to sample data. */
export function hasDataBinds(html: string): boolean {
  return /\bdata-od-(?:bind(?:-[a-z-]+)?|repeat)\s*=/i.test(html);
}

/** Workspace-relative candidates for a screen's data file, most specific first. */
export function dataFileCandidates(fileAbs: string): string[] {
  const dir = path.dirname(fileAbs);
  const base = path.basename(fileAbs).replace(/\.html?$/i, '');
  return [path.join(dir, `${base}.data.json`), path.join(dir, SHARED_DATA_PATH)];
}

export type LoadedData = { ok: true; data: SampleData; file: string } | { ok: false; error: string; file?: string };

/** The data file for the screen at `fileAbs`, which must stay inside `rootAbs`. */
export async function loadSampleData(fileAbs: string, rootAbs: string): Promise<LoadedData> {
  for (const abs of dataFileCandidates(fileAbs)) {
    const within = path.relative(rootAbs, abs);
    if (within.startsWith('..') || path.isAbsolute(within)) continue;
    let text: string;
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_DATA_BYTES) return { ok: false, file: abs, error: `${within} is over ${MAX_DATA_BYTES / 1_000_000} MB.` };
      text = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    try {
      const data = JSON.parse(text) as unknown;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, file: abs, error: `${within} must be a JSON object of named collections.` };
      return { ok: true, data: data as SampleData, file: abs };
    } catch (err) {
      return { ok: false, file: abs, error: `${within} isn't valid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  return { ok: false, error: `No data file: write ${SHARED_DATA_PATH} beside the screens (or <name>.data.json beside a single screen).` };
}

const MISSING = Symbol('missing');

/** Resolves `a.b[2].c` against `root`; a leading "." resolves against `item`. */
export function resolvePath(root: unknown, item: unknown, p: string): unknown {
  const relative = p.startsWith('.');
  let cur: unknown = relative ? item : root;
  const parts = p.replace(/^\./, '').match(/[^.[\]]+|\[\d+\]/g) ?? [];
  if (relative && parts.length === 0) return item;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return MISSING;
    const key = part.startsWith('[') ? Number(part.slice(1, -1)) : part;
    if (!(key in (cur as Record<string | number, unknown>))) return MISSING;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** A value as text, formatted with the data file's locale and currency. */
export function formatValue(value: unknown, format: string | undefined, data: Pick<SampleData, 'locale' | 'currency'>): string {
  if (value === null || value === undefined) return '';
  const locale = typeof data.locale === 'string' ? data.locale : 'en-US';
  const f = (FORMATS as readonly string[]).includes(format ?? '') ? (format as Format) : undefined;
  try {
    if (f === 'currency' && typeof value === 'number') return new Intl.NumberFormat(locale, { style: 'currency', currency: typeof data.currency === 'string' ? data.currency : 'USD' }).format(value);
    if (f === 'number' && typeof value === 'number') return new Intl.NumberFormat(locale).format(value);
    if (f === 'percent' && typeof value === 'number') return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
    if ((f === 'date' || f === 'datetime' || f === 'time') && (typeof value === 'string' || typeof value === 'number')) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        // Dates without a time are calendar dates: format them in UTC so they don't move a day.
        const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
        const opts: Intl.DateTimeFormatOptions =
          f === 'date' ? { dateStyle: 'medium', ...(dateOnly ? { timeZone: 'UTC' } : {}) } : f === 'time' ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' };
        return new Intl.DateTimeFormat(locale, opts).format(d);
      }
    }
  } catch {
    // An unknown locale or currency code: fall through to the plain value.
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface RepeatInfo {
  /** The repeat's path as written. */
  path: string;
  /** Items rendered (0 when the path is missing or not a list). */
  count: number;
  /** Longest text value among the items' fields. */
  longest: number;
  /** The template sits in a table, grid or list. */
  tabular: boolean;
}

export interface AppliedData {
  html: string;
  /** Bind and repeat paths not found in the data file. */
  missing: string[];
  repeats: RepeatInfo[];
}

function longestText(value: unknown, depth = 0): number {
  if (typeof value === 'string') return value.length;
  if (!value || typeof value !== 'object' || depth > 3) return 0;
  return Math.max(0, ...Object.values(value as Record<string, unknown>).map((v) => longestText(v, depth + 1)));
}

/** Fills binds and renders repeats in `html` from `data`. */
export function applySampleData(html: string, data: SampleData): AppliedData {
  const $ = cheerio.load(html);
  const missing = new Set<string>();
  // A field some records leave out is optional, not missing: a relative path is missing only when no record has it.
  const relFound = new Set<string>();
  const relMissed = new Set<string>();
  const repeats: RepeatInfo[] = [];

  type Sel = ReturnType<typeof $>;
  type El = { attribs?: Record<string, string> };
  // In a repeat, binds and nested repeats belong to it when it is their nearest repeat; at the top, when they have none.
  const owns = (scope: Sel | undefined, owner: Sel) => (scope ? owner.is(scope) : owner.length === 0);

  /** Fills `scope` (a repeat's copy, or the whole page when undefined) for `item`. */
  const fill = (scope: Sel | undefined, item: unknown): void => {
    const all = scope ? scope.find('*').addBack() : $.root().find('*');
    all.filter('[data-od-repeat]').each((_, el) => {
      if (scope && scope.is(el)) return;
      if (owns(scope, $(el).parent().closest('[data-od-repeat]'))) renderRepeat($(el), item);
    });
    all.each((_, el) => {
      const attribs = (el as El).attribs;
      if (!attribs || !Object.keys(attribs).some((n) => n.startsWith('data-od-bind'))) return;
      const node = $(el);
      if (!owns(scope, node.closest('[data-od-repeat]'))) return;
      for (const [name, raw] of Object.entries(attribs)) {
        if (!name.startsWith('data-od-bind')) continue;
        const target = name === 'data-od-bind' ? undefined : name.slice('data-od-bind-'.length);
        const p = raw.trim();
        const value = resolvePath(data, item, p);
        if (p.startsWith('.')) (value === MISSING ? relMissed : relFound).add(p);
        if (value === MISSING) {
          if (!p.startsWith('.')) missing.add(p);
          if (target) node.removeAttr(target);
          else node.text(node.attr('data-od-empty') ?? '');
          continue;
        }
        if (target) {
          if (value === null || value === undefined) node.removeAttr(target);
          else node.attr(target, String(value));
        } else {
          const text = formatValue(value, node.attr('data-od-format'), data);
          node.text(text === '' ? (node.attr('data-od-empty') ?? '') : text);
        }
      }
    });
  };

  const renderRepeat = (template: Sel, item: unknown): void => {
    const p = (template.attr('data-od-repeat') ?? '').trim();
    const list = resolvePath(data, item, p);
    const tabular = template.is('tr, li') || template.closest('table, ul, ol, [role="grid"], [role="list"], [role="table"]').length > 0;
    if (list === MISSING || !Array.isArray(list)) {
      missing.add(p);
      repeats.push({ path: p, count: 0, longest: 0, tabular });
      return;
    }
    const items = list.slice(0, MAX_REPEAT_ITEMS);
    repeats.push({ path: p, count: items.length, longest: Math.max(0, ...items.map((i) => longestText(i))), tabular });
    if (items.length === 0) {
      // An empty list renders nothing; the template stays in the file but isn't shown.
      template.attr('data-od-repeat-empty', '');
      return;
    }
    const pristine = template.clone();
    fill(template, items[0]);
    let after = template;
    for (let i = 1; i < items.length; i++) {
      const copy = pristine.clone();
      copy.attr('data-od-preview-only', '').attr('data-od-repeat-copy', String(i)).removeAttr('id');
      after.after(copy);
      fill(copy, items[i]);
      after = copy;
    }
  };

  fill(undefined, undefined);
  for (const p of relMissed) if (!relFound.has(p)) missing.add(p);
  if (repeats.some((r) => r.count === 0)) {
    $('head').append('<style data-od-preview-only>[data-od-repeat-empty]{display:none!important}</style>');
  }
  return { html: $.html(), missing: [...missing], repeats };
}

/** Loads the screen's data file and applies it; the page as it was when there is nothing to apply. */
export async function resolveSampleData(html: string, fileAbs: string, rootAbs: string): Promise<AppliedData & { error?: string; dataFile?: string }> {
  if (!hasDataBinds(html)) return { html, missing: [], repeats: [] };
  const loaded = await loadSampleData(fileAbs, rootAbs);
  if (!loaded.ok) return { html, missing: [], repeats: [], error: loaded.error, dataFile: loaded.file };
  return { ...applySampleData(html, loaded.data), dataFile: loaded.file };
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20 };

/** Counts a brief promises, such as "a grid of 6 products": noun (singular stem) to count. */
export function promisedCounts(text: string): Array<{ noun: string; count: number }> {
  const out: Array<{ noun: string; count: number }> = [];
  for (const m of text.toLowerCase().matchAll(/\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\s+(?:[a-z-]+\s+)?([a-z]{3,})s\b/g)) {
    const count = /^\d/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    if (count >= 2 && count <= MAX_REPEAT_ITEMS) out.push({ noun: m[2], count });
  }
  return out;
}

/**
 * The sample-data findings for a page: binds to paths the data file doesn't
 * have, thin repeated tables and lists, and fewer items than the brief promised.
 */
export function sampleDataFindings(applied: AppliedData & { error?: string }, promised: string[] = []): Finding[] {
  const findings: Finding[] = [];
  if (applied.error) {
    findings.push({ check: 'sample-data-missing', severity: 'error', message: `The page binds to sample data, but: ${applied.error}` });
    return findings;
  }
  if (applied.missing.length > 0) {
    const list = applied.missing.slice(0, 5).join(', ');
    findings.push({
      check: 'sample-data-missing',
      severity: 'error',
      message: `${applied.missing.length === 1 ? 'A bind points' : `${applied.missing.length} binds point`} at data the data file doesn't have: ${list}${applied.missing.length > 5 ? ', …' : ''}. Add it to the data file or fix the path.`,
    });
  }
  for (const r of applied.repeats) {
    if (!r.tabular || r.count === 0) continue;
    const problems: string[] = [];
    if (r.count < MIN_TABLE_ROWS) problems.push(`${r.count} item${r.count === 1 ? '' : 's'} (real lists have more: at least ${MIN_TABLE_ROWS})`);
    if (r.longest < LONG_VALUE_CHARS) problems.push(`no value of ${LONG_VALUE_CHARS}+ characters (add one very long name)`);
    if (problems.length > 0) findings.push({ check: 'sample-data-thin', severity: 'warning', message: `The "${r.path}" list has ${problems.join(' and ')}, so the design is only tried on the easy case.` });
  }
  for (const text of promised) {
    for (const { noun, count } of promisedCounts(text)) {
      const r = applied.repeats.find((x) => {
        const name = x.path.replace(/^.*[.\]]/, '').replace(/^\./, '').toLowerCase();
        return name.startsWith(noun) || noun.startsWith(name.replace(/s$/, ''));
      });
      if (r && r.count < count) {
        findings.push({ check: 'items-promised', severity: 'warning', message: `The brief asks for ${count} ${noun}s, and the "${r.path}" list renders ${r.count}.` });
      }
    }
  }
  return findings;
}

/** Fewest rows a hand-written app table (no repeat) should have. */
export const MIN_STATIC_TABLE_ROWS = 6;

/** App tables written out by hand (no data-od-repeat) with fewer than six body rows. */
export function thinStaticTables(html: string): Finding[] {
  const $ = cheerio.load(html);
  const findings: Finding[] = [];
  $('table').each((i, el) => {
    const table = $(el);
    if (table.find('[data-od-repeat]').length > 0 || table.closest('[data-od-state]:not([data-od-state="default"])').length > 0) return;
    const rows = table.find('tbody tr').length || table.find('tr').length - table.find('thead tr').length;
    if (rows < 1 || rows >= MIN_STATIC_TABLE_ROWS) return;
    const label = table.attr('aria-label') ?? table.find('caption').first().text().trim();
    findings.push({
      check: 'sample-data-thin',
      severity: 'warning',
      message: `The ${label ? `"${label}" ` : ''}table has ${rows} row${rows === 1 ? '' : 's'}. Real tables are longer: bind it to the data file with data-od-repeat and at least ${MIN_TABLE_ROWS} rows, one with a very long value.`,
      selector: `table:nth-of-type(${i + 1})`,
    });
  });
  return findings;
}

/** The data file a design's screen reads, workspace-relative, or undefined when it has none or binds nothing. */
export async function sampleDataForEntry(workspaceRoot: string, entryPath: string, html: string): Promise<{ path: string; data: SampleData } | undefined> {
  if (!hasDataBinds(html)) return undefined;
  const root = path.resolve(workspaceRoot);
  const loaded = await loadSampleData(path.resolve(root, entryPath), root);
  return loaded.ok ? { path: path.relative(root, loaded.file).split(path.sep).join('/'), data: loaded.data } : undefined;
}

function tsType(values: unknown[], indent: string, depth: number): string {
  const kinds = new Set<string>();
  let optional = false;
  const objects: Record<string, unknown>[] = [];
  const arrays: unknown[] = [];
  for (const v of values) {
    if (v === null || v === undefined) optional = true;
    else if (Array.isArray(v)) {
      kinds.add('array');
      arrays.push(...v);
    } else if (typeof v === 'object') {
      kinds.add('object');
      objects.push(v as Record<string, unknown>);
    } else kinds.add(typeof v);
  }
  const parts: string[] = [];
  for (const k of kinds) {
    if (k === 'object') parts.push(depth > 3 ? 'Record<string, unknown>' : tsObject(objects, indent, depth + 1));
    else if (k === 'array') parts.push(`Array<${tsType(arrays, indent, depth + 1)}>`);
    else if (k === 'string' || k === 'number' || k === 'boolean') parts.push(k);
    else parts.push('unknown');
  }
  if (parts.length === 0) return optional ? 'null' : 'unknown';
  const type = parts.join(' | ');
  return optional ? `${type} | null` : type;
}

function tsObject(objects: Record<string, unknown>[], indent: string, depth: number): string {
  const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const inner = indent + '  ';
  const fields = keys.map((k) => {
    const present = objects.filter((o) => k in o);
    const optional = present.length < objects.length ? '?' : '';
    const name = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
    return `${inner}${name}${optional}: ${tsType(present.map((o) => o[k]), inner, depth)};`;
  });
  return `{\n${fields.join('\n')}\n${indent}}`;
}

/** A TypeScript type for each list in the data file, inferred from its records. */
export function inferMockTypes(data: SampleData): Array<{ collection: string; typeName: string; type: string; count: number }> {
  const out: Array<{ collection: string; typeName: string; type: string; count: number }> = [];
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    const base = key.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
    const typeName = base.replace(/(^|[^A-Za-z0-9])([a-z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '') || 'Item';
    out.push({ collection: key, typeName, type: tsType(value, '', 0).replace(/^Array<|>$/g, ''), count: value.length });
  }
  return out;
}

/** "Keep the design's data": mocks/<list>.ts with the records and their types, and one data module with a marked seam. */
export function composeMockDataSection(sample: { path: string; data: SampleData }): string {
  const lists = inferMockTypes(sample.data);
  if (lists.length === 0) return '';
  const types = lists.map((l) => `- \`${l.collection}\` (${l.count} records) → \`mocks/${l.collection}.ts\`:\n\n  \`\`\`ts\n  export type ${l.typeName} = ${l.type.replace(/\n/g, '\n  ')};\n  \`\`\``).join('\n');
  return [
    '## Keep the design\'s data as mocks',
    '',
    `The design binds to \`${sample.path}\` (\`data-od-bind\`, \`data-od-repeat\`). Don't retype its rows into the components and don't drop them:`,
    '',
    `1. For each list, write \`mocks/<list>.ts\` (in the app's usual folder for such files, e.g. \`src/mocks/\`) exporting its type and its records copied from the data file unchanged. Types inferred from the data:`,
    '',
    types,
    '',
    `2. Write one data module (e.g. \`src/lib/data.ts\`, matching how the app fetches data) with an async getter per list (\`getInvoices()\`, \`getInvoice(id)\`) that returns the mocks, and put \`// TODO(data): replace with your API\` on each mock return, so the place where real data plugs in is easy to find.`,
    `3. Components take the records as props or from those getters, never from the mocks directly. A \`data-od-repeat\` template becomes a \`.map()\` over the list; \`data-od-format\` becomes \`Intl\` formatting with the file's locale (\`${typeof sample.data.locale === 'string' ? sample.data.locale : 'en-US'}\`)${typeof sample.data.currency === 'string' ? ` and currency (\`${sample.data.currency}\`)` : ''}.`,
  ].join('\n');
}
