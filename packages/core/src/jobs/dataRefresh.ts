// Data-only refresh for recurring jobs (openspec add-refreshable-dashboards):
// with `refresh: data`, a run swaps in new data and leaves the design alone.
// This module hashes the page so finish can prove it didn't change, checks
// that the data still has the collections and columns the page binds and
// charts, sets the data file's `asOf`, and reads the KPI values a run shows.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { applySampleData, formatValue, loadSampleData, resolveSampleData, SHARED_DATA_PATH } from '../export/sampleData';
import { sha256Of } from '../workspace/sourceStore';
import { periodEndDate } from './periodKey';
import type { JobCheckFinding } from './runLog';

export interface KpiValue {
  label: string;
  value: number;
  /** The value as the page shows it ("$121,000.00"). */
  shown?: string;
}

/** The entry and the shared HTML fragments beside it, workspace-relative. */
export async function pageFiles(workspaceRoot: string, entryPath: string): Promise<string[]> {
  const entry = entryPath.replace(/\\/g, '/');
  const files = [entry];
  const shared = path.posix.join(path.posix.dirname(entry), path.posix.dirname(SHARED_DATA_PATH));
  try {
    for (const name of (await fs.readdir(path.join(workspaceRoot, shared))).sort()) if (/\.html?$/i.test(name)) files.push(path.posix.join(shared, name));
  } catch {
    // No shared fragments.
  }
  return files;
}

/** sha256 of each page file, so finish can tell whether the design was edited. */
export async function hashPage(workspaceRoot: string, entryPath: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const file of await pageFiles(workspaceRoot, entryPath)) {
    try {
      out[file] = await sha256Of(path.join(workspaceRoot, file));
    } catch {
      out[file] = 'missing';
    }
  }
  return out;
}

/** Page files whose hash differs from `before`. */
export async function changedPageFiles(workspaceRoot: string, entryPath: string, before: Record<string, string>): Promise<string[]> {
  const now = await hashPage(workspaceRoot, entryPath);
  const names = new Set([...Object.keys(before), ...Object.keys(now)]);
  return [...names].filter((n) => before[n] !== now[n]).sort();
}

/** `data-shape-changed` when the data no longer has what the page binds or charts. */
export async function dataShapeFindings(workspaceRoot: string, entryPath: string): Promise<JobCheckFinding[]> {
  const root = path.resolve(workspaceRoot);
  let html: string;
  try {
    html = await fs.readFile(path.join(root, entryPath), 'utf8');
  } catch {
    return [];
  }
  const applied = await resolveSampleData(html, path.join(root, entryPath), root);
  const problems: string[] = [];
  if (applied.error) problems.push(applied.error);
  if (applied.missing.length) problems.push(`binds point at data that isn't there: ${applied.missing.slice(0, 5).join(', ')}`);
  for (const chart of applied.charts ?? []) {
    for (const p of chart.problems) if ((p.check === 'chart-data-missing' && p.severity === 'error') || p.check === 'chart-empty') problems.push(p.message);
  }
  for (const r of applied.repeats) if (r.count === 0) problems.push(`the "${r.path}" list is empty`);
  if (problems.length === 0) return [];
  return [
    {
      severity: 'error',
      code: 'data-shape-changed',
      message: `The new data doesn't fit the design: ${problems.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(' ')} Fix the data (or the column names), or ask a person to update the design.`,
    },
  ];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function newestDate(value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string') return ISO_DATE.test(value) ? value.slice(0, 10) : undefined;
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  let best: string | undefined;
  for (const v of Object.values(value as Record<string, unknown>)) {
    const d = newestDate(v, depth + 1);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

/**
 * Sets `asOf` in the page's data file to the end of the period, or to the
 * newest date in the data when that is later. Returns the date set and the
 * data file, or undefined when the page has no data file.
 */
export async function setAsOf(workspaceRoot: string, entryPath: string, key: string): Promise<{ asOf: string; dataFile: string } | undefined> {
  const root = path.resolve(workspaceRoot);
  const loaded = await loadSampleData(path.join(root, entryPath), root);
  if (!loaded.ok) return undefined;
  const end = periodEndDate(key);
  const { asOf: _old, ...rest } = loaded.data;
  void _old;
  const newest = newestDate(rest);
  const asOf = [end, newest].filter((d): d is string => !!d).sort().pop();
  if (!asOf) return undefined;
  const raw = JSON.parse(await fs.readFile(loaded.file, 'utf8')) as Record<string, unknown>;
  if (raw.asOf !== asOf) {
    raw.asOf = asOf;
    await fs.writeFile(loaded.file, `${JSON.stringify(raw, null, 2)}\n`);
  }
  return { asOf, dataFile: path.relative(root, loaded.file).split(path.sep).join('/') };
}

/** The values the page's KPI charts show now. */
export async function kpiValues(workspaceRoot: string, entryPath: string): Promise<KpiValue[]> {
  const root = path.resolve(workspaceRoot);
  try {
    const html = await fs.readFile(path.join(root, entryPath), 'utf8');
    const loaded = await loadSampleData(path.join(root, entryPath), root);
    if (!loaded.ok) return [];
    const applied = applySampleData(html, loaded.data);
    return (applied.charts ?? [])
      .filter((c) => c.kpi)
      .map((c) => ({ label: c.spec.title ?? c.kpi!.label, value: c.kpi!.value, shown: formatValue(c.kpi!.value, c.spec.format ?? 'number', loaded.data) }));
  } catch {
    return [];
  }
}

/** "Revenue 121000, up 4% from the last run" for each KPI, compared with the last completed run's values. */
export function kpiChangeSummary(now: KpiValue[], before: KpiValue[] | undefined): string | undefined {
  if (now.length === 0) return undefined;
  const show = (k: KpiValue) => k.shown ?? new Intl.NumberFormat('en-US').format(k.value);
  const parts = now.map((k) => {
    const prev = before?.find((b) => b.label === k.label);
    if (!prev) return `${k.label} ${show(k)}`;
    if (prev.value === k.value) return `${k.label} ${show(k)}, unchanged from the last run`;
    const pct = prev.value !== 0 ? Math.abs(((k.value - prev.value) / Math.abs(prev.value)) * 100) : undefined;
    const dir = k.value > prev.value ? 'up' : 'down';
    return `${k.label} ${show(k)}, ${dir} ${pct === undefined ? new Intl.NumberFormat('en-US').format(Math.abs(k.value - prev.value)) : `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`} from the last run`;
  });
  return `KPIs: ${parts.join('; ')}.`;
}
