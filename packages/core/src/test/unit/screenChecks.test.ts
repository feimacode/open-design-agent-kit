import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact, type CheckArtifactResult } from '../../export/checkArtifact';
import { exportArtifact } from '../../export/exportArtifact';
import { isAppScreen } from '../../export/screenChecks';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/screens/customers.html';

async function workspace(html: string, sourceSkillId = 'od:prototype:app-table'): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-screens-'));
  await fs.mkdir(path.dirname(path.join(root, ENTRY)), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), html);
  await writeArtifactManifest({
    workspaceRoot: root,
    entryPath: ENTRY,
    artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Customers', sourceSkillId },
  });
  return root;
}

type Ok = Extract<CheckArtifactResult, { ok: true }>;
function ok(result: CheckArtifactResult): Ok {
  assert.ok(result.ok, JSON.stringify(result));
  return result as Ok;
}

const screen = (content: string, extraStates = '', style = '') => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
  body{margin:0;font:16px/1.5 sans-serif;color:#111;background:#fff}
  main{padding:24px}
  [data-od-state][hidden]{display:none}
  table{border-collapse:collapse}
  td,th{padding:8px 12px;border-bottom:1px solid #ccc;text-align:left}
  ${style}
</style></head><body><main><h1>Customers</h1>
<section data-od-state="default">${content}</section>${extraStates}
</main></body></html>`;

const TABLE = `<table aria-label="Customers"><thead><tr><th>Name</th><th>Status</th><th>Value</th></tr></thead><tbody>
<tr><td>Ada Lovelace</td><td>Active</td><td>1200</td></tr>
<tr><td>Grace Hopper</td><td>Pending</td><td>800</td></tr>
<tr><td>Alan Turing</td><td>Active</td><td>450</td></tr></tbody></table>`;

describe('app screen checks', () => {
  it('knows an app screen by its skill or by its state frames', () => {
    assert.strictEqual(isAppScreen('od:prototype:app-table', ''), true);
    assert.strictEqual(isAppScreen('od:template:dashboard', ''), true);
    assert.strictEqual(isAppScreen('od:prototype:saas-landing', '<main></main>'), false);
    assert.strictEqual(isAppScreen(undefined, '<section data-od-state="empty" hidden>'), true);
  });
});

describe('app screen checks (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });
  const check = (root: string, extra: Partial<Parameters<typeof checkArtifact>[0]> = {}) =>
    checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, states: false, saveRun: false, ...extra });

  it('reports a table with only its populated state, and not once an empty state exists', async () => {
    const missing = ok(await check(await workspace(screen(TABLE)), { stress: false }));
    const hit = missing.findings.find((f) => f.check === 'state-missing');
    assert.ok(hit, JSON.stringify(missing.findings));
    assert.match(hit!.message, /data-od-state="empty"/);

    const fine = ok(await check(await workspace(screen(TABLE, '<section data-od-state="empty" hidden><h2>No customers yet</h2><p>Add your first customer.</p><button>Add customer</button></section>')), { stress: false }));
    assert.ok(!fine.findings.some((f) => f.check === 'state-missing'), JSON.stringify(fine.findings));
  });

  it('checks each state frame on its own and puts a states board second', async () => {
    const empty = '<section data-od-state="empty" hidden><div style="width:900px;white-space:nowrap">No customers match these filters so try clearing some of them please</div></section>';
    const result = ok(await check(await workspace(screen(TABLE, empty)), { stress: false, maxImages: 3 }));
    const scroll = result.findings.filter((f) => f.state === 'empty');
    assert.ok(scroll.length > 0, JSON.stringify(result.findings));
    assert.ok(scroll.some((f) => /mobile/.test(f.viewport ?? '')), JSON.stringify(scroll));
    assert.ok(!result.findings.some((f) => f.state === 'default'), 'the default state is the page as loaded, checked as usual');
    assert.strictEqual(result.images[1]?.label, 'states: default, empty');
  });

  it('reports a control that claims a state but does nothing, and not one that works', async () => {
    const html = screen(`${TABLE}
      <button aria-pressed="false" id="dead">Starred only</button>
      <button aria-expanded="false" id="live" onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'true' ? 'false' : 'true')">Filters</button>`,
      '<section data-od-state="empty" hidden><p>No customers yet.</p></section>');
    const result = ok(await check(await workspace(html), { stress: false }));
    const dead = result.findings.filter((f) => f.check === 'dead-control');
    assert.strictEqual(dead.length, 1, JSON.stringify(dead));
    assert.match(dead[0].message, /Starred only/);
  });

  it('stress: finds text that long content pushes out of its box, and truncation with no title', async () => {
    const html = screen(
      `${TABLE}<p class="cut" style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Quarterly revenue summary</p><div class="badge" style="width:200px;height:28px;overflow:hidden"><span>Owner: Ada Lovelace</span></div>`,
      '<section data-od-state="empty" hidden><p>No customers yet.</p></section>',
      'td{max-width:120px;overflow:hidden;white-space:nowrap}',
    );
    const result = ok(await check(await workspace(html)));
    assert.ok(result.findings.some((f) => f.check === 'stress-truncation'), JSON.stringify(result.findings));
    assert.ok(result.findings.some((f) => f.check === 'stress-overflow' && /Owner/.test(f.message)), JSON.stringify(result.findings));
    const stressed = ok(await check(await workspace(html), { stress: false }));
    assert.ok(!stressed.findings.some((f) => f.check.startsWith('stress-')), 'stress: false skips the pass');
  });

  it('leaves a non-app page alone', async () => {
    const root = await workspace(screen(TABLE), 'od:prototype:saas-landing');
    const html = (await fs.readFile(path.join(root, ENTRY), 'utf8')).replace(/data-od-state="default"/, '');
    await fs.writeFile(path.join(root, ENTRY), html);
    const result = ok(await check(root));
    assert.ok(!result.findings.some((f) => ['state-missing', 'dead-control', 'stress-overflow', 'stress-truncation'].includes(f.check)), JSON.stringify(result.findings));
  });
  it('large text: finds a fixed-height box that clips when the text size goes up', async () => {
    const html = screen(`${TABLE}<div style="height:24px;overflow:hidden;width:300px;font-size:1rem;line-height:1.5rem">Next payment on 3 March</div>`, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>', 'html{font-size:16px}');
    const result = ok(await check(await workspace(html), { stress: false }));
    assert.ok(result.findings.some((f) => f.check === 'large-text-overflow'), JSON.stringify(result.findings));
    const fine = ok(await check(await workspace(screen(TABLE, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>')), { stress: false }));
    assert.ok(!fine.findings.some((f) => f.check === 'large-text-overflow'), JSON.stringify(fine.findings));
  });

  it('checks a device screen at its content size and flags a frame it drew itself', async () => {
    const html = screen(TABLE, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>').replace('<body>', '<body data-od-device="iphone">').replace('<main>', '<div class="status-bar">9:41</div><main>');
    const result = ok(await check(await workspace(html), { stress: false }));
    assert.ok(result.findings.some((f) => f.check === 'device-double-frame'), JSON.stringify(result.findings));
    assert.match(result.images[0]?.label ?? '', /iphone/);
    assert.ok(!result.images.some((i) => /desktop|tablet/.test(i.label)), JSON.stringify(result.images.map((i) => i.label)));
  });

  it('checks a web app screen at tablet sizes too, shown only when something is wrong there', async () => {
    const wide = '<div style="width:900px;white-space:nowrap">A row of filters that needs nine hundred pixels to fit on one line</div>';
    const result = ok(await check(await workspace(screen(`${TABLE}${wide}`, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>')), { stress: false, maxImages: 6 }));
    assert.ok(result.findings.some((f) => f.viewport === 'tablet-768'), JSON.stringify(result.findings));
    assert.ok(result.images.some((i) => /tablet-768/.test(i.label)), JSON.stringify(result.images.map((i) => i.label)));
    const fine = ok(await check(await workspace(screen(TABLE, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>')), { stress: false, maxImages: 6 }));
    assert.ok(!fine.images.some((i) => /tablet/.test(i.label)), JSON.stringify(fine.images.map((i) => i.label)));
  });

  it('exports a device screen inside its frame, or bare with shell: false', async () => {
    const root = await workspace(screen(TABLE).replace('<body>', '<body data-od-device="android">'));
    const framed = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'png', browserPath, settleMs: 0 });
    assert.ok(framed.ok, JSON.stringify(framed));
    assert.ok(framed.files[0].width > 412 && framed.files[0].height > 867, JSON.stringify(framed.files));
    const bare = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'png', shell: false, browserPath, settleMs: 0 });
    assert.ok(bare.ok, JSON.stringify(bare));
    assert.deepStrictEqual([bare.files[0].width, bare.files[0].height], [412, 867]);
    const pdf = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, format: 'pdf', shell: false, browserPath, settleMs: 0 });
    assert.ok(!pdf.ok && /PNG and JPEG/.test(pdf.error), JSON.stringify(pdf));
  });
  it('sample data: renders bound rows and reports thin lists, missing binds and a hand-written short table', async () => {
    const rows = '<table aria-label="Customers"><tbody><tr data-od-repeat="customers"><td data-od-bind=".name">Name</td><td data-od-bind=".value" data-od-format="currency">0</td></tr></tbody></table><p data-od-bind="totals.sum">0</p>';
    const root = await workspace(screen(rows, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>'));
    await fs.writeFile(path.join(root, '.open-design/screens/customers.data.json'), JSON.stringify({ locale: 'en-GB', currency: 'GBP', customers: [{ name: 'Ada', value: 1200 }, { name: 'Grace', value: 0 }] }));
    const result = ok(await check(root, { stress: false }));
    const checks = result.findings.map((f) => f.check);
    assert.ok(checks.includes('sample-data-thin'), JSON.stringify(result.findings));
    assert.ok(result.findings.some((f) => f.check === 'sample-data-missing' && /totals\.sum/.test(f.message)), JSON.stringify(result.findings));
    const hand = ok(await check(await workspace(screen(TABLE, '<section data-od-state="empty" hidden><p>No customers yet.</p></section>')), { stress: false }));
    assert.ok(hand.findings.some((f) => f.check === 'sample-data-thin' && /3 rows/.test(f.message)), JSON.stringify(hand.findings));
  });
});
