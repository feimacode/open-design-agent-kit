import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeFlowSection, validateFlowPlan, withScreen, MAX_FLOW_SCREENS, type FlowPlan } from '../../generation/flowPlan';
import { composeInstructions } from '../../generation/composeInstructions';
import { resolveIncludes } from '../../export/flowIncludes';
import { analyzeFlow, storeRuleFindings } from '../../export/flowCheck';
import { exportCollectionPrototype, loadCollectionFlow, writeFlowMap } from '../../export/collectionCheck';
import { flowColumns } from '../../export/flowMap';
import { latestFlowPlan } from '../../workspace/collectionScan';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const PLAN: FlowPlan = {
  screens: [
    { id: 'welcome', title: 'Welcome' },
    { id: 'goals', title: 'Goals' },
    { id: 'library', title: 'Library' },
    { id: 'saved', title: 'Saved', end: true },
  ],
  links: [
    { from: 'welcome', trigger: 'Continue', to: 'goals' },
    { from: 'goals', trigger: 'Done', to: 'library' },
  ],
  nav: [
    { label: 'Library', to: 'library' },
    { label: 'Saved', to: 'saved' },
  ],
};

const page = (body: string, bodyAttrs = '') => `<!doctype html><html><head><title>x</title></head><body${bodyAttrs}>${body}</body></html>`;
const NAV = '<nav class="tabs"><a href="library.html" data-od-goto="library">Library</a><a href="saved.html" data-od-goto="saved">Saved</a></nav>';

describe('flow plan', () => {
  it('validates shape and limits, and slugs ids', () => {
    const ok = validateFlowPlan({ screens: [{ id: 'Sign In', title: 'Sign in' }, { id: 'home', title: 'Home' }], links: [{ from: 'sign in', trigger: 'Continue', to: 'home' }] });
    assert.ok(ok.ok);
    assert.strictEqual(ok.ok && ok.plan.screens[0].id, 'sign-in');
    const big = validateFlowPlan({ screens: Array.from({ length: MAX_FLOW_SCREENS + 1 }, (_, i) => ({ id: `s${i}`, title: `S${i}` })) });
    assert.ok(!big.ok && /at most 20/.test(big.error));
    const stray = validateFlowPlan({ screens: [{ id: 'a', title: 'A' }], links: [{ from: 'a', trigger: 'Go', to: 'b' }] });
    assert.ok(!stray.ok && /isn't in flow.screens/.test(stray.error));
  });

  it('adds an unplanned screen once', () => {
    assert.strictEqual(withScreen(PLAN, 'goals', 'Goals').added, false);
    const added = withScreen(PLAN, 'profile', 'Profile');
    assert.ok(added.added);
    assert.strictEqual(added.plan.screens.at(-1)?.id, 'profile');
  });

  it("gives each screen the plan, its own links and the shared nav include", () => {
    const section = composeFlowSection(PLAN, 'welcome', '.open-design/onboarding');
    assert.match(section, /welcome.*← this screen/);
    assert.match(section, /<a href="goals.html" data-od-goto="goals">Continue<\/a>/);
    assert.match(section, /data-od-include="_shared\/nav.html"/);
    assert.ok(!/data-od-current="library"/.test(section));
    assert.match(composeFlowSection(PLAN, 'library', '.open-design/onboarding'), /data-od-current="library"/);
    const instructions = composeInstructions({ skillName: 's', skillBody: 'b', brief: 'x', suggestedEntryPath: 'a.html', flowContext: { plan: PLAN, screenId: 'goals', collectionDir: 'c' } });
    assert.match(instructions, /## Part of a planned flow/);
  });

  it('the latest registered plan wins', () => {
    const older = { ...PLAN, screens: PLAN.screens.slice(0, 2), links: [] };
    const plan = latestFlowPlan([
      { entryPath: 'a', title: 'a', flow: { plan: older, screenId: 'welcome' }, updatedAt: '2026-11-01T00:00:00Z' },
      { entryPath: 'b', title: 'b', flow: { plan: PLAN, screenId: 'goals' }, updatedAt: '2026-11-02T00:00:00Z' },
    ]);
    assert.strictEqual(plan?.screens.length, 4);
  });
});

describe('shared fragments', () => {
  it('includes the fragment after its template, preview-only, marking the current item', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-include-'));
    await fs.mkdir(path.join(root, 'c', '_shared'), { recursive: true });
    await fs.writeFile(path.join(root, 'c', '_shared', 'nav.html'), NAV);
    const html = page('<template data-od-include="_shared/nav.html"></template><main>x</main><template data-od-include="../../outside.html"></template>', ' data-od-current="saved"');
    const out = await resolveIncludes(html, path.join(root, 'c', 'library.html'), root);
    assert.deepStrictEqual(out.included, ['_shared/nav.html']);
    assert.deepStrictEqual(out.missing, ['../../outside.html']);
    assert.match(out.html, /<template data-od-include="_shared\/nav.html"><\/template><nav class="tabs" data-od-preview-only="" data-od-included="_shared\/nav.html">/);
    assert.match(out.html, /data-od-goto="saved" aria-current="page"/);
    assert.ok(!/data-od-goto="library" aria-current/.test(out.html));
  });
});

describe('flow findings', () => {
  const dir = '.open-design/onboarding';
  const screen = (id: string, html?: string) => ({ id, title: id[0].toUpperCase() + id.slice(1), entryPath: `${dir}/${id}.html`, html });
  const include = '<template data-od-include="_shared/nav.html"></template>';

  it('reports broken links, dead ends, unfilled screens, missing planned links and nav drift', () => {
    const { findings, missingLinks } = analyzeFlow({
      collectionDir: dir,
      plan: PLAN,
      sharedNav: NAV,
      screens: [
        screen('welcome', page(`${include}<h1>Welcome</h1><a href="gone.html">Skip</a>`)),
        screen('goals', page('<nav><a href="library.html">Your Library</a><a href="saved.html">Saved</a></nav><h1>Goals</h1>')),
        screen('library', page(`${include}<h1>Library</h1>`)),
      ],
    });
    const codes = (code: string) => findings.filter((f) => f.check === code);
    assert.strictEqual(codes('flow-broken-link')[0]?.screen, 'welcome');
    assert.ok(codes('flow-unfilled').some((f) => f.screen === 'saved'), JSON.stringify(findings));
    assert.ok(codes('flow-unlinked').some((f) => f.screen === 'welcome' && /Continue/.test(f.message)));
    assert.deepStrictEqual(missingLinks.map((l) => l.from), ['welcome'], 'goals reaches library through its own nav');
    assert.ok(codes('flow-nav-drift').some((f) => f.screen === 'goals' && /Your Library/.test(f.message)), JSON.stringify(findings));
    assert.ok(!codes('flow-nav-drift').some((f) => f.screen === 'library'));
    assert.strictEqual(codes('flow-dead-end').length, 0, 'the shared nav is a way forward');
  });

  it('a screen with no links is a dead end unless marked as one', () => {
    const run = (attrs: string) =>
      analyzeFlow({ collectionDir: dir, screens: [screen('welcome', page('<a href="done.html">Next</a>')), screen('done', page('<h1>Done</h1>', attrs))] }).findings.filter((f) => f.check === 'flow-dead-end');
    assert.strictEqual(run('').length, 1);
    assert.strictEqual(run(' data-od-end').length, 0);
  });

  it('store rules: notes by default, warnings for a store app', () => {
    const screens = [screen('sign-up', page('<h1>Create account</h1><button>Continue</button>')), screen('paywall', page('<h1>Go Pro</h1><button>Start trial</button>'))];
    const notes = storeRuleFindings(screens, 'a habit tracker');
    assert.ok(notes.some((f) => /delete their account/.test(f.message)));
    assert.ok(notes.some((f) => f.screen === 'paywall' && /Restore purchases/.test(f.message)));
    assert.ok(notes.every((f) => f.severity === 'info'));
    assert.ok(storeRuleFindings(screens, 'ships to the App Store').every((f) => f.severity === 'warning'));
    const fine = storeRuleFindings([screen('paywall', page('<p>$4.99/month</p><a>Restore purchases</a><a>Terms</a><a>Privacy</a>')), screen('settings', page('<button>Delete account</button>'))], undefined);
    assert.strictEqual(fine.length, 0, JSON.stringify(fine));
  });
});

describe('flow map and prototype', () => {
  it('columns by steps from the first screen', () => {
    const cols = flowColumns([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }, { id: 'z', title: 'Z' }], [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }]);
    assert.deepStrictEqual(cols, [['a'], ['b', 'c'], ['z']]);
  });

  it('writes flow.html and a one-file prototype from registered screens', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-flow-'));
    const dir = '.open-design/onboarding';
    await fs.mkdir(path.join(root, dir, '_shared'), { recursive: true });
    await fs.writeFile(path.join(root, dir, '_shared', 'nav.html'), NAV);
    await fs.writeFile(path.join(root, dir, 'app.css'), 'body{color:rebeccapurple}');
    const files: Record<string, string> = {
      welcome: page('<link rel="stylesheet" href="app.css"><a href="goals.html" data-od-goto="goals">Continue</a>'),
      goals: page('<template data-od-include="_shared/nav.html"></template><h1>Goals</h1>'),
    };
    for (const [i, [id, html]] of Object.entries(files).entries()) {
      await fs.writeFile(path.join(root, dir, `${id}.html`), html);
      await writeArtifactManifest({
        workspaceRoot: root,
        entryPath: `${dir}/${id}.html`,
        artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: id, collectionId: 'onboarding', collectionName: 'Onboarding', screenIndex: i, screenRole: id, metadata: { flow: { plan: PLAN, screenId: id } } },
      });
    }
    const flow = await loadCollectionFlow(root, '.open-design', 'onboarding');
    assert.ok(flow);
    assert.deepStrictEqual(flow!.screens.map((s) => s.id), ['welcome', 'goals']);
    const { mapPath } = await writeFlowMap(root, flow!);
    const map = await fs.readFile(path.join(root, mapPath), 'utf8');
    assert.strictEqual(mapPath, `${dir}/flow.html`);
    assert.match(map, /src="welcome.html"/);
    assert.match(map, /Not built yet/);
    assert.match(map, /"missing":true/);

    const proto = await exportCollectionPrototype(root, '.open-design', 'onboarding');
    assert.ok(proto.ok, JSON.stringify(proto));
    const html = await fs.readFile(path.join(root, (proto as { output: string }).output), 'utf8');
    assert.match(html, /rebeccapurple/, 'stylesheets are inlined');
    assert.match(html, /Library/, 'the shared nav is resolved');
    assert.match(html, /odGoto/);
  });
});

describe('MCP App preview links', () => {
  it('resolves a link to a sibling screen, and leaves anything else alone', async () => {
    const { localLinkTarget } = await import('../../preview/localLink');
    assert.strictEqual(localLinkTarget('.open-design/onboarding/welcome.html', 'goals.html#top'), '.open-design/onboarding/goals.html');
    assert.strictEqual(localLinkTarget('.open-design/onboarding/welcome.html', '../other/x.html'), '.open-design/other/x.html');
    assert.strictEqual(localLinkTarget('a.html', '../../x.html'), undefined);
    assert.strictEqual(localLinkTarget('a/b.html', 'https://example.com/x.html'), undefined);
    assert.strictEqual(localLinkTarget('a/b.html', 'styles.css'), undefined);
  });
});
