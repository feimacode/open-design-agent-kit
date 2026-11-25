// Recurring design jobs (openspec add-recurring-design-jobs): the job file,
// `.open-design/jobs/<id>.job.md`, is YAML frontmatter followed by the brief.
// The scheduler only holds "Run the Open Design job <path>"; everything a run
// needs lives here, versioned with the work (design D1).
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { HOSTING_PROVIDERS } from '../workspace/shareRecords';

export const JOB_FILE_SUFFIX = '.job.md';
export const PERIOD_PLACEHOLDER = '{period}';

export type JobPeriod = 'day' | 'week' | 'month';
export type JobMode = 'update' | 'series';
export type JobChecks = 'required' | 'best-effort';
/** `data`: swap in new data and keep the design unchanged (openspec add-refreshable-dashboards); `design`: follow the recipe again. */
export type JobRefresh = 'data' | 'design';

/** A workspace file, or data a connector pulls into `snapshot` before the design work. */
export type JobSource = { path: string } | { connector: string; snapshot: string };

/** Where a run's results go: the private preview, a commit or PR on the state branch, or a connector action in prose. */
export type JobDelivery = { kind: 'preview' } | { kind: 'commit' } | { kind: 'pr' } | { kind: 'connector'; instruction: string };

export interface JobDefinition {
  id: string;
  title: string;
  recipe: string;
  period: JobPeriod;
  timezone: string;
  mode: JobMode;
  target: string;
  outputs: string[];
  designSystemId?: string;
  sources: JobSource[];
  deliver: JobDelivery[];
  checks: JobChecks;
  refresh: JobRefresh;
  rebuildOnSourceChange: boolean;
  previewUrl?: string;
  stateBranch: string;
  /** The Markdown body. */
  brief: string;
}

export interface JobFieldError {
  field: string;
  message: string;
}

export type ParseJobResult = { ok: true; job: JobDefinition } | { ok: false; errors: JobFieldError[] };

/** Every format export_open_design_artifact takes, plus `html` (the entry itself). */
export const JOB_OUTPUT_FORMATS = ['html', 'standalone', 'site', 'email', 'paste', 'png', 'jpeg', 'pdf', 'pptx', 'mp4', 'webm', 'gif'] as const;
/** Formats that need a browser: without one they're recorded as skipped. */
export const CAPTURE_OUTPUT_FORMATS: ReadonlySet<string> = new Set(['png', 'jpeg', 'pdf', 'pptx', 'mp4', 'webm', 'gif']);

const KNOWN_FIELDS = new Set([
  'id',
  'title',
  'recipe',
  'period',
  'timezone',
  'mode',
  'target',
  'outputs',
  'designSystemId',
  'sources',
  'deliver',
  'checks',
  'refresh',
  'rebuildOnSourceChange',
  'preview',
  'cloud',
]);

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Public hosting and social posting: unattended runs can't have the person's yes (design D7).
const PUBLIC_PROVIDER_RE = new RegExp(`\\b(${[...HOSTING_PROVIDERS, 'github pages', 'surge', 'public link'].map((p) => p.replace(/[-\s]/g, '[-\\s]?')).join('|')})\\b`, 'i');
const SOCIAL_RE = /\b(post|publish|tweet|share|upload|schedule)\b.*\b(x|twitter|linkedin|instagram|facebook|tiktok|threads|bluesky|mastodon|xiaohongshu|youtube|reddit|pinterest)\b/i;

export function defaultStateBranch(jobId: string): string {
  return `claude/open-design-job-${jobId}`;
}

/** The job id a job path names (`.open-design/jobs/weekly-kpis.job.md` → `weekly-kpis`), or undefined. */
export function jobIdFromPath(jobPath: string): string | undefined {
  const base = path.posix.basename(jobPath.replace(/\\/g, '/'));
  return base.endsWith(JOB_FILE_SUFFIX) ? base.slice(0, -JOB_FILE_SUFFIX.length) : undefined;
}

/** The run log next to the job file: `<dir>/<id>.runs.json`. */
export function runLogPathFor(jobPath: string, jobId: string): string {
  return path.posix.join(path.posix.dirname(jobPath.replace(/\\/g, '/')), `${jobId}.runs.json`);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A workspace-relative path that stays inside the workspace. */
function isWorkspacePath(p: string): boolean {
  if (!p || path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) return false;
  const normalized = path.posix.normalize(p.replace(/\\/g, '/'));
  return normalized !== '..' && !normalized.startsWith('../');
}

/** Why a delivery would go public, or undefined. */
export function publicDeliveryReason(text: string): string | undefined {
  const provider = text.match(PUBLIC_PROVIDER_RE);
  if (provider) return `"${provider[0]}" is a public publish provider`;
  if (SOCIAL_RE.test(text)) return 'it posts to a social network';
  return undefined;
}

function parseSources(raw: unknown, errors: JobFieldError[]): JobSource[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push({ field: 'sources', message: 'sources must be a list of workspace paths or { connector, snapshot } entries.' });
    return [];
  }
  const out: JobSource[] = [];
  raw.forEach((entry, i) => {
    if (typeof entry === 'string') {
      if (!isWorkspacePath(entry)) errors.push({ field: 'sources', message: `sources[${i}] "${entry}" must be a workspace-relative path inside the workspace.` });
      else out.push({ path: entry });
      return;
    }
    if (entry && typeof entry === 'object' && typeof (entry as { connector?: unknown }).connector === 'string') {
      const { connector, snapshot } = entry as { connector: string; snapshot?: unknown };
      if (!connector.trim()) {
        errors.push({ field: 'sources', message: `sources[${i}].connector is empty: say what to pull and from where.` });
        return;
      }
      if (typeof snapshot !== 'string' || !snapshot.trim()) {
        errors.push({ field: 'sources', message: `sources[${i}] is a connector source with no snapshot path: add snapshot, the workspace file the pulled data is saved to, so every number stays traceable.` });
        return;
      }
      if (!isWorkspacePath(snapshot)) {
        errors.push({ field: 'sources', message: `sources[${i}].snapshot "${snapshot}" must be a workspace-relative path inside the workspace.` });
        return;
      }
      out.push({ connector: connector.trim(), snapshot });
      return;
    }
    errors.push({ field: 'sources', message: `sources[${i}] must be a workspace path or { connector, snapshot }.` });
  });
  return out;
}

function parseDeliver(raw: unknown, errors: JobFieldError[]): JobDelivery[] {
  if (raw === undefined) return [{ kind: 'preview' }];
  if (!Array.isArray(raw)) {
    errors.push({ field: 'deliver', message: 'deliver must be a list: preview, commit, pr, or { connector: "<what to do>" }.' });
    return [];
  }
  const out: JobDelivery[] = [];
  raw.forEach((entry, i) => {
    const text = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? (entry as { connector?: unknown }).connector : undefined;
    if (typeof text !== 'string' || !text.trim()) {
      errors.push({ field: 'deliver', message: `deliver[${i}] must be preview, commit, pr, or { connector: "<what to do>" }.` });
      return;
    }
    const reason = publicDeliveryReason(text);
    if (reason) {
      errors.push({ field: 'deliver', message: `deliver[${i}] "${text}" is refused: ${reason}. Scheduled runs stay private, because the scheduler's prompt can't stand in for the person's yes. Deliver to the private preview, the workspace, a PR, or a connector message linking the preview instead.` });
      return;
    }
    if (typeof entry === 'string') {
      const kind = entry.trim() === 'claude-artifact' ? 'preview' : entry.trim();
      if (kind === 'preview' || kind === 'commit' || kind === 'pr') out.push({ kind });
      else errors.push({ field: 'deliver', message: `deliver[${i}] "${entry}" is unknown. Use preview, commit, pr, or { connector: "<what to do>" }.` });
      return;
    }
    out.push({ kind: 'connector', instruction: text.trim() });
  });
  return out;
}

/** Validates parsed frontmatter and body. Returns every problem, by field name. */
export function validateJob(data: Record<string, unknown>, body: string, jobPath?: string): ParseJobResult {
  const errors: JobFieldError[] = [];
  const str = (field: string): string | undefined => {
    const v = data[field];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
      errors.push({ field, message: `${field} is required.` });
      return undefined;
    }
    if (typeof v !== 'string') {
      errors.push({ field, message: `${field} must be a string.` });
      return undefined;
    }
    return v.trim();
  };
  const oneOf = <T extends string>(field: string, allowed: readonly T[]): T | undefined => {
    const v = str(field);
    if (v === undefined) return undefined;
    if (!allowed.includes(v as T)) {
      errors.push({ field, message: `${field} must be one of ${allowed.join(', ')} (got "${v}").` });
      return undefined;
    }
    return v as T;
  };

  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key)) errors.push({ field: key, message: `Unknown field "${key}".` });
  }

  const id = str('id');
  if (id !== undefined) {
    if (!ID_RE.test(id)) errors.push({ field: 'id', message: `id "${id}" must be lowercase letters, digits and hyphens.` });
    const fromPath = jobPath ? jobIdFromPath(jobPath) : undefined;
    if (jobPath && fromPath !== id) errors.push({ field: 'id', message: `id "${id}" must match the file name: the job file should be ${id}${JOB_FILE_SUFFIX}.` });
  }
  const title = str('title');
  const recipe = str('recipe');
  const period = oneOf('period', ['day', 'week', 'month'] as const);
  const timezone = str('timezone');
  if (timezone !== undefined && !isValidTimezone(timezone)) {
    errors.push({ field: 'timezone', message: `timezone "${timezone}" isn't an IANA time zone name, e.g. Europe/Berlin or America/New_York.` });
  }
  const mode = oneOf('mode', ['update', 'series'] as const);
  const target = str('target');
  if (target !== undefined) {
    if (!isWorkspacePath(target)) errors.push({ field: 'target', message: `target "${target}" must be a workspace-relative path inside the workspace.` });
    if (mode === 'series' && !target.includes(PERIOD_PLACEHOLDER)) {
      errors.push({ field: 'target', message: `target must contain ${PERIOD_PLACEHOLDER} in series mode, so each period gets its own file (e.g. .open-design/social-week/${PERIOD_PLACEHOLDER}/posts.html).` });
    }
    if (mode === 'update' && target.includes(PERIOD_PLACEHOLDER)) {
      errors.push({ field: 'target', message: `target can't contain ${PERIOD_PLACEHOLDER} in update mode, which rewrites one file each period. Use mode: series to keep one file per period.` });
    }
  }

  let outputs: string[] = [];
  if (data.outputs === undefined) {
    errors.push({ field: 'outputs', message: 'outputs is required: a list of export formats, possibly empty ([]).' });
  } else if (!Array.isArray(data.outputs) || data.outputs.some((o) => typeof o !== 'string')) {
    errors.push({ field: 'outputs', message: 'outputs must be a list of export formats.' });
  } else {
    outputs = [...new Set((data.outputs as string[]).map((o) => o.trim()))];
    const unknown = outputs.filter((o) => !(JOB_OUTPUT_FORMATS as readonly string[]).includes(o));
    if (unknown.length) errors.push({ field: 'outputs', message: `Unknown output format(s): ${unknown.join(', ')}. Allowed: ${JOB_OUTPUT_FORMATS.join(', ')}.` });
  }

  let designSystemId: string | undefined;
  if (data.designSystemId !== undefined) {
    if (typeof data.designSystemId !== 'string' || !data.designSystemId.trim()) errors.push({ field: 'designSystemId', message: 'designSystemId must be a non-empty string.' });
    else designSystemId = data.designSystemId.trim();
  }

  const sources = parseSources(data.sources, errors);
  const deliver = parseDeliver(data.deliver, errors);

  let checks: JobChecks = 'best-effort';
  if (data.checks !== undefined) checks = oneOf('checks', ['required', 'best-effort'] as const) ?? 'best-effort';

  let refresh: JobRefresh = 'design';
  if (data.refresh !== undefined) refresh = oneOf('refresh', ['data', 'design'] as const) ?? 'design';

  let rebuildOnSourceChange = true;
  if (data.rebuildOnSourceChange !== undefined) {
    if (typeof data.rebuildOnSourceChange !== 'boolean') errors.push({ field: 'rebuildOnSourceChange', message: 'rebuildOnSourceChange must be true or false.' });
    else rebuildOnSourceChange = data.rebuildOnSourceChange;
  }

  let previewUrl: string | undefined;
  if (data.preview !== undefined && data.preview !== null) {
    const url = typeof data.preview === 'object' ? (data.preview as { url?: unknown }).url : undefined;
    const extra = typeof data.preview === 'object' ? Object.keys(data.preview as object).filter((k) => k !== 'url') : [];
    if (typeof data.preview !== 'object' || extra.length) errors.push({ field: 'preview', message: 'preview must be { url: "<https://claude.ai/... artifact link>" }.' });
    else if (url !== undefined && url !== null && url !== '') {
      if (typeof url !== 'string' || !/^https:\/\/claude\.ai\//.test(url)) errors.push({ field: 'preview.url', message: "preview.url must be the private artifact's https://claude.ai/... link." });
      else previewUrl = url;
    }
  }

  let stateBranch = id ? defaultStateBranch(id) : '';
  if (data.cloud !== undefined && data.cloud !== null) {
    const branch = typeof data.cloud === 'object' ? (data.cloud as { stateBranch?: unknown }).stateBranch : undefined;
    const extra = typeof data.cloud === 'object' ? Object.keys(data.cloud as object).filter((k) => k !== 'stateBranch') : [];
    if (typeof data.cloud !== 'object' || extra.length) errors.push({ field: 'cloud', message: 'cloud must be { stateBranch: "<branch>" }.' });
    else if (branch !== undefined) {
      if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('/') || branch.includes('..')) {
        errors.push({ field: 'cloud.stateBranch', message: 'cloud.stateBranch must be a git branch name, e.g. claude/open-design-job-weekly-kpis.' });
      } else stateBranch = branch;
    }
  }

  const brief = body.trim();
  if (!brief) errors.push({ field: 'brief', message: 'The job file needs a brief: the Markdown after the frontmatter, saying what to make each period.' });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    job: {
      id: id!,
      title: title!,
      recipe: recipe!,
      period: period!,
      timezone: timezone!,
      mode: mode!,
      target: target!,
      outputs,
      designSystemId,
      sources,
      deliver,
      checks,
      refresh,
      rebuildOnSourceChange,
      previewUrl,
      stateBranch,
      brief,
    },
  };
}

/** Parses a job file's text: frontmatter, then the brief. */
export function parseJobFile(text: string, jobPath?: string): ParseJobResult {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (err) {
    return { ok: false, errors: [{ field: 'frontmatter', message: `The frontmatter isn't valid YAML: ${err instanceof Error ? err.message : String(err)}` }] };
  }
  if (!text.trimStart().startsWith('---')) {
    return { ok: false, errors: [{ field: 'frontmatter', message: 'The job file must start with YAML frontmatter between --- lines.' }] };
  }
  return validateJob((parsed.data ?? {}) as Record<string, unknown>, parsed.content, jobPath);
}

/** Reads and validates `<workspaceRoot>/<jobPath>`. */
export async function readJobFile(workspaceRoot: string, jobPath: string): Promise<ParseJobResult> {
  const rel = jobPath.replace(/\\/g, '/');
  if (!isWorkspacePath(rel)) return { ok: false, errors: [{ field: 'jobPath', message: `jobPath "${jobPath}" must be a workspace-relative path inside the workspace.` }] };
  if (!rel.endsWith(JOB_FILE_SUFFIX)) return { ok: false, errors: [{ field: 'jobPath', message: `jobPath must end in ${JOB_FILE_SUFFIX} (e.g. .open-design/jobs/weekly-kpis${JOB_FILE_SUFFIX}).` }] };
  let text: string;
  try {
    text = await fs.readFile(path.join(workspaceRoot, rel), 'utf8');
  } catch {
    return { ok: false, errors: [{ field: 'jobPath', message: `No job file at ${rel}.` }] };
  }
  return parseJobFile(text, rel);
}

export function formatJobErrors(jobPath: string, errors: JobFieldError[]): string {
  return `The job file ${jobPath} isn't valid, so nothing was run:\n${errors.map((e) => `- ${e.field}: ${e.message}`).join('\n')}`;
}

/** The target entry for a period: `{period}` replaced in series mode. */
export function resolveTarget(job: Pick<JobDefinition, 'target' | 'mode'>, periodKey: string): string {
  return job.mode === 'series' ? job.target.split(PERIOD_PLACEHOLDER).join(periodKey) : job.target;
}
