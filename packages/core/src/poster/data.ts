// Data for bulk export (openspec poster-format-pipeline, "bulk-export"):
// rows from a CSV, XLSX or JSON-array file, checked against the
// `data-od-field` / `data-od-qr-field` attributes in the artifact's HTML
// before any browser is launched.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { readSpreadsheetRows } from '../vendored/documentExtract';

export const MAX_DATA_ROWS = 200;

export interface DataTable {
  columns: string[];
  rows: Array<Record<string, string>>;
}

/** RFC 4180: quoted fields, doubled quotes, CR/LF or LF line ends, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function fromGrid(grid: string[][], source: string): DataTable {
  if (grid.length === 0) throw new Error(`${source} has no rows.`);
  const columns = grid[0].map((c) => c.trim());
  const seen = new Set<string>();
  for (const c of columns) {
    if (c === '') throw new Error(`${source}'s header row has an empty column name.`);
    if (seen.has(c)) throw new Error(`${source}'s header row repeats the column "${c}".`);
    seen.add(c);
  }
  const rows = grid.slice(1).map((cells) => Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? '').trim()])));
  return { columns, rows };
}

function fromJson(value: unknown, source: string): DataTable {
  if (!Array.isArray(value) || !value.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    throw new Error(`${source} must be a JSON array of objects (one object per row).`);
  }
  const columns: string[] = [];
  for (const r of value as Array<Record<string, unknown>>) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  const text = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const rows = (value as Array<Record<string, unknown>>).map((r) => Object.fromEntries(columns.map((c) => [c, text(r[c]).trim()])));
  return { columns, rows };
}

/** Loads a workspace-relative data file. Throws with a user-facing message. */
export async function loadDataTable(workspaceRoot: string, dataPath: string, sheet?: string): Promise<DataTable> {
  const abs = path.resolve(workspaceRoot, dataPath);
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`data path is outside the workspace: ${dataPath}`);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(abs);
  } catch {
    throw new Error(`No data file at ${dataPath}.`);
  }
  const ext = path.extname(abs).toLowerCase();
  if (sheet !== undefined && ext !== '.xlsx') throw new Error('sheet applies to .xlsx data only.');
  if (ext === '.csv') return fromGrid(parseCsv(buffer.toString('utf8')), dataPath);
  if (ext === '.json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch (err) {
      throw new Error(`${dataPath} isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    return fromJson(parsed, dataPath);
  }
  if (ext === '.xlsx') return fromGrid((await readSpreadsheetRows(buffer, sheet)).rows, dataPath);
  throw new Error(`Unsupported data file type "${ext || '(none)'}" — use .csv, .xlsx or .json.`);
}

export interface BoundFields {
  fields: string[];
  qrFields: string[];
}

/** The column names an artifact's HTML binds, in first-use order. */
export function scanBoundFields(html: string): BoundFields {
  const collect = (attr: string): string[] => {
    const names: string[] = [];
    for (const m of html.matchAll(new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g'))) {
      const name = (m[1] ?? m[2] ?? '').trim();
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  };
  return { fields: collect('data-od-field'), qrFields: collect('data-od-qr-field') };
}

export type DataCheck = { ok: true; warnings: string[] } | { ok: false; error: string };

export function checkDataAgainstFields(table: DataTable, bound: BoundFields, dataPath: string, nameField?: string): DataCheck {
  const used = [...new Set([...bound.fields, ...bound.qrFields])];
  if (used.length === 0) {
    return { ok: false, error: `The artifact has no data-od-field or data-od-qr-field elements, so there is nothing to fill from ${dataPath}.` };
  }
  const missing = used.filter((f) => !table.columns.includes(f));
  if (missing.length > 0) {
    return { ok: false, error: `The artifact uses field(s) ${missing.map((f) => `"${f}"`).join(', ')} that ${dataPath} has no column for. Its columns: ${table.columns.join(', ')}.` };
  }
  if (nameField !== undefined && !table.columns.includes(nameField)) {
    return { ok: false, error: `nameField "${nameField}" isn't a column of ${dataPath}. Its columns: ${table.columns.join(', ')}.` };
  }
  if (table.rows.length === 0) return { ok: false, error: `${dataPath} has a header row but no data rows.` };
  if (table.rows.length > MAX_DATA_ROWS) {
    return { ok: false, error: `${dataPath} has ${table.rows.length} rows; bulk export takes at most ${MAX_DATA_ROWS} per call. Split the data into smaller files.` };
  }
  const warnings: string[] = [];
  const unused = table.columns.filter((c) => !used.includes(c) && c !== nameField);
  if (unused.length > 0) warnings.push(`Column(s) not used by any field: ${unused.join(', ')}.`);
  table.rows.forEach((row, i) => {
    const empty = used.filter((f) => row[f] === '');
    if (empty.length > 0) warnings.push(`Row ${i + 1}: empty ${empty.join(', ')} (bound as empty text).`);
  });
  return { ok: true, warnings };
}

export function slugifyName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** One file-name suffix per row: the slugified name field (made unique), else the zero-padded row number. */
export function rowFileSuffixes(table: DataTable, nameField?: string): string[] {
  const width = Math.max(2, String(table.rows.length).length);
  const taken = new Set<string>();
  return table.rows.map((row, i) => {
    const base = (nameField ? slugifyName(row[nameField] ?? '') : '') || String(i + 1).padStart(width, '0');
    let candidate = base;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
    taken.add(candidate);
    return candidate;
  });
}
