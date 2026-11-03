import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeFlowSection, validateFlowPlan, type FlowPlan } from '../../generation/flowPlan';
import { composeInstructions } from '../../generation/composeInstructions';
import { analyzeFlow, taskFindings, taskPathsOf, type FoundLink } from '../../export/flowCheck';
import { flowMapHtml } from '../../export/flowMap';
import { buildCritiqueInput } from '../../workspace/critique';
import { validateCritique } from '../../workspace/critiqueTypes';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const PLAN: FlowPlan = {
  screens: [
    { id: 'billing', title: 'Billing' },
    { id: 'plans', title: 'Plans' },
    { id: 'confirm', title: 'Confirm' },
    { id: 'plan-changed', title: 'Plan changed', end: true },
  ],
  links: [
    { from: 'billing', trigger: 'Change plan', to: 'plans' },
    { from: 'plans', trigger: 'Choose Team', to: 'confirm' },
    { from: 'confirm', trigger: 'Confirm', to: 'plan-changed' },
  ],
  tasks: [{ name: 'Change plan to Team', start: 'billing', end: 'plan-changed', maxSteps: 3 }],
};

const link = (from: string, to: string, trigger = to): FoundLink => ({ from, to, trigger, broken: false, target: `${to}.html` });
const page = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const a = (to: string, label: string) => `<a href="${to}.html" data-od-goto="${to}">${label}</a>`;

describe('task walkthrough: plan', () => {
  it('validates tasks against the planned screens', () => {
    const ok = validateFlowPlan({ ...PLAN, tasks: [{ name: 'Change plan to Team', start: 'Billing', end: 'plan-changed', maxSteps: 3 }] });
    assert.ok(ok.ok);
    assert.deepStrictEqual(ok.ok && ok.plan.tasks, [{ name: 'Change plan to Team', start: 'billing', end: 'plan-changed', maxSteps: 3 }]);
    const stray = validateFlowPlan({ ...PLAN, tasks: [{ name: 'X', start: 'billing', end: 'nowhere' }] });
    assert.ok(!stray.ok && /both must be screens/.test(stray.error));
    const many = validateFlowPlan({ ...PLAN, tasks: Array.from({ length: 6 }, (_, i) => ({ name: `T${i}`, start: 'billing', end: 'plans' })) });
    assert.ok(!many.ok && /at most 5/.test(many.error));
    const steps = validateFlowPlan({ ...PLAN, tasks: [{ name: 'X', start: 'billing', end: 'plans', maxSteps: 0 }] });
    assert.ok(!steps.ok && /maxSteps/.test(steps.error));
  });

  it('lists the tasks in each screen\'s instructions', () => {
    const section = composeFlowSection(PLAN, 'billing', '.open-design/billing');
    assert.match(section, /### Tasks this flow is for/);
    assert.match(section, /\*\*Change plan to Team\*\*: from `billing` to `plan-changed` in at most 3 step/);
    assert.match(section, /This screen starts "Change plan to Team"/);
    assert.match(composeFlowSection(PLAN, 'plan-changed', '.open-design/billing'), /ends "Change plan to Team": show clearly that it is done/);
  });

  it('turns the main task answer into a section for app screens', () => {
    const base = { skillName: 'app-settings', skillBody: 'Body', brief: 'Billing', decisions: { answers: { task: 'Change plan to Team' } }, craftSections: [{ id: 'product-ui', body: 'x' }] };
    const out = composeInstructions(base as unknown as Parameters<typeof composeInstructions>[0]);
    assert.match(out, /## The main task\n\n"Change plan to Team"/);
    assert.doesNotMatch(composeInstructions({ ...base, craftSections: [] } as unknown as Parameters<typeof composeInstructions>[0]), /## The main task/);
  });
});

describe('task walkthrough: paths', () => {
  it('finds the shortest path over real links', () => {
    const links = [link('billing', 'plans', 'Change plan'), link('plans', 'confirm', 'Choose Team'), link('confirm', 'plan-changed', 'Confirm'), link('billing', 'invoices'), link('invoices', 'plan-changed')];
    const [p] = taskPathsOf(PLAN.tasks!, links);
    assert.deepStrictEqual(p.path, ['billing', 'invoices', 'plan-changed']);
    assert.deepStrictEqual(p.triggers, ['invoices', 'plan-changed']);
    assert.deepStrictEqual(taskFindings([p]), []);
  });

  it('reports a task with no path, and one over its step budget', () => {
    const none = taskFindings(taskPathsOf(PLAN.tasks!, [link('billing', 'plans'), link('plans', 'confirm')]));
    assert.deepStrictEqual(none.map((f) => [f.check, f.severity]), [['task-unreachable', 'error']]);
    assert.match(none[0].message, /no chain of links leads from billing to plan-changed/);
    const long = taskFindings(
      taskPathsOf([{ ...PLAN.tasks![0], maxSteps: 2 }], [link('billing', 'plans', 'Change plan'), link('plans', 'confirm', 'Choose Team'), link('confirm', 'plan-changed', 'Confirm')]),
    );
    assert.strictEqual(long[0]?.check, 'task-too-long');
    assert.match(long[0].message, /takes 3 steps \(billing "Change plan" → plans "Choose Team" → confirm "Confirm" → plan-changed\)/);
    // Broken links don't count.
    assert.strictEqual(taskPathsOf(PLAN.tasks!, [{ ...link('billing', 'plan-changed'), broken: true }])[0].path, undefined);
  });

  it('a planned link that wasn\'t built breaks the task in the collection check', () => {
    const dir = '.open-design/billing';
    const screen = (id: string, html: string) => ({ id, title: id, entryPath: `${dir}/${id}.html`, html });
    const analysis = analyzeFlow({
      collectionDir: dir,
      plan: PLAN,
      screens: [screen('billing', page('<h1>Billing</h1><a href="#">Download invoice</a>')), screen('plans', page(a('confirm', 'Choose Team'))), screen('confirm', page(a('plan-changed', 'Confirm'))), screen('plan-changed', page('<h1>Done</h1>'))],
    });
    assert.ok(analysis.findings.some((f) => f.check === 'task-unreachable' && f.screen === 'billing'), JSON.stringify(analysis.findings));
    assert.strictEqual(analysis.taskPaths[0].path, undefined);
  });

  it('draws each task path on the flow map with a legend', () => {
    const html = flowMapHtml({
      title: 'Billing',
      screens: PLAN.screens.map((s) => ({ id: s.id, title: s.title, href: `${s.id}.html` })),
      links: [link('billing', 'plans'), link('plans', 'confirm')],
      missingLinks: [],
      plan: PLAN,
      taskPaths: [
        { task: PLAN.tasks![0], path: ['billing', 'plans'], triggers: ['Change plan'] },
        { task: { name: 'Update card', start: 'billing', end: 'confirm' } },
      ],
    });
    assert.match(html, /<ul class="tasks" aria-label="Tasks">/);
    assert.match(html, /Change plan to Team: 1 step\(s\)/);
    assert.match(html, /Update card: <span class="bad">no path<\/span>/);
    assert.match(html, /"task":0,"colour":"#1f77d0"/);
  });
});

describe('task walkthrough: critic', () => {
  it('accepts the task area', () => {
    assert.doesNotThrow(() => validateCritique({ verdict: 'polish', findings: [{ area: 'task', where: 'billing', problem: 'The next step is a grey link.', fix: 'Make "Change plan" the primary button.' }] }));
  });

  it('gives the critic the flow tasks with their paths, or a single screen\'s task', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-task-'));
    const dir = '.open-design/billing';
    await fs.mkdir(path.join(root, dir), { recursive: true });
    const files: Record<string, string> = {
      billing: page(a('plans', 'Change plan')),
      plans: page(a('confirm', 'Choose Team')),
      confirm: page(a('plan-changed', 'Confirm')),
      'plan-changed': page('<h1>Done</h1>'),
    };
    for (const [i, [id, html]] of Object.entries(files).entries()) {
      await fs.writeFile(path.join(root, dir, `${id}.html`), html);
      await writeArtifactManifest({
        workspaceRoot: root,
        entryPath: `${dir}/${id}.html`,
        artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: id, collectionId: 'billing', collectionName: 'Billing', screenIndex: i, screenRole: id, metadata: { flow: { plan: PLAN, screenId: id } } },
      });
    }
    const manifest = JSON.parse(await fs.readFile(path.join(root, dir, 'billing.html.artifact.json'), 'utf8').catch(async () => fs.readFile(path.join(root, dir, 'billing.artifact.json'), 'utf8')));
    const input = await buildCritiqueInput({ workspaceRoot: root, outputDir: '.open-design', entryPath: `${dir}/billing.html`, manifest });
    assert.deepStrictEqual(input.tasks, [{ ...PLAN.tasks![0], path: ['billing', 'plans', 'confirm', 'plan-changed'], triggers: ['Change plan', 'Choose Team', 'Confirm'] }]);
    const single = await buildCritiqueInput({ workspaceRoot: root, outputDir: '.open-design', entryPath: 'x.html', manifest: { metadata: { brief: { answers: { task: 'Export last month\'s invoices' } } } } });
    assert.deepStrictEqual(single.tasks, [{ name: "Export last month's invoices" }]);
  });
});
