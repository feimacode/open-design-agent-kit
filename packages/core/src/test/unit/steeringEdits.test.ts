import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { checkArtifact } from '../../export/checkArtifact';
import { findBrowser } from '../../export/browserDiscovery';
import { compareMarkupOutsideScope, comparePixelsOutsideScope, newFindings, verbEffect, type Capture, type ScopeMeasurements } from '../../export/editGuard';
import { editLogOf, prepareEdit, resolveEditScope, stampScope, verbDefinition } from '../../generation/steeringEdits';
import { steerCommentMessage } from '../../generation/steeringVerbs';
import { readArtifact, writeArtifactManifest } from '../../vendored/artifactCreate';
import { mergeArtifactComments } from '../../workspace/artifactComments';

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acme</title>
<style>
:root{--space-2:8px;--space-4:16px;--space-6:24px;--space-8:32px;--brand:#1f5fbf}
body{margin:0;font-family:system-ui,sans-serif;color:#1d1d1f;background:#fff}
header,footer{padding:16px 24px;background:#f4f4f6}
section{padding:24px}
h2{font-size:24px;margin:0 0 8px}
.plan{display:inline-block;padding:16px;margin-right:16px;border:1px solid #ddd}
.cta{display:inline-block;padding:12px 18px;background:var(--brand);color:#fff;text-decoration:none}
</style></head>
<body>
<header><strong>Acme</strong></header>
<main>
<section class="hero"><h1>Invoices that pay themselves</h1><p>Send, chase and reconcile in one place.</p><a class="cta" href="#start">Start free</a></section>
<section><h2>Pricing</h2><div class="plan">Starter <b>$9</b></div><div class="plan">Team <b>$29</b></div></section>
<section><h2>Questions</h2><p>Can I cancel any time? Yes.</p></section>
</main>
<footer>© Acme</footer>
</body></html>`;

const VERBS_DOC = `# Steering verbs\n\nIntro shared by every verb.\n\n## bolder\n\nMake it bolder.\n\n## quieter\n\nMake it quieter.\n`;

async function workspace(html = PAGE): Promise<{ root: string; entry: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-steer-'));
  const entry = '.open-design/acme/index.html';
  await fs.mkdir(path.join(root, '.open-design/acme'), { recursive: true });
  await fs.writeFile(path.join(root, entry), html);
  await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Acme' } });
  return { root, entry };
}

describe('steering edits: scope', () => {
  it('finds a section by its heading, a named region and a selector, and lists candidates when it is ambiguous', () => {
    const byHeading = resolveEditScope(PAGE, { heading: 'pricing' }, 'bolder');
    assert.ok(byHeading.ok && byHeading.element?.tagName === 'section');
    const hero = resolveEditScope(PAGE, { region: 'hero' }, 'bolder');
    assert.ok(hero.ok && hero.element?.attribs.class === 'hero');
    const footer = resolveEditScope(PAGE, { region: 'footer' }, 'quieter');
    assert.ok(footer.ok && footer.element?.tagName === 'footer');
    const many = resolveEditScope(PAGE, { selector: '.plan' }, 'denser');
    assert.ok(!many.ok && /matches 2 elements/.test(many.error) && /Starter/.test(many.error));
    const none = resolveEditScope(PAGE, { heading: 'Testimonials' }, 'denser');
    assert.ok(!none.ok && /headings: .*"Pricing"/.test(none.error));
  });

  it('allows the whole page only for polish and harden', () => {
    assert.ok(resolveEditScope(PAGE, { region: 'page' }, 'polish').ok);
    const bolder = resolveEditScope(PAGE, { region: 'page' }, 'bolder');
    assert.ok(!bolder.ok && /new direction/.test(bolder.error));
  });

  it('refuses a part of the shared navigation', () => {
    const html = PAGE.replace('<header><strong>Acme</strong></header>', '<header data-od-include="nav.html"><nav>Home</nav></header>');
    const r = resolveEditScope(html, { region: 'header' }, 'quieter');
    assert.ok(!r.ok && /shared navigation/.test(r.error));
  });

  it('stamps only the start tag of the scope, leaving every other byte as it was', () => {
    const r = resolveEditScope(PAGE, { heading: 'Pricing' }, 'bolder');
    assert.ok(r.ok && r.element);
    const out = stampScope(PAGE, { tagName: 'section', startOffset: r.element.sourceCodeLocation!.startOffset }, 'edit-pricing');
    assert.strictEqual(out.replace(' data-od-id="edit-pricing"', ''), PAGE);
    assert.match(out, /<section data-od-id="edit-pricing"><h2>Pricing/);
  });

  it('loads one verb section from the craft doc', () => {
    assert.strictEqual(verbDefinition(VERBS_DOC, 'bolder'), 'Make it bolder.');
    assert.strictEqual(verbDefinition(VERBS_DOC, 'quieter'), 'Make it quieter.');
    assert.strictEqual(verbDefinition(VERBS_DOC, 'denser'), undefined);
  });
});

describe('steering edits: prepare, log and undo', () => {
  it('stamps, snapshots, logs and writes instructions; undo restores the snapshot newest first', async () => {
    const { root, entry } = await workspace();
    const first = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'bolder', scope: { heading: 'Pricing' }, notes: 'make pricing pop', verbsDoc: VERBS_DOC });
    assert.strictEqual(first.status, 'prepared');
    if (first.status !== 'prepared') return;
    assert.strictEqual(first.scope.id, 'edit-pricing');
    assert.match(first.instructions, /Make it bolder\./);
    assert.match(first.instructions, /Intro shared by every verb/);
    assert.match(first.instructions, /make pricing pop/);
    assert.match(first.instructions, /\[data-od-id="edit-pricing"\] h2/);
    assert.match(first.instructions, /--space-4: 16px/);
    assert.match(first.instructions, new RegExp(`editId "${first.editId}"`));
    const stamped = await fs.readFile(path.join(root, entry), 'utf8');
    assert.match(stamped, /<section data-od-id="edit-pricing">/);
    assert.strictEqual(await fs.readFile(path.join(root, first.snapshot), 'utf8'), stamped);

    await fs.writeFile(path.join(root, entry), stamped.replace('<h2>Pricing</h2>', '<h2 style="font-size:40px">Pricing</h2>'));
    const second = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'quieter', scope: 'footer', verbsDoc: VERBS_DOC });
    assert.strictEqual(second.status, 'prepared');
    if (second.status !== 'prepared') return;
    const log = editLogOf((await readArtifact({ workspaceRoot: root, entryPath: entry }))!.manifest);
    assert.deepStrictEqual(
      log.map((e) => [e.verb, e.scope, e.status]),
      [
        ['bolder', 'the section headed "Pricing"', 'prepared'],
        ['quieter', 'the footer', 'prepared'],
      ],
    );

    const blocked = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, undo: first.editId });
    assert.ok(blocked.status === 'error' && blocked.error.includes(second.editId));
    assert.strictEqual((await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, undo: second.editId })).status, 'undone');
    assert.strictEqual((await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, undo: first.editId })).status, 'undone');
    assert.strictEqual(await fs.readFile(path.join(root, entry), 'utf8'), stamped);
  });

  it('takes a preview comment as the scope, and a verb comment asks for exactly that', async () => {
    const { root, entry } = await workspace();
    const now = new Date().toISOString();
    await mergeArtifactComments(root, entry, [{ id: 'c-1', selector: 'main > section:nth-of-type(3)', htmlHint: '<section>', note: 'Distill this', status: 'open', createdAt: now, updatedAt: now, verb: 'distill' }], []);
    const r = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'distill', scope: { commentId: 'c-1' } });
    assert.ok(r.status === 'prepared' && /resolvedCommentIds \["c-1"\]/.test(r.instructions));
    const html = await fs.readFile(path.join(root, entry), 'utf8');
    assert.match(html, /<section data-od-id="[^"]+"><h2>Questions/);
    assert.match(steerCommentMessage(entry, { id: 'c-1', verb: 'distill', note: 'Distill this', text: 'Questions' }), /prepare_open_design_edit with verb "distill" and scope \{ "commentId": "c-1" \}/);
  });

  it('rejects an unknown verb and an unregistered design', async () => {
    const { root, entry } = await workspace();
    const bad = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'louder', scope: 'hero' });
    assert.ok(bad.status === 'error' && /bolder, quieter, denser, roomier, distill, polish, harden/.test(bad.error));
    await fs.writeFile(path.join(root, '.open-design/acme/other.html'), PAGE);
    const unregistered = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: '.open-design/acme/other.html', verb: 'bolder', scope: 'hero' });
    assert.ok(unregistered.status === 'error' && /register_open_design_artifact/.test(unregistered.error));
  });
});

describe('edit guard: comparisons', () => {
  const stamped = PAGE.replace('<section><h2>Pricing', '<section data-od-id="edit-pricing"><h2>Pricing');

  it('allows changes inside the scope and scoped CSS, and reports shared rules and outside changes', () => {
    const inside = stamped.replace('<h2>Pricing</h2>', '<h2 class="price-head">Pricing plans</h2>').replace('</style>', '[data-od-id="edit-pricing"] h2{font-size:40px}\n.price-head{font-weight:800}\n</style>');
    assert.deepStrictEqual(compareMarkupOutsideScope(stamped, inside, 'edit-pricing').changes, []);
    const shared = stamped.replace('h2{font-size:24px;margin:0 0 8px}', 'h2{font-size:40px;margin:0 0 8px}');
    assert.match(compareMarkupOutsideScope(stamped, shared, 'edit-pricing').changes.join('\n'), /`h2` changed/);
    const outside = stamped.replace('© Acme', '© Acme Inc.');
    assert.match(compareMarkupOutsideScope(stamped, outside, 'edit-pricing').changes.join('\n'), /© Acme Inc\./);
    const gone = stamped.replace(' data-od-id="edit-pricing"', '');
    assert.ok(compareMarkupOutsideScope(stamped, gone, 'edit-pricing').scopeMissing);
  });

  const solid = (w: number, h: number, bands: Array<[number, number, [number, number, number]]>): Buffer => {
    const img = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      const color = bands.find(([from, to]) => y >= from && y < to)?.[2] ?? [255, 255, 255];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        img.data[i] = color[0];
        img.data[i + 1] = color[1];
        img.data[i + 2] = color[2];
        img.data[i + 3] = 255;
      }
    }
    return PNG.sync.write(img);
  };
  const m = {} as ScopeMeasurements;

  it('ignores content that only moved because the scope got taller, and finds a real change below it', () => {
    const before: Capture = { png: solid(100, 300, [[0, 50, [20, 20, 20]], [100, 150, [200, 30, 30]], [250, 300, [30, 30, 200]]]), scope: { x: 0, y: 100, width: 100, height: 50 }, measurements: m };
    const taller: Capture = { png: solid(100, 400, [[0, 50, [20, 20, 20]], [100, 250, [200, 30, 30]], [350, 400, [30, 30, 200]]]), scope: { x: 0, y: 100, width: 100, height: 150 }, measurements: m };
    assert.deepStrictEqual(comparePixelsOutsideScope(before, taller), []);
    const restyled: Capture = { png: solid(100, 400, [[0, 50, [20, 20, 20]], [100, 250, [200, 30, 30]], [350, 400, [30, 200, 30]]]), scope: taller.scope, measurements: m };
    const leaks = comparePixelsOutsideScope(before, restyled);
    assert.strictEqual(leaks.length, 1);
    assert.strictEqual(leaks[0].where, 'below');
    assert.strictEqual(leaks[0].box.y, 350);
  });

  it('measures the verb direction and new findings', () => {
    const base: ScopeMeasurements = { maxFont: 24, maxWeight: 600, accentColors: 2, accentArea: 0.1, decorative: 3, spacing: 16, distinctSpacing: 4, distinctFonts: 3, distinctRadii: 2, visible: 10, words: 40, height: 300, stateFrames: 0 };
    const evidence = (after: Partial<ScopeMeasurements>) => ({ before: base, after: { ...base, ...after }, findingsBefore: 2, findingsAfter: 2, signalsBefore: 0, signalsAfter: 0 });
    assert.deepStrictEqual(verbEffect('bolder', evidence({ maxFont: 40 })), ['largest text 24→40 px']);
    assert.deepStrictEqual(verbEffect('bolder', evidence({})), []);
    assert.strictEqual(verbEffect('denser', evidence({ spacing: 10 })).length, 1);
    assert.strictEqual(verbEffect('denser', evidence({ height: 200, visible: 8 })).length, 0);
    assert.strictEqual(verbEffect('distill', evidence({ visible: 7, words: 30 })).length, 2);
    assert.strictEqual(verbEffect('polish', { ...evidence({}), signalsAfter: 3 }).length, 1);
    const added = newFindings(
      [{ check: 'tap-target', severity: 'warning', message: 'a.x is 20×20', selector: 'a.x', viewport: 'mobile' }],
      [
        { check: 'tap-target', severity: 'warning', message: 'a.x is 20×20', selector: 'a.x', viewport: 'mobile' },
        { check: 'tap-target', severity: 'warning', message: 'a.y is 18×18', selector: 'a.y', viewport: 'mobile' },
        { check: 'stale-sources', severity: 'info', message: 'x' },
      ],
    );
    assert.deepStrictEqual(added.map((f) => f.selector), ['a.y']);
  });
});

describe('edit guard in the check (browser)', function () {
  this.timeout(180_000);
  let executablePath: string;

  before(async function () {
    const found = await findBrowser({});
    if (!found.ok) this.skip();
    executablePath = found.executablePath;
  });

  it('passes an edit that stays in scope, and catches a shared rule that moves the rest of the page', async () => {
    const { root, entry } = await workspace();
    const prepared = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'bolder', scope: { heading: 'Pricing' } });
    assert.ok(prepared.status === 'prepared');
    const stamped = await fs.readFile(path.join(root, entry), 'utf8');

    await fs.writeFile(path.join(root, entry), stamped.replace('</style>', '[data-od-id="edit-pricing"] h2{font-size:44px;font-weight:800}\n</style>'));
    const good = await checkArtifact({ workspaceRoot: root, entryPath: entry, editId: prepared.editId, browserPath: executablePath, states: false, saveRun: false });
    assert.ok(good.ok, JSON.stringify(good));
    const edits = good.findings.filter((f) => f.check.startsWith('edit-'));
    assert.deepStrictEqual(edits, [], JSON.stringify(edits));
    assert.match(good.images[0].label, /before and after/);
    assert.match(good.editSummary ?? '', /only that part changed; largest text 24→44 px/);
    const log = editLogOf((await readArtifact({ workspaceRoot: root, entryPath: entry }))!.manifest);
    assert.strictEqual(log[0].status, 'checked');
    assert.strictEqual(log[0].result?.outOfScope, 0);

    await fs.writeFile(path.join(root, entry), stamped.replace('h2{font-size:24px;margin:0 0 8px}', 'h2{font-size:44px;margin:0 0 8px}'));
    const leaky = await checkArtifact({ workspaceRoot: root, entryPath: entry, editId: prepared.editId, browserPath: executablePath, states: false, saveRun: false });
    assert.ok(leaky.ok);
    const outOfScope = leaky.findings.filter((f) => f.check === 'edit-out-of-scope');
    assert.ok(outOfScope.some((f) => /`h2` changed/.test(f.message)), JSON.stringify(outOfScope));
    assert.ok(outOfScope.some((f) => /Below the edited part/.test(f.message)), JSON.stringify(outOfScope));

    const unchecked = await checkArtifact({ workspaceRoot: root, entryPath: entry, browserPath: executablePath, states: false, saveRun: false, maxImages: 0 });
    assert.ok(unchecked.ok && !unchecked.findings.some((f) => f.check === 'edit-unchecked'));
    await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'quieter', scope: 'footer' });
    const pending = await checkArtifact({ workspaceRoot: root, entryPath: entry, browserPath: executablePath, states: false, saveRun: false, maxImages: 0 });
    assert.ok(pending.ok && pending.findings.some((f) => f.check === 'edit-unchecked'));
  });

  it('reports an edit that changed nothing measurable', async () => {
    const { root, entry } = await workspace();
    const prepared = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, verb: 'denser', scope: { heading: 'Pricing' } });
    assert.ok(prepared.status === 'prepared');
    const result = await checkArtifact({ workspaceRoot: root, entryPath: entry, editId: prepared.editId, browserPath: executablePath, states: false, saveRun: false, maxImages: 0 });
    assert.ok(result.ok);
    assert.deepStrictEqual(
      result.findings.filter((f) => f.check.startsWith('edit-')).map((f) => f.check),
      ['edit-no-effect'],
    );
  });
});
