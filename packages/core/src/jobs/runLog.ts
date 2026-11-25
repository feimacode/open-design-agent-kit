// The job's run log, `<jobs dir>/<id>.runs.json` (design D3): newest first,
// capped at 52 runs. `start` adds a `started` record that `finish` completes,
// and the skip decision reads the completed runs of the current period.
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { JobDefinition, JobSource } from './jobFile';

export const MAX_RUN_RECORDS = 52;

export type RunStatus = 'started' | 'completed' | 'needs-review' | 'failed';

export interface SourceHash {
  path: string;
  /** null when the file didn't exist. */
  sha256: string | null;
}

export interface RunOutputSkipped {
  output: string;
  reason: string;
}

export interface JobCheckFinding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface RunRecord {
  runId: string;
  periodKey: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  target: string;
  capabilities: { browser: boolean; cloud: boolean };
  runNow?: boolean;
  /** Source hashes when the run finished (at start for a run still `started`). */
  sources: SourceHash[];
  outputs?: { written: string[]; skipped: RunOutputSkipped[] };
  findings?: JobCheckFinding[];
  notes?: string;
  /** `refresh: data` runs: page file hashes at start, so finish can prove the design wasn't edited. */
  pageHashes?: Record<string, string>;
  /** `refresh: data` runs: the `asOf` date set in the data file. */
  asOf?: string;
  /** KPI values the page showed when the run finished (openspec add-refreshable-dashboards). */
  kpis?: Array<{ label: string; value: number; shown?: string }>;
}

export interface RunLog {
  version: 1;
  jobId: string;
  runs: RunRecord[];
}

export function newRunId(): string {
  return randomUUID();
}

export async function readRunLog(workspaceRoot: string, runLogPath: string, jobId: string): Promise<RunLog> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(workspaceRoot, runLogPath), 'utf8')) as RunLog;
    if (parsed?.version === 1 && Array.isArray(parsed.runs)) return { version: 1, jobId, runs: parsed.runs };
  } catch {
    // Missing or unreadable: a fresh log.
  }
  return { version: 1, jobId, runs: [] };
}

export async function writeRunLog(workspaceRoot: string, runLogPath: string, log: RunLog): Promise<void> {
  const abs = path.join(workspaceRoot, runLogPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const runs = log.runs.slice(0, MAX_RUN_RECORDS);
  await fs.writeFile(abs, `${JSON.stringify({ version: 1, jobId: log.jobId, runs }, null, 2)}\n`);
}

/** Puts `record` first, replacing an older record with the same run id. */
export function upsertRun(log: RunLog, record: RunRecord): RunLog {
  return { ...log, runs: [record, ...log.runs.filter((r) => r.runId !== record.runId)].slice(0, MAX_RUN_RECORDS) };
}

/** The workspace path of each source the job reads: workspace files, and connector snapshots. */
export function sourcePaths(sources: JobSource[]): string[] {
  return sources.map((s) => ('path' in s ? s.path : s.snapshot));
}

async function hashFile(abs: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(abs)).digest('hex');
  } catch {
    return null;
  }
}

export async function hashSources(workspaceRoot: string, paths: string[]): Promise<SourceHash[]> {
  return Promise.all(paths.map(async (p) => ({ path: p, sha256: await hashFile(path.join(workspaceRoot, p)) })));
}

export type SkipDecision =
  | { skip: true; reason: string; completedRun: RunRecord }
  | { skip: false; changedSources: string[]; previousRun?: RunRecord; forced: boolean };

/**
 * Whether a run for `periodKey` should be skipped: yes when a completed run
 * exists for it, unless `runNow`, or (with rebuildOnSourceChange) a workspace
 * source's hash differs from that run's. Connector snapshots are left out of
 * the comparison: they're only refreshed during a run.
 */
export function decideSkip(input: {
  job: Pick<JobDefinition, 'rebuildOnSourceChange' | 'sources'>;
  log: RunLog;
  periodKey: string;
  currentSources: SourceHash[];
  runNow?: boolean;
}): SkipDecision {
  const completed = input.log.runs.find((r) => r.periodKey === input.periodKey && r.status === 'completed');
  if (!completed) return { skip: false, changedSources: [], forced: false };
  const workspacePaths = new Set(input.job.sources.flatMap((s) => ('path' in s ? [s.path] : [])));
  const recorded = new Map(completed.sources.map((s) => [s.path, s.sha256]));
  const changedSources = input.currentSources
    .filter((s) => workspacePaths.has(s.path))
    .filter((s) => !recorded.has(s.path) || recorded.get(s.path) !== s.sha256)
    .map((s) => s.path);
  if (input.runNow) return { skip: false, changedSources, previousRun: completed, forced: true };
  if (input.job.rebuildOnSourceChange && changedSources.length > 0) return { skip: false, changedSources, previousRun: completed, forced: false };
  const when = completed.finishedAt ?? completed.startedAt;
  return {
    skip: true,
    completedRun: completed,
    reason: `Period ${input.periodKey} already has a completed run (${completed.runId}, finished ${when})${input.job.sources.length ? ' and its sources are unchanged' : ''}. Pass runNow: true to rebuild anyway.`,
  };
}
