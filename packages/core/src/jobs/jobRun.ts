// start_open_design_job_run and finish_open_design_job_run (design D2): the
// bookkeeping an unattended run gets wrong, so the agent only does the
// design. Start validates the job, works out the period, decides whether to
// skip, probes the run's capabilities and returns the ordered steps; finish
// runs the browserless checks, settles the status and writes the run record.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { findBrowser } from '../export/browserDiscovery';
import { findStaleSources, recordedSources } from '../generation/sourceNumberCheck';
import { readArtifact } from '../vendored/artifactCreate';
import { CLAUDE_ARTIFACT_PROVIDER, latestShareFor, readShareRecords } from '../workspace/shareRecords';
import { runJobChecks } from './jobChecks';
import { changedPageFiles, dataShapeFindings, hashPage, kpiChangeSummary, kpiValues, pageFiles, setAsOf } from './dataRefresh';
import { CAPTURE_OUTPUT_FORMATS, formatJobErrors, readJobFile, resolveTarget, runLogPathFor, type JobDefinition } from './jobFile';
import { periodKey as computePeriodKey } from './periodKey';
import {
  decideSkip,
  hashSources,
  newRunId,
  readRunLog,
  sourcePaths,
  upsertRun,
  writeRunLog,
  type JobCheckFinding,
  type RunOutputSkipped,
  type RunRecord,
  type RunStatus,
} from './runLog';

export interface JobCapabilities {
  browser: boolean;
  cloud: boolean;
}

export interface JobRunContext {
  workspaceRoot: string;
  outputDir: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  /** Injected for tests; defaults to findBrowser(). */
  hasBrowser?: () => Promise<boolean>;
}

/** The capability probe (design D6): a browser found the way export finds one, and CLAUDE_CODE_REMOTE. */
export async function probeJobCapabilities(ctx: Pick<JobRunContext, 'env' | 'hasBrowser'>): Promise<JobCapabilities> {
  const env = ctx.env ?? process.env;
  const browser = ctx.hasBrowser ? await ctx.hasBrowser() : (await findBrowser({ env })).ok;
  return { browser, cloud: env.CLAUDE_CODE_REMOTE === 'true' };
}

/** The checked-out branch, or undefined when it can't be read (no repo, detached HEAD). */
export async function currentGitBranch(workspaceRoot: string): Promise<string | undefined> {
  try {
    let gitDir = path.join(workspaceRoot, '.git');
    const stat = await fs.stat(gitDir);
    if (stat.isFile()) {
      const pointer = (await fs.readFile(gitDir, 'utf8')).match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
      if (!pointer) return undefined;
      gitDir = path.resolve(workspaceRoot, pointer);
    }
    const head = (await fs.readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
    return head.match(/^ref:\s*refs\/heads\/(.+)$/)?.[1];
  } catch {
    return undefined;
  }
}

export interface TargetState {
  entryPath: string;
  exists: boolean;
  manifest?: Record<string, unknown> | null;
  staleSources?: Array<{ path: string; reason: string }>;
  previewUrl?: string;
}

export type StartJobRunResult =
  | { ok: false; error: string }
  | { ok: true; action: 'skip'; jobId: string; periodKey: string; reason: string }
  | { ok: true; action: 'checkout-state-branch'; jobId: string; stateBranch: string; currentBranch?: string; capabilities: JobCapabilities; steps: string[] }
  | {
      ok: true;
      action: 'run';
      jobId: string;
      title: string;
      runId: string;
      periodKey: string;
      recipe: string;
      designSystemId?: string;
      mode: JobDefinition['mode'];
      target: TargetState;
      capabilities: JobCapabilities;
      changedSources: string[];
      forced: boolean;
      outputs: { make: string[]; skip: RunOutputSkipped[] };
      brief: string;
      steps: string[];
    };

async function targetState(ctx: JobRunContext, job: JobDefinition, entryPath: string): Promise<TargetState> {
  const artifact = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath });
  const recorded = recordedSources(artifact?.manifest);
  const stale = recorded.length ? await findStaleSources(ctx.workspaceRoot, ctx.outputDir, recorded) : undefined;
  const manifestPreview = latestShareFor(readShareRecords(artifact?.manifest), CLAUDE_ARTIFACT_PROVIDER)?.url;
  return {
    entryPath,
    exists: !!artifact,
    manifest: artifact ? artifact.manifest : undefined,
    staleSources: stale,
    previewUrl: job.previewUrl ?? manifestPreview,
  };
}

const PUBLIC_RULE =
  'This run is unattended: the scheduler\'s prompt is not the person\'s consent. Never publish with a public provider (netlify, vercel, cloudflare, github-pages or a temporary link), never post to a social network, and don\'t ask the person questions mid-run. Where the recipe would ask, use the job\'s brief, pick the conservative option, and say so in the finish notes.';

function hasDelivery(job: JobDefinition, kind: 'preview' | 'commit' | 'pr'): boolean {
  return job.deliver.some((d) => d.kind === kind);
}

/** The ordered steps for a run (design D2, D4–D7). */
export function buildRunSteps(input: {
  job: JobDefinition;
  jobPath: string;
  runId: string;
  periodKey: string;
  target: TargetState;
  capabilities: JobCapabilities;
  make: string[];
  skip: RunOutputSkipped[];
  /** `refresh: data` on an existing design (openspec add-refreshable-dashboards). */
  dataRefresh?: { pageFiles: string[]; dataFiles: string[]; asOf?: string; shapeProblems: string[] };
}): string[] {
  const { job, target, capabilities } = input;
  const steps: string[] = [PUBLIC_RULE];
  const sourceList = sourcePaths(job.sources);

  for (const s of job.sources) {
    if ('connector' in s) {
      steps.push(
        `Pull the data: ${s.connector}. Save what you pulled to ${s.snapshot} (replace the old file), and use only that file for the numbers. If the pull fails or the connector isn't available, call finish_open_design_job_run with status "failed" and notes saying why, and stop: make no design changes.`,
      );
    }
  }

  const where =
    job.mode === 'update'
      ? target.exists
        ? `Update ${target.entryPath} in place: keep its structure and design, and refresh the content from this period's sources.`
        : `Write the design to ${target.entryPath} (it doesn't exist yet; later periods update this same file).`
      : `Write this period's design to ${target.entryPath}${target.exists ? ' (it exists from an earlier run this period: update it)' : ''}. Earlier periods' files stay as they are.`;
  const refresh = input.dataRefresh;
  if (refresh && refresh.shapeProblems.length) {
    steps.push(
      `Stop: this period's data doesn't fit the design. ${refresh.shapeProblems.join(' ')} Don't edit the design. Call finish_open_design_job_run with jobPath ${input.jobPath}, runId ${input.runId}, status "needs-review" and notes naming what changed in the data, then follow the steps it returns.`,
    );
    return steps;
  }
  if (refresh) {
    steps.push(
      `Refresh the data only (refresh: data): update ${refresh.dataFiles.length ? refresh.dataFiles.join(', ') : 'the design\'s data files'} from this period's sources, replacing the rows and keeping the column names. Don't edit ${refresh.pageFiles.join(', ')}: the charts and bound numbers redraw from the data, and finish_open_design_job_run reports any edit to those files as refresh-edited-page.${refresh.asOf ? ` The data file's asOf is set to ${refresh.asOf}; if the new data has a later date, set asOf to it.` : ''} Then register ${target.entryPath} again with register_open_design_artifact and the same sources.`,
    );
  } else steps.push(
    `Design: follow the ${job.recipe} recipe (its skill or MCP prompt) for the brief below, for period ${input.periodKey}. ${where}${job.designSystemId ? ` Use designSystemId "${job.designSystemId}".` : ''}${sourceList.length ? ` Pass sources ${JSON.stringify(sourceList)} to prepare_open_design_brief and register_open_design_artifact, and use only what they contain.` : ''} Register the result with register_open_design_artifact at ${target.entryPath}.`,
  );

  if (capabilities.browser) {
    steps.push(`Check: call check_open_design_artifact on ${target.entryPath} and fix every error it reports before exporting.`);
  }

  for (const format of input.make.filter((f) => f !== 'html')) {
    steps.push(`Export: call export_open_design_artifact with entryPath ${target.entryPath} and format "${format}".`);
  }
  if (input.skip.length) {
    steps.push(`Don't export ${input.skip.map((s) => s.output).join(', ')}: no browser was found for this run. finish_open_design_job_run records them as skipped: no-browser.`);
  }

  if (hasDelivery(job, 'preview')) {
    const url = target.previewUrl;
    steps.push(
      url
        ? `Preview: if you have an Artifact tool, republish the job's private preview to the same link. First call publish_open_design_artifact with entryPath ${target.entryPath} and published: { provider: "${CLAUDE_ARTIFACT_PROVIDER}", url: "${url}" } (skip this if get_open_design_artifact already shows that previewUrl), then call it with provider "${CLAUDE_ARTIFACT_PROVIDER}" and follow its instructions, publishing to ${url}. Never create a second artifact for this job. Without an Artifact tool, report "preview" as not made with reason "no-artifact-tool".`
        : `Preview: if you have an Artifact tool, call publish_open_design_artifact with entryPath ${target.entryPath} and provider "${CLAUDE_ARTIFACT_PROVIDER}", follow its instructions, and record the link. Then add it to the job file's frontmatter as preview: { url: "<link>" }, so every later run republishes the same artifact. Without an Artifact tool, report "preview" as not made with reason "no-artifact-tool".`,
    );
  }

  steps.push(
    `Finish: call finish_open_design_job_run with jobPath ${input.jobPath}, runId ${input.runId}, status ("completed" when the design is done, "failed" when it couldn't be made), outputs.written (the workspace paths you wrote) and outputs.notMade ({ output, reason } for anything you didn't make), and short notes. Then follow the steps it returns.`,
  );
  return steps;
}

function checkoutSteps(stateBranch: string): string[] {
  return [
    `This is a cloud run, so the run log and earlier outputs live on the job's state branch, ${stateBranch}, not on the branch you're on. Run \`git fetch origin ${stateBranch}\`. If it exists, run \`git checkout ${stateBranch}\` and then merge the default branch into it (\`git merge --no-edit origin/HEAD\`, or origin/main), so edits to the job file reach this run. If it doesn't exist (the job's first cloud run), run \`git checkout -b ${stateBranch}\`.`,
    'Then call start_open_design_job_run again with the same arguments.',
  ];
}

export async function startJobRun(ctx: JobRunContext, input: { jobPath: string; runNow?: boolean }): Promise<StartJobRunResult> {
  const parsed = await readJobFile(ctx.workspaceRoot, input.jobPath);
  if (!parsed.ok) return { ok: false, error: formatJobErrors(input.jobPath, parsed.errors) };
  const job = parsed.job;
  const jobPath = input.jobPath.replace(/\\/g, '/');
  const capabilities = await probeJobCapabilities(ctx);

  if (capabilities.cloud) {
    const branch = await currentGitBranch(ctx.workspaceRoot);
    if (branch !== job.stateBranch) {
      return { ok: true, action: 'checkout-state-branch', jobId: job.id, stateBranch: job.stateBranch, currentBranch: branch, capabilities, steps: checkoutSteps(job.stateBranch) };
    }
  }

  const key = computePeriodKey(job.period, job.timezone, ctx.now ?? new Date());
  const runLogPath = runLogPathFor(jobPath, job.id);
  const log = await readRunLog(ctx.workspaceRoot, runLogPath, job.id);
  const currentSources = await hashSources(ctx.workspaceRoot, sourcePaths(job.sources));
  const decision = decideSkip({ job, log, periodKey: key, currentSources, runNow: input.runNow });
  if (decision.skip) return { ok: true, action: 'skip', jobId: job.id, periodKey: key, reason: decision.reason };

  const entryPath = resolveTarget(job, key);
  const target = await targetState(ctx, job, entryPath);
  const make = job.outputs.filter((f) => capabilities.browser || !CAPTURE_OUTPUT_FORMATS.has(f));
  const skip = job.outputs.filter((f) => !capabilities.browser && CAPTURE_OUTPUT_FORMATS.has(f)).map((output) => ({ output, reason: 'no-browser' }));
  const runId = newRunId();
  // refresh: data on a design that already exists: keep the page, swap the data (openspec add-refreshable-dashboards).
  let dataRefresh: { pageFiles: string[]; dataFiles: string[]; asOf?: string; shapeProblems: string[] } | undefined;
  let pageHashes: Record<string, string> | undefined;
  let asOf: string | undefined;
  if (job.refresh === 'data' && target.exists) {
    const pulled = job.sources.some((s) => 'connector' in s);
    asOf = (await setAsOf(ctx.workspaceRoot, entryPath, key))?.asOf;
    const shape = pulled ? [] : await dataShapeFindings(ctx.workspaceRoot, entryPath);
    pageHashes = await hashPage(ctx.workspaceRoot, entryPath);
    const dataFiles = sourcePaths(job.sources).filter((p) => !/\.html?$/i.test(p));
    dataRefresh = { pageFiles: await pageFiles(ctx.workspaceRoot, entryPath), dataFiles, asOf, shapeProblems: shape.map((f) => f.message) };
  }
  const record: RunRecord = {
    runId,
    periodKey: key,
    status: 'started',
    startedAt: (ctx.now ?? new Date()).toISOString(),
    target: entryPath,
    capabilities,
    ...(input.runNow ? { runNow: true } : {}),
    sources: currentSources,
    ...(pageHashes ? { pageHashes } : {}),
    ...(asOf ? { asOf } : {}),
  };
  await writeRunLog(ctx.workspaceRoot, runLogPath, upsertRun(log, record));

  return {
    ok: true,
    action: 'run',
    jobId: job.id,
    title: job.title,
    runId,
    periodKey: key,
    recipe: job.recipe,
    designSystemId: job.designSystemId,
    mode: job.mode,
    target,
    capabilities,
    changedSources: decision.changedSources,
    forced: decision.forced,
    outputs: { make, skip },
    brief: job.brief,
    steps: buildRunSteps({ job, jobPath, runId, periodKey: key, target, capabilities, make, skip, dataRefresh }),
  };
}

export function formatStartJobRunResult(result: StartJobRunResult): string {
  if (!result.ok) return result.error;
  if (result.action === 'skip') return `skip: ${result.reason}\n\nNothing to do this run: report that in one line and make no changes.`;
  if (result.action === 'checkout-state-branch') {
    return `Not started yet: check out the state branch first.\n\n${result.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  }
  const { steps, brief, ...rest } = result;
  return [
    `Run ${result.runId} of "${result.title}" for ${result.periodKey} started. Follow the steps in order.`,
    '',
    '## Steps',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Brief',
    brief,
    '',
    '## Run',
    JSON.stringify({ ...rest, target: { ...rest.target, manifest: rest.target.manifest ? '(registered)' : rest.target.manifest } }, null, 2),
  ].join('\n');
}

export interface FinishJobRunInput {
  jobPath: string;
  runId: string;
  status: 'completed' | 'needs-review' | 'failed';
  outputs?: { written?: string[]; notMade?: RunOutputSkipped[] };
  notes?: string;
}

export type FinishJobRunResult =
  | { ok: false; error: string }
  | {
      ok: true;
      status: Exclude<RunStatus, 'started'>;
      record: RunRecord;
      findings: JobCheckFinding[];
      sharedDelivery: boolean;
      summary: string;
      next: string[];
    };

function buildSummary(job: JobDefinition, record: RunRecord, previewUrl: string | undefined): string {
  const written = record.outputs?.written ?? [];
  const skipped = record.outputs?.skipped ?? [];
  const errors = (record.findings ?? []).filter((f) => f.severity === 'error');
  const warnings = (record.findings ?? []).filter((f) => f.severity === 'warning');
  const parts = [`${job.title}, ${record.periodKey}: ${record.status}.`];
  parts.push(written.length ? `Made ${written.join(', ')}.` : 'Nothing was written.');
  if (skipped.length) parts.push(`Skipped ${skipped.map((s) => `${s.output} (${s.reason === 'no-browser' ? 'no browser in this run' : s.reason})`).join(', ')}.`);
  if (errors.length || warnings.length) {
    parts.push(`Checks: ${[...errors, ...warnings].map((f) => `${f.severity === 'error' ? 'error' : 'warning'}: ${f.message}`).join(' ')}`);
  } else parts.push(record.capabilities.browser ? 'Browserless checks passed.' : 'Browserless checks passed; the visual check needs a browser and was not run.');
  if (previewUrl) parts.push(`Preview: ${previewUrl}`);
  if (record.notes) parts.push(`Notes: ${record.notes}`);
  return parts.join(' ');
}

function finishSteps(job: JobDefinition, record: RunRecord, sharedDelivery: boolean, previewUrl: string | undefined): string[] {
  const next: string[] = [];
  const runLog = '(the run log next to the job file)';
  if (record.capabilities.cloud) {
    next.push(
      `Commit the run log ${runLog} and the files this run wrote to ${job.stateBranch}, and push it (\`git push -u origin ${job.stateBranch}\`). This branch holds the job's state between cloud runs, so push it whatever the status.`,
    );
  } else if (hasDelivery(job, 'commit') && sharedDelivery) {
    next.push(`Commit the run log ${runLog} and the files this run wrote, with a message naming the job and ${record.periodKey}.`);
  }
  if (hasDelivery(job, 'pr')) {
    next.push(
      sharedDelivery
        ? `Open a pull request from ${job.stateBranch} to the default branch (or update the open one) with the summary below as its description.`
        : `Don't open or update the pull request: the run ended ${record.status}.`,
    );
  }
  for (const d of job.deliver) {
    if (d.kind !== 'connector') continue;
    next.push(sharedDelivery ? `Deliver: ${d.instruction}. Include the summary below${previewUrl ? ` and the preview link ${previewUrl}` : ''}.` : `Don't deliver "${d.instruction}": the run ended ${record.status}, so a person should look first.`);
  }
  next.push('Reply with the summary below, in one paragraph.');
  return next;
}

export async function finishJobRun(ctx: JobRunContext, input: FinishJobRunInput): Promise<FinishJobRunResult> {
  const parsed = await readJobFile(ctx.workspaceRoot, input.jobPath);
  if (!parsed.ok) return { ok: false, error: formatJobErrors(input.jobPath, parsed.errors) };
  const job = parsed.job;
  if (!['completed', 'needs-review', 'failed'].includes(input.status)) return { ok: false, error: 'status must be completed, needs-review or failed.' };
  const runLogPath = runLogPathFor(input.jobPath.replace(/\\/g, '/'), job.id);
  const log = await readRunLog(ctx.workspaceRoot, runLogPath, job.id);
  const started = log.runs.find((r) => r.runId === input.runId);
  if (!started) return { ok: false, error: `No run ${input.runId} was started for job ${job.id}. Call start_open_design_job_run first. Nothing was recorded.` };
  if (started.status !== 'started') return { ok: false, error: `Run ${input.runId} already finished (${started.status}). Nothing was recorded.` };

  const findings = input.status === 'failed' ? [] : await runJobChecks({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, entryPath: started.target, preview: hasDelivery(job, 'preview') });

  const written: string[] = [];
  for (const p of input.outputs?.written ?? []) {
    const rel = p.replace(/\\/g, '/');
    try {
      await fs.access(path.join(ctx.workspaceRoot, rel));
      written.push(rel);
    } catch {
      findings.push({ severity: 'error', code: 'output-missing', message: `${rel} was reported as written but doesn't exist.` });
    }
  }
  // refresh: data: the page must be unchanged, and the data must still fit it.
  if (job.refresh === 'data' && started.pageHashes && input.status !== 'failed') {
    const changed = await changedPageFiles(ctx.workspaceRoot, started.target, started.pageHashes);
    if (changed.length) {
      findings.push({ severity: 'error', code: 'refresh-edited-page', message: `This is a data-only refresh, but the design changed: ${changed.join(', ')}. A person should look; restore the files if the change wasn't meant.` });
    }
    findings.push(...(await dataShapeFindings(ctx.workspaceRoot, started.target)));
  }
  const kpis = input.status === 'failed' ? [] : await kpiValues(ctx.workspaceRoot, started.target);
  const skipped: RunOutputSkipped[] = [...(input.outputs?.notMade ?? [])].filter((s) => s && typeof s.output === 'string').map((s) => ({ output: s.output, reason: s.reason || 'not given' }));
  if (!started.capabilities.browser) {
    for (const f of job.outputs) if (CAPTURE_OUTPUT_FORMATS.has(f) && !skipped.some((s) => s.output === f)) skipped.push({ output: f, reason: 'no-browser' });
  }

  let status: Exclude<RunStatus, 'started'> = input.status;
  if (status === 'completed' && findings.some((f) => f.severity === 'error')) status = 'needs-review';
  if (status === 'completed' && job.checks === 'required' && !started.capabilities.browser) {
    status = 'needs-review';
    findings.push({ severity: 'warning', code: 'no-visual-check', message: 'checks: required, and this run had no browser for the visual check, so a person should look before it goes further.' });
  }

  const artifact = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath: started.target });
  const previewUrl = job.previewUrl ?? latestShareFor(readShareRecords(artifact?.manifest), CLAUDE_ARTIFACT_PROVIDER)?.url;

  const record: RunRecord = {
    ...started,
    status,
    finishedAt: (ctx.now ?? new Date()).toISOString(),
    sources: await hashSources(ctx.workspaceRoot, sourcePaths(job.sources)),
    outputs: { written, skipped },
    findings,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(kpis.length ? { kpis } : {}),
  };
  await writeRunLog(ctx.workspaceRoot, runLogPath, upsertRun(log, record));

  const sharedDelivery = status === 'completed';
  const lastCompleted = log.runs.filter((r) => r.runId !== record.runId && r.status === 'completed' && r.kpis?.length).sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? '')).pop();
  const kpiLine = kpiChangeSummary(kpis, lastCompleted?.kpis);
  const summary = `${buildSummary(job, record, previewUrl)}${kpiLine ? ` ${kpiLine}` : ''}`;
  const next = finishSteps(job, record, sharedDelivery, previewUrl);
  if (!job.previewUrl && previewUrl) next.unshift(`Add preview: { url: "${previewUrl}" } to the frontmatter of ${input.jobPath}, so later runs republish the same artifact.`);
  return { ok: true, status, record, findings, sharedDelivery, summary, next };
}

export function formatFinishJobRunResult(result: FinishJobRunResult): string {
  if (!result.ok) return result.error;
  return [
    `Run ${result.record.runId} recorded as ${result.status}.`,
    '',
    '## Next',
    ...result.next.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Summary',
    result.summary,
    '',
    '## Run record',
    JSON.stringify(result.record, null, 2),
  ].join('\n');
}
