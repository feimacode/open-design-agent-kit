import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { findBrowser } from '../../export/browserDiscovery';
import { collectDiagramFindings, waitForDiagrams } from '../../export/diagramPageScripts';
import { addDiagramRuntime, DIAGRAM_RUNTIME_VERSION, diagramRuntimeBlock, withDiagramRuntime } from '../../generation/diagramRuntime';

describe('diagram runtime insertion', () => {
  it('inserts one block before </body> and leaves the rest unchanged', () => {
    const html = '<!doctype html><html><body><div data-od-diagram></div></body></html>';
    const { html: out, action } = withDiagramRuntime(html);
    assert.strictEqual(action, 'inserted');
    assert.strictEqual(out, `<!doctype html><html><body><div data-od-diagram></div>${diagramRuntimeBlock()}\n</body></html>`);
  });

  it('replaces an older block in place, collapses duplicates, and is idempotent', () => {
    const before = '<html><body>\n<p>keep</p>\n<script data-od-runtime="diagram" data-version="0">old()</script>\n<p>also</p>\n<script data-od-runtime="diagram">older()</script></body></html>';
    const { html: out, action } = withDiagramRuntime(before);
    assert.strictEqual(action, 'updated');
    assert.strictEqual(out.match(/data-od-runtime="diagram"/g)?.length, 1);
    assert.ok(out.startsWith('<html><body>\n<p>keep</p>\n<script data-od-runtime="diagram" data-version="' + DIAGRAM_RUNTIME_VERSION + '">'));
    assert.ok(out.endsWith('</script>\n<p>also</p>\n</body></html>'));
    assert.strictEqual(withDiagramRuntime(out).action, 'unchanged');
  });

  it('appends when there is no </body>', () => {
    const { html: out } = withDiagramRuntime('<div data-od-diagram></div>');
    assert.ok(out.startsWith('<div data-od-diagram></div>\n<script data-od-runtime="diagram"'));
  });

  it('writes the entry file, and refuses non-HTML or missing files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-diagram-'));
    await fs.writeFile(path.join(root, 'd.html'), '<body></body>');
    const ok = await addDiagramRuntime({ workspaceRoot: root, entryPath: 'd.html' });
    assert.ok(ok.ok && ok.action === 'inserted');
    assert.match(await fs.readFile(path.join(root, 'd.html'), 'utf8'), /data-od-runtime="diagram"/);
    const again = await addDiagramRuntime({ workspaceRoot: root, entryPath: 'd.html' });
    assert.ok(again.ok && again.action === 'unchanged');
    assert.ok(!(await addDiagramRuntime({ workspaceRoot: root, entryPath: 'd.svg' })).ok);
    assert.ok(!(await addDiagramRuntime({ workspaceRoot: root, entryPath: 'missing.html' })).ok);
    assert.ok(!(await addDiagramRuntime({ workspaceRoot: root, entryPath: '../outside.html' })).ok);
  });

  it('keeps the runtime free of template-literal hazards', () => {
    assert.ok(!diagramRuntimeBlock().includes('${'));
  });
});

const NODE = 'style="width:120px;height:48px;border:1px solid #999;background:#fff"';
const page = (body: string, attrs = '') => `<!doctype html><html><head><style>body{margin:0;font:14px sans-serif}</style></head><body><div data-od-diagram ${attrs}>${body}</div>${diagramRuntimeBlock()}</body></html>`;
const node = (id: string, rank: number, lane: number, extra = '') => `<div data-od-node="${id}" data-rank="${rank}" data-lane="${lane}" ${extra} ${NODE}>${id}</div>`;
const link = (from: string, to: string, extra = '') => `<i data-od-link data-from="${from}" data-to="${to}" ${extra} hidden></i>`;

interface Rendered {
  boxes: Record<string, { x0: number; y0: number; x1: number; y1: number }>;
  edges: Record<string, number[][]>;
  groups: Record<string, { x0: number; y0: number; x1: number; y1: number }>;
  errors: string[];
}

describe('diagram runtime (real browser; skipped when none is installed)', function () {
  this.timeout(60000);
  let browser: Browser | undefined;
  let tab: Page;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: found.executablePath, headless: true });
    tab = await browser.newPage();
    await tab.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((fn) => fn)');
    await tab.setViewport({ width: 1400, height: 900 });
  });
  after(async () => {
    await browser?.close();
  });

  async function render(html: string): Promise<Rendered> {
    await tab.setContent(html, { waitUntil: 'load' });
    await tab.evaluate(waitForDiagrams, 3000);
    return (await tab.evaluate(`(() => {
      const root = document.querySelector('[data-od-diagram]');
      const rr = root.getBoundingClientRect();
      const local = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left - rr.left, y0: r.top - rr.top, x1: r.right - rr.left, y1: r.bottom - rr.top }; };
      const boxes = {}, edges = {}, groups = {};
      root.querySelectorAll('[data-od-node]').forEach((el) => { boxes[el.getAttribute('data-od-node')] = local(el); });
      root.querySelectorAll('[data-od-participant]').forEach((el) => { boxes[el.getAttribute('data-od-participant')] = local(el); });
      root.querySelectorAll('path[data-od-edge]').forEach((el) => { edges[el.getAttribute('data-od-edge')] = JSON.parse(el.getAttribute('data-points')); });
      root.querySelectorAll('[data-od-group-box]').forEach((el) => { groups[el.getAttribute('data-od-group-box')] = local(el); });
      return { boxes, edges, groups, errors: window.odDiagram.errors };
    })()`)) as Rendered;
  }
  const findings = () => tab.evaluate(collectDiagramFindings);

  it('places nodes by rank and lane, left to right', async () => {
    const r = await render(page(node('a', 1, 1) + node('b', 2, 1) + node('c', 2, 2) + link('a', 'b') + link('a', 'c')));
    assert.deepStrictEqual(r.errors, []);
    assert.ok(r.boxes.b.x0 > r.boxes.a.x1, 'rank 2 is right of rank 1');
    assert.ok(Math.abs(r.boxes.b.x0 - r.boxes.c.x0) < 1, 'same rank, same column');
    assert.ok(r.boxes.c.y0 > r.boxes.b.y1, 'lane 2 is below lane 1');
    const ab = r.edges['a->b'];
    assert.ok(Math.abs(ab[0][0] - r.boxes.a.x1) < 1 && Math.abs(ab[ab.length - 1][0] - r.boxes.b.x0) < 1, 'leaves a, enters b');
    assert.deepStrictEqual(await findings(), []);
  });

  it('stacks ranks top to bottom with data-direction="down"', async () => {
    const r = await render(page(node('a', 1, 1) + node('b', 2, 1) + link('a', 'b'), 'data-direction="down"'));
    assert.ok(r.boxes.b.y0 > r.boxes.a.y1);
    const ab = r.edges['a->b'];
    assert.ok(Math.abs(ab[0][1] - r.boxes.a.y1) < 1 && Math.abs(ab[ab.length - 1][1] - r.boxes.b.y0) < 1);
  });

  it('routes a rank-skipping link around the node in between, and backward and same-rank links too', async () => {
    const r = await render(page(node('a', 1, 1) + node('mid', 2, 1) + node('c', 3, 1) + node('d', 1, 2) + link('a', 'mid') + link('mid', 'c') + link('a', 'c') + link('c', 'a') + link('a', 'd')));
    assert.deepStrictEqual(r.errors, []);
    for (const name of ['a->c', 'c->a', 'a->d']) assert.ok(r.edges[name], `${name} drawn`);
    assert.deepStrictEqual(
      (await findings()).filter((f) => f.check === 'edge-through-node'),
      [],
    );
  });

  it('boxes groups around their members only', async () => {
    const r = await render(page(node('a', 1, 1, 'data-group="g"') + node('b', 2, 1, 'data-group="g"') + node('c', 1, 2) + '<i data-od-group="g" data-label="Core" hidden></i>' + link('a', 'b')));
    const g = r.groups.g;
    for (const id of ['a', 'b']) assert.ok(g.x0 < r.boxes[id].x0 && g.x1 > r.boxes[id].x1 && g.y0 < r.boxes[id].y0 && g.y1 > r.boxes[id].y1, `${id} inside`);
    assert.ok(r.boxes.c.y0 > g.y1, 'c outside');
    assert.deepStrictEqual(await findings(), []);
  });

  it('lays out sequence diagrams with lifelines and ordered messages', async () => {
    const seq = `<!doctype html><html><body><div data-od-diagram="sequence">
      <div data-od-participant="u" ${NODE}>User</div><div data-od-participant="s" ${NODE}>Server</div>
      <i data-od-message data-from="u" data-to="s" data-label="GET /" hidden></i>
      <i data-od-message data-from="s" data-to="s" data-label="render" hidden></i>
      <i data-od-message data-from="s" data-to="u" data-kind="return" hidden></i></div>${diagramRuntimeBlock()}</body></html>`;
    const r = await render(seq);
    assert.deepStrictEqual(r.errors, []);
    assert.ok(r.boxes.s.x0 > r.boxes.u.x1);
    const first = r.edges['u->s'];
    const back = r.edges['s->u'];
    assert.ok(back[0][1] > first[0][1], 'messages go down in order');
    assert.ok(r.edges['s->s'].length === 4, 'self message is a loop');
    assert.strictEqual(await tab.evaluate('document.querySelectorAll("[data-od-lifeline]").length'), 2);
  });

  it('reports unknown ids and missing ranks, and the checks flag overlaps and crossings', async () => {
    await render(page(node('a', 1, 1) + '<div data-od-node="x" data-lane="1">x</div>' + link('a', 'ghost')));
    const errs = (await findings()).filter((f) => f.check === 'diagram-error').map((f) => f.message);
    assert.ok(errs.some((m) => m.includes('ghost')), JSON.stringify(errs));
    assert.ok(errs.some((m) => m.includes('"x"') && m.includes('data-rank')), JSON.stringify(errs));

    // A node pulled onto another with CSS, and one dragged across a link's path.
    await render(page(node('a', 1, 1) + node('b', 2, 1, 'class="moved"') + node('c', 3, 1) + link('a', 'c'), 'style="--x:0"').replace('</style>', '.moved{transform:translateX(-100px)}</style>'));
    const checks = (await findings()).map((f) => f.check);
    assert.ok(checks.includes('node-overlap') || checks.includes('edge-through-node'), JSON.stringify(checks));
  });
});
