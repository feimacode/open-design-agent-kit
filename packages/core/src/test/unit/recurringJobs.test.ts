import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { decideSkip, type RunLog } from '../../jobs/runLog';
import { findEmptyFields, findPlaceholders, runJobChecks } from '../../jobs/jobChecks';
import { parseJobFile, publicDeliveryReason, resolveTarget } from '../../jobs/jobFile';
import { finishJobRun, startJobRun } from '../../jobs/jobRun';
import { isoWeek, periodKey } from '../../jobs/periodKey';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

function jobText(fields: Record<string, string>, body = 'Rebuild the weekly KPI deck from data/kpis.csv.'): string {
  return ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', '', body, ''].join('\n');
}

const BASE = {
  id: 'weekly-kpis',
  title: 'Weekly KPIs',
  recipe: 'open-design-deck-from-source',
  period: 'week',
  timezone: 'Europe/Berlin',
  mode: 'update',
  target: '.open-design/weekly-kpis/weekly-kpis.html',
  outputs: '[pdf]',
};
const JOB_PATH = '.open-design/jobs/weekly-kpis.job.md';

function errorFields(text: string, jobPath = JOB_PATH): string[] {
  const result = parseJobFile(text, jobPath);
  return result.ok ? [] : result.errors.map((e) => e.field);
}

describe('recurring jobs: job file', () => {
  it('accepts a valid weekly deck job with defaults', () => {
    const result = parseJobFile(jobText(BASE), JOB_PATH);
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(result.job.checks, 'best-effort');
    assert.strictEqual(result.job.rebuildOnSourceChange, true);
    assert.strictEqual(result.job.stateBranch, 'claude/open-design-job-weekly-kpis');
    assert.deepStrictEqual(result.job.deliver, [{ kind: 'preview' }]);
    assert.deepStrictEqual(result.job.outputs, ['pdf']);
  });

  it('refuses a missing timezone, naming it', () => {
    const rest: Record<string, string> = { ...BASE };
    delete rest.timezone;
    assert.deepStrictEqual(errorFields(jobText(rest)), ['timezone']);
  });

  it('refuses an unknown timezone', () => {
    assert.deepStrictEqual(errorFields(jobText({ ...BASE, timezone: 'Mars/Olympus' })), ['timezone']);
  });

  it('refuses a series target without {period}', () => {
    assert.deepStrictEqual(errorFields(jobText({ ...BASE, mode: 'series' })), ['target']);
  });

  it('refuses a connector source without a snapshot path', () => {
    const text = jobText({ ...BASE, sources: '\n  - connector: Pull signups from the Metrics sheet' });
    assert.deepStrictEqual(errorFields(text), ['sources']);
  });

  it('refuses public deliveries', () => {
    assert.deepStrictEqual(errorFields(jobText({ ...BASE, deliver: '[netlify]' })), ['deliver']);
    assert.deepStrictEqual(errorFields(jobText({ ...BASE, deliver: '\n  - connector: post to X' })), ['deliver']);
    assert.deepStrictEqual(errorFields(jobText({ ...BASE, deliver: '\n  - preview\n  - pr\n  - connector: Post the preview link to #design in Slack' })), []);
    assert.ok(publicDeliveryReason('deploy to GitHub Pages'));
    assert.strictEqual(publicDeliveryReason('Upload the PDF to my Google Drive folder'), undefined);
  });

  it('returns every problem by field, including unknown fields and a missing brief', () => {
    const fields = errorFields(jobText({ ...BASE, period: 'fortnight', outputs: '[pdf, tiff]', colour: 'red' }, ''));
    assert.deepStrictEqual(fields.sort(), ['brief', 'colour', 'outputs', 'period']);
  });

  it('requires the id to match the file name', () => {
    assert.deepStrictEqual(errorFields(jobText(BASE), '.open-design/jobs/other.job.md'), ['id']);
  });

  it('resolves series targets per period', () => {
    assert.strictEqual(resolveTarget({ mode: 'series', target: '.open-design/social-week/{period}/posts.html' }, '2026-W43'), '.open-design/social-week/2026-W43/posts.html');
  });
});

describe('recurring jobs: period key', () => {
  it('gives 2026-W43 for a weekly Berlin job on 21 Oct 2026', () => {
    assert.strictEqual(periodKey('week', 'Europe/Berlin', new Date('2026-10-21T09:00:00Z')), '2026-W43');
  });

  it('formats days and months', () => {
    assert.strictEqual(periodKey('day', 'Europe/Berlin', new Date('2026-10-21T09:00:00Z')), '2026-10-21');
    assert.strictEqual(periodKey('month', 'Europe/Berlin', new Date('2026-10-21T09:00:00Z')), '2026-10');
  });

  it('uses ISO week-numbering years at year boundaries', () => {
    assert.deepStrictEqual(isoWeek(2027, 1, 1), { year: 2026, week: 53 });
    assert.deepStrictEqual(isoWeek(2024, 12, 30), { year: 2025, week: 1 });
    assert.deepStrictEqual(isoWeek(2021, 1, 3), { year: 2020, week: 53 });
    assert.strictEqual(periodKey('week', 'UTC', new Date('2027-01-04T00:00:00Z')), '2027-W01');
  });

  it('uses the job time zone, not UTC, across midnight and New Year', () => {
    // Sunday 25 Oct 23:30 UTC is Monday 00:30 in Berlin (after the DST change).
    assert.strictEqual(periodKey('week', 'UTC', new Date('2026-10-25T23:30:00Z')), '2026-W43');
    assert.strictEqual(periodKey('week', 'Europe/Berlin', new Date('2026-10-25T23:30:00Z')), '2026-W44');
    assert.strictEqual(periodKey('month', 'Pacific/Auckland', new Date('2026-12-31T12:00:00Z')), '2027-01');
    assert.strictEqual(periodKey('day', 'America/Los_Angeles', new Date('2027-01-01T05:00:00Z')), '2026-12-31');
  });

  it('keeps the calendar day across DST changes', () => {
    assert.strictEqual(periodKey('day', 'Europe/Berlin', new Date('2026-03-29T00:30:00Z')), '2026-03-29');
    assert.strictEqual(periodKey('day', 'Europe/Berlin', new Date('2026-03-29T21:59:00Z')), '2026-03-29');
    assert.strictEqual(periodKey('day', 'Europe/Berlin', new Date('2026-03-29T22:00:00Z')), '2026-03-30');
    assert.strictEqual(periodKey('day', 'America/New_York', new Date('2026-11-01T05:30:00Z')), '2026-11-01');
  });
});

describe('recurring jobs: skip decision', () => {
  const job = { rebuildOnSourceChange: true, sources: [{ path: 'data/kpis.csv' }, { connector: 'pull', snapshot: 'data/snap.csv' }] };
  const log: RunLog = {
    version: 1,
    jobId: 'weekly-kpis',
    runs: [
      {
        runId: 'r1',
        periodKey: '2026-W43',
        status: 'completed',
        startedAt: '2026-10-19T08:00:00Z',
        finishedAt: '2026-10-19T08:10:00Z',
        target: 't.html',
        capabilities: { browser: false, cloud: true },
        sources: [
          { path: 'data/kpis.csv', sha256: 'a' },
          { path: 'data/snap.csv', sha256: 's' },
        ],
      },
    ],
  };
  const same = [
    { path: 'data/kpis.csv', sha256: 'a' },
    { path: 'data/snap.csv', sha256: 'old' },
  ];

  it('skips a completed period with unchanged workspace sources, ignoring snapshots', () => {
    const d = decideSkip({ job, log, periodKey: '2026-W43', currentSources: same });
    assert.ok(d.skip);
    assert.match(d.reason, /r1/);
  });

  it('runs a new period', () => {
    assert.strictEqual(decideSkip({ job, log, periodKey: '2026-W44', currentSources: same }).skip, false);
  });

  it('runs when a workspace source changed, listing it', () => {
    const d = decideSkip({ job, log, periodKey: '2026-W43', currentSources: [{ path: 'data/kpis.csv', sha256: 'b' }, same[1]] });
    assert.ok(!d.skip);
    assert.deepStrictEqual(d.changedSources, ['data/kpis.csv']);
  });

  it('skips a changed source when rebuildOnSourceChange is off, unless runNow', () => {
    const changed = [{ path: 'data/kpis.csv', sha256: 'b' }, same[1]];
    assert.ok(decideSkip({ job: { ...job, rebuildOnSourceChange: false }, log, periodKey: '2026-W43', currentSources: changed }).skip);
    const forced = decideSkip({ job: { ...job, rebuildOnSourceChange: false }, log, periodKey: '2026-W43', currentSources: changed, runNow: true });
    assert.ok(!forced.skip && forced.forced);
  });

  it('ignores runs that did not complete', () => {
    const failed: RunLog = { ...log, runs: [{ ...log.runs[0], status: 'needs-review' }] };
    assert.strictEqual(decideSkip({ job, log: failed, periodKey: '2026-W43', currentSources: same }).skip, false);
  });
});

describe('recurring jobs: browserless checks', () => {
  it('finds empty fields and placeholders', () => {
    const html = '<h1 data-od-field="headline"> </h1><p data-od-field="body">Hi</p><div data-od-field="photo"><img src="a.png"></div><img data-od-field="logo">';
    assert.deepStrictEqual(findEmptyFields(html).sort(), ['headline', 'logo']);
    assert.deepStrictEqual(findPlaceholders('<p>{{name}} TODO Lorem ipsum dolor</p><script>// TODO</script>'), ['{{', 'TODO', 'Lorem ipsum']);
    assert.deepStrictEqual(findPlaceholders('<p>All done</p><!-- TODO -->'), []);
  });

  it('reports a missing referenced image by path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-job-checks-'));
    const entry = '.open-design/deck/deck.html';
    await fs.mkdir(path.join(root, '.open-design/deck'), { recursive: true });
    await fs.writeFile(path.join(root, entry), '<!doctype html><h1 data-od-field="headline">Q3</h1><img src="img/chart.png">');
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Deck' } });
    const findings = await runJobChecks({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, preview: true });
    const missing = findings.find((f) => f.code === 'missing-file');
    assert.ok(missing && missing.severity === 'error');
    assert.match(missing.message, /img\/chart\.png/);
  });
});

describe('recurring jobs: start and finish', () => {
  async function workspace(fields: Record<string, string> = {}): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-job-run-'));
    await fs.mkdir(path.join(root, '.open-design/jobs'), { recursive: true });
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(path.join(root, 'data/kpis.csv'), 'metric,value\nsignups,4210\n');
    await fs.writeFile(path.join(root, JOB_PATH), jobText({ ...BASE, sources: '[data/kpis.csv]', ...fields }));
    return root;
  }
  const ctx = (root: string, extra: { browser?: boolean; cloud?: boolean } = {}) => ({
    workspaceRoot: root,
    outputDir: '.open-design',
    env: extra.cloud ? { CLAUDE_CODE_REMOTE: 'true' } : {},
    now: new Date('2026-10-21T09:00:00Z'),
    hasBrowser: async () => extra.browser ?? false,
  });
  async function writeEntry(root: string, entry: string): Promise<void> {
    await fs.mkdir(path.join(root, path.dirname(entry)), { recursive: true });
    await fs.writeFile(path.join(root, entry), '<!doctype html><h1 data-od-field="headline">Signups 4,210</h1>');
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'deck', renderer: 'deck-html', exports: ['html'], title: 'KPIs' } });
  }

  it('leaves out the check and captures without a browser, and records the PDF as skipped', async () => {
    const root = await workspace();
    const start = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(start.ok && start.action === 'run');
    assert.strictEqual(start.periodKey, '2026-W43');
    assert.deepStrictEqual(start.capabilities, { browser: false, cloud: false });
    assert.deepStrictEqual(start.outputs.skip, [{ output: 'pdf', reason: 'no-browser' }]);
    assert.ok(!start.steps.some((s) => s.includes('check_open_design_artifact')));
    assert.ok(!start.steps.some((s) => s.includes('format "pdf"')));

    await writeEntry(root, BASE.target);
    const finish = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: start.runId, status: 'completed', outputs: { written: [BASE.target] } });
    assert.ok(finish.ok);
    assert.strictEqual(finish.status, 'completed');
    assert.deepStrictEqual(finish.record.outputs?.skipped, [{ output: 'pdf', reason: 'no-browser' }]);
    assert.match(finish.summary, /2026-W43/);
    assert.match(finish.summary, /Skipped pdf \(no browser/);

    const log = JSON.parse(await fs.readFile(path.join(root, '.open-design/jobs/weekly-kpis.runs.json'), 'utf8'));
    assert.strictEqual(log.runs[0].status, 'completed');
    assert.strictEqual(log.runs[0].periodKey, '2026-W43');

    const again = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(again.ok && again.action === 'skip');
  });

  it('records needs-review for required checks without a browser, and holds back shared delivery', async () => {
    const root = await workspace({ checks: 'required', deliver: '\n  - preview\n  - pr\n  - connector: Post the preview link to #design in Slack' });
    const start = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(start.ok && start.action === 'run');
    await writeEntry(root, BASE.target);
    const finish = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: start.runId, status: 'completed', outputs: { written: [BASE.target] } });
    assert.ok(finish.ok);
    assert.strictEqual(finish.status, 'needs-review');
    assert.strictEqual(finish.sharedDelivery, false);
    assert.ok(finish.next.some((s) => s.startsWith("Don't open or update the pull request")));
    assert.ok(finish.next.some((s) => s.startsWith("Don't deliver")));
  });

  it('downgrades a completed run with check errors to needs-review', async () => {
    const root = await workspace();
    const start = await startJobRun(ctx(root, { browser: true }), { jobPath: JOB_PATH });
    assert.ok(start.ok && start.action === 'run');
    assert.ok(start.steps.some((s) => s.includes('check_open_design_artifact')));
    const finish = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: start.runId, status: 'completed' });
    assert.ok(finish.ok);
    assert.strictEqual(finish.status, 'needs-review');
    assert.ok(finish.findings.some((f) => f.code === 'entry-missing'));
  });

  it('refuses an unknown run id and writes nothing', async () => {
    const root = await workspace();
    const result = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: 'nope', status: 'completed' });
    assert.ok(!result.ok);
    await assert.rejects(fs.access(path.join(root, '.open-design/jobs/weekly-kpis.runs.json')));
  });

  it('asks a cloud run to check out the state branch first, then runs on it', async () => {
    const root = await workspace();
    await fs.mkdir(path.join(root, '.git'), { recursive: true });
    await fs.writeFile(path.join(root, '.git/HEAD'), 'ref: refs/heads/main\n');
    const first = await startJobRun(ctx(root, { cloud: true }), { jobPath: JOB_PATH });
    assert.ok(first.ok && first.action === 'checkout-state-branch');
    assert.strictEqual(first.stateBranch, 'claude/open-design-job-weekly-kpis');
    assert.deepStrictEqual(first.capabilities, { browser: false, cloud: true });
    await fs.writeFile(path.join(root, '.git/HEAD'), 'ref: refs/heads/claude/open-design-job-weekly-kpis\n');
    const second = await startJobRun(ctx(root, { cloud: true }), { jobPath: JOB_PATH });
    assert.ok(second.ok && second.action === 'run');
    await writeEntry(root, BASE.target);
    const finish = await finishJobRun(ctx(root, { cloud: true }), { jobPath: JOB_PATH, runId: second.runId, status: 'completed', outputs: { written: [BASE.target] } });
    assert.ok(finish.ok);
    assert.match(finish.next[0], /git push -u origin claude\/open-design-job-weekly-kpis/);
  });

  it('keeps one file per period in series mode', async () => {
    const root = await workspace({ mode: 'series', target: '.open-design/social-week/{period}/posts.html', outputs: '[]' });
    for (const at of ['2026-10-21T09:00:00Z', '2026-10-28T09:00:00Z']) {
      const c = { ...ctx(root), now: new Date(at) };
      const start = await startJobRun(c, { jobPath: JOB_PATH });
      assert.ok(start.ok && start.action === 'run');
      await writeEntry(root, start.target.entryPath);
      const finish = await finishJobRun(c, { jobPath: JOB_PATH, runId: start.runId, status: 'completed', outputs: { written: [start.target.entryPath] } });
      assert.ok(finish.ok && finish.status === 'completed', JSON.stringify(finish));
    }
    await fs.access(path.join(root, '.open-design/social-week/2026-W43/posts.html'));
    await fs.access(path.join(root, '.open-design/social-week/2026-W44/posts.html'));
  });

  it('republishes a recorded preview link', async () => {
    const root = await workspace({ preview: '\n  url: https://claude.ai/artifact/abc123' });
    const start = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(start.ok && start.action === 'run');
    const preview = start.steps.find((s) => s.startsWith('Preview:'));
    assert.ok(preview && preview.includes('https://claude.ai/artifact/abc123') && preview.includes('claude-artifact'));
  });
});

describe('recurring jobs: data-only refresh (add-refreshable-dashboards)', () => {
  const DASH = '.open-design/kpis/dashboard.html';
  const ctx = (root: string, now = '2026-11-25T09:00:00Z') => ({
    workspaceRoot: root,
    outputDir: '.open-design',
    env: {},
    now: new Date(now),
    hasBrowser: async () => false,
  });
  async function workspace(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-job-refresh-'));
    await fs.mkdir(path.join(root, '.open-design/jobs'), { recursive: true });
    await fs.mkdir(path.join(root, '.open-design/kpis'), { recursive: true });
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(path.join(root, 'data/kpis.csv'), 'week,revenue\n2026-11-09,110000\n2026-11-16,116000\n');
    await fs.writeFile(path.join(root, '.open-design/kpis/dashboard.data.json'), JSON.stringify({ locale: 'en-US', currency: 'USD', kpis: { from: 'data/kpis.csv' } }));
    await fs.writeFile(
      path.join(root, DASH),
      '<!doctype html><html><body><p>As of <span data-od-bind="asOf" data-od-format="date">1 Jan</span></p><div class="card"><div data-od-chart="kpi" data-od-data="kpis" data-od-x="week" data-od-y="revenue" data-od-format="currency" data-od-title="Revenue"></div></div></body></html>',
    );
    await writeArtifactManifest({ workspaceRoot: root, entryPath: DASH, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'KPIs' } });
    await fs.writeFile(path.join(root, JOB_PATH), jobText({ ...BASE, target: DASH, outputs: '[]', refresh: 'data', sources: '[data/kpis.csv]' }, 'Refresh the weekly KPI dashboard.'));
    return root;
  }

  it('parses refresh and defaults it to design', () => {
    const base = parseJobFile(jobText(BASE), JOB_PATH);
    assert.ok(base.ok && base.job.refresh === 'design');
    assert.deepStrictEqual(errorFields(jobText({ ...BASE, refresh: 'sometimes' })), ['refresh']);
  });

  it('swaps the data, keeps the page, sets asOf and reports KPI changes', async () => {
    const root = await workspace();
    const first = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(first.ok && first.action === 'run');
    assert.ok(first.steps.some((s) => s.startsWith('Refresh the data only')), first.steps.join('\n'));
    assert.ok(!first.steps.some((s) => s.startsWith('Design:')));
    const data = JSON.parse(await fs.readFile(path.join(root, '.open-design/kpis/dashboard.data.json'), 'utf8'));
    assert.strictEqual(data.asOf, '2026-11-29', 'end of ISO week 48');
    const done = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: first.runId, status: 'completed' });
    assert.ok(done.ok);
    assert.strictEqual(done.status, 'completed', JSON.stringify(done.ok && done.findings));
    assert.match(done.summary, /KPIs: Revenue \$116,000\.00\./);

    await fs.writeFile(path.join(root, 'data/kpis.csv'), 'week,revenue\n2026-11-16,116000\n2026-11-23,121000\n');
    const second = await startJobRun(ctx(root, '2026-12-01T09:00:00Z'), { jobPath: JOB_PATH });
    assert.ok(second.ok && second.action === 'run');
    const again = await finishJobRun(ctx(root, '2026-12-01T09:00:00Z'), { jobPath: JOB_PATH, runId: second.runId, status: 'completed' });
    assert.ok(again.ok);
    assert.match(again.summary, /Revenue \$121,000\.00, up 4\.3% from the last run/);
  });

  it('ends needs-review when the page was edited', async () => {
    const root = await workspace();
    const start = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(start.ok && start.action === 'run');
    await fs.appendFile(path.join(root, DASH), '<p>new section</p>');
    const finish = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: start.runId, status: 'completed' });
    assert.ok(finish.ok);
    assert.strictEqual(finish.status, 'needs-review');
    assert.ok(finish.findings.some((f) => f.code === 'refresh-edited-page'));
    assert.strictEqual(finish.sharedDelivery, false);
  });

  it('stops on a renamed column', async () => {
    const root = await workspace();
    await fs.writeFile(path.join(root, 'data/kpis.csv'), 'week,Revenue (USD)\n2026-11-16,116000\n');
    const start = await startJobRun(ctx(root), { jobPath: JOB_PATH });
    assert.ok(start.ok && start.action === 'run');
    assert.ok(start.steps.some((s) => s.startsWith("Stop: this period's data doesn't fit the design") && s.includes('"revenue"') && s.includes('Revenue (USD)')), start.steps.join('\n'));
    const finish = await finishJobRun(ctx(root), { jobPath: JOB_PATH, runId: start.runId, status: 'needs-review' });
    assert.ok(finish.ok);
    assert.ok(finish.findings.some((f) => f.code === 'data-shape-changed'));
  });
});
