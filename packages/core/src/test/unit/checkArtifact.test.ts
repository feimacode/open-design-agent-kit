import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact, formatCheckResult, MAX_IMAGE_EDGE, type CheckArtifactResult } from '../../export/checkArtifact';
import { exportArtifact } from '../../export/exportArtifact';
import { diagramRuntimeBlock } from '../../generation/diagramRuntime';
import { prepareSourceRegistration } from '../../generation/sourceNumberCheck';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/check/page.html';

async function workspace(html: string, manifest: Record<string, unknown> = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-check-'));
  await fs.mkdir(path.join(root, '.open-design', 'check'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), html);
  await writeArtifactManifest({
    workspaceRoot: root,
    entryPath: ENTRY,
    artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Check', ...manifest },
  });
  return root;
}

/** Every file under root except the saved check runs, with its mtime, to prove a check writes nothing else. */
async function snapshot(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '.checks') await walk(p);
      }
      else out.push(`${path.relative(root, p)}@${(await fs.stat(p)).mtimeMs}`);
    }
  };
  await walk(root);
  return out.sort();
}

type Ok = Extract<CheckArtifactResult, { ok: true }>;
function ok(result: CheckArtifactResult): Ok {
  assert.ok(result.ok, JSON.stringify(result));
  return result as Ok;
}

const page = (body: string, style = '') => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
  body{margin:0;font:18px/1.5 sans-serif;color:#111;background:#fff}
  main{padding:24px}
  ${style}
</style></head><body><main><h1>Launch</h1><p>Plain words on a plain page.</p>${body}</main></body></html>`;

describe('visual check (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });
  const check = (root: string, extra: Partial<Parameters<typeof checkArtifact>[0]> = {}) =>
    checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, ...extra });

  it('checks a page at desktop and mobile, flags a fixed-width table on the phone, and writes only its saved run', async () => {
    const root = await workspace(page('<table style="width:900px"><tr><td>Plan</td><td>Price</td></tr></table>'));
    const before = await snapshot(root);
    const result = ok(await check(root));
    assert.deepStrictEqual(await snapshot(root), before);
    assert.ok(result.savedRun);
    assert.deepStrictEqual(result.savedRun!.run.images.map((i) => i.label), ['desktop', 'mobile']);
    assert.match(formatCheckResult(result), /Screenshots saved for the user: \.open-design\/\.checks\//);
    const second = ok(await check(root));
    assert.strictEqual(second.savedRun!.previous?.run.id, result.savedRun!.run.id);
    assert.match(formatCheckResult(second), /Previous check: .*errors 1 → 1/);
    assert.strictEqual(result.mode, 'page');
    assert.deepStrictEqual(result.images.map((i) => i.label), ['desktop', 'mobile']);
    for (const img of result.images) {
      assert.strictEqual(img.mime, 'image/jpeg');
      assert.strictEqual(img.data[0], 0xff);
      assert.strictEqual(img.data[1], 0xd8);
      assert.ok(Math.max(img.width, img.height) <= MAX_IMAGE_EDGE);
    }
    const scroll = result.findings.filter((f) => f.check === 'horizontal-scroll');
    assert.strictEqual(scroll.length, 1, JSON.stringify(result.findings));
    assert.strictEqual(scroll[0].viewport, 'mobile');
    assert.strictEqual(scroll[0].severity, 'error');
    assert.match(scroll[0].message, /^The page is \d+px wide in a 390px viewport.*table/);
    const text = formatCheckResult(result);
    assert.match(text, /ERROR \[horizontal-scroll\] mobile:/);
    assert.match(text, /Screenshots \(2, attached in this order\): desktop 1440×900; mobile 390×844/);
  });

  it('does not flag a carousel in an overflow-x: auto container or an off-canvas drawer', async () => {
    const root = await workspace(
      page(
        '<div class="rail"><div class="tile">1</div><div class="tile">2</div><div class="tile">3</div></div><nav class="drawer">Menu</nav>',
        '.rail{display:flex;gap:16px;overflow-x:auto}.tile{flex:0 0 300px;height:120px;background:#ddd}.drawer{position:fixed;top:0;right:0;width:300px;height:100vh;transform:translateX(100%);background:#eee}',
      ),
    );
    const result = ok(await check(root));
    assert.deepStrictEqual(result.findings.filter((f) => f.check === 'horizontal-scroll'), []);
  });

  it('reports desktop overflow as a warning', async () => {
    const root = await workspace(page('<div style="width:1700px;height:40px;background:#ccc">wide</div>'));
    const result = ok(await check(root, { viewports: [{ name: 'desktop', width: 1440, height: 900 }] }));
    const scroll = result.findings.filter((f) => f.check === 'horizontal-scroll');
    assert.strictEqual(scroll.length, 1);
    assert.strictEqual(scroll[0].severity, 'warning');
  });

  it('does not report text in a scroll container (overflow-x: auto) as clipped, but still reports overflow: hidden', async () => {
    const wide = '<table style="width:900px"><tr><td>Option</td><td>Outcome</td></tr></table>';
    const root = await workspace(page(`<div style="overflow-x:auto">${wide}</div><div style="overflow:hidden;width:200px;white-space:nowrap"><span>This label is far too long for its box</span></div>`));
    const result = ok(await check(root, { maxImages: 0 }));
    const overflow = result.findings.filter((f) => f.check === 'overflow');
    assert.ok(overflow.every((f) => !/Option|Outcome/.test(f.message)), JSON.stringify(overflow));
    assert.ok(overflow.some((f) => /far too long/.test(f.message)), JSON.stringify(result.findings));
    assert.deepStrictEqual(result.findings.filter((f) => f.check === 'horizontal-scroll'), []);
  });

  it('does not flag a scrolling code block inside a rounded overflow: hidden box, a © sign, or contrast just under 4.5 as 4.5', async () => {
    const code = '<div class="code-box" style="overflow:hidden;border-radius:8px;width:300px"><pre style="overflow-x:auto;margin:0"><span>// project root — commit it so your team gets the same server config</span></pre></div>';
    // #777 on white is 4.48:1.
    const root = await workspace(page(`${code}<p>© 2026 Open Design contributors</p><p>Party 🎉</p><span style="color:#777">2 viewports</span>`));
    const result = ok(await check(root, { maxImages: 0 }));
    assert.deepStrictEqual(result.findings.filter((f) => f.check === 'overflow'), []);
    const emoji = result.findings.filter((f) => f.check === 'emoji');
    assert.ok(emoji.length > 0 && emoji.every((f) => /Party/.test(f.message) && !/©/.test(f.message)), JSON.stringify(emoji));
    const contrast = result.findings.filter((f) => f.check === 'contrast');
    assert.ok(contrast.some((f) => /2 viewports" has a contrast ratio of 4\.4\d:1/.test(f.message)), JSON.stringify(contrast));
  });

  it('caps images on a tall page and lists what was left out', async () => {
    const root = await workspace(page('<div style="height:6000px;background:linear-gradient(#fff,#ccc)"></div>'));
    const result = ok(await check(root));
    assert.strictEqual(result.images.length, 3);
    assert.deepStrictEqual(result.images.slice(0, 2).map((i) => i.label.split(' ')[0]), ['desktop', 'mobile']);
    assert.ok(result.omitted.length > 0);
    assert.match(formatCheckResult(result), /Not attached: /);
  });

  it('returns findings only with maxImages: 0', async () => {
    const root = await workspace(page('<table style="width:900px"><tr><td>x</td></tr></table>'));
    const result = ok(await check(root, { maxImages: 0 }));
    assert.deepStrictEqual(result.images, []);
    assert.ok(result.findings.some((f) => f.check === 'horizontal-scroll'));
    assert.deepStrictEqual(result.omitted, ['desktop', 'mobile']);
  });

  it('checks a card design at its format size, ignoring viewports', async () => {
    const root = await workspace(
      `<!doctype html><html><head><style>body{margin:0;background:#888;display:flex;justify-content:center;padding:40px}
      [data-od-card]{width:1080px;height:1350px;flex-shrink:0;background:#14213d;color:#fff;font:64px sans-serif;position:relative}
      h1{position:absolute;left:96px;top:120px;margin:0}</style></head><body><div data-od-card><h1>Hack Night</h1></div></body></html>`,
      { metadata: { format: 'ig-portrait' } },
    );
    const result = ok(await check(root));
    assert.strictEqual(result.mode, 'cards');
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].label, 'Instagram portrait');
    assert.deepStrictEqual([result.images[0].width, result.images[0].height], [1080, 1350]);
    assert.ok(result.findings.every((f) => f.viewport === undefined));
    assert.deepStrictEqual(result.findings.filter((f) => f.severity === 'error'), []);
  });

  it('checks a deck slide by slide and returns one contact sheet', async () => {
    const slide = (n: number, body: string) => `<section class="slide" style="width:1920px;height:1080px;position:relative;background:#fff;font:48px sans-serif;overflow:hidden"><h2 style="margin:80px">Slide ${n}</h2>${body}</section>`;
    const root = await workspace(
      `<!doctype html><html><head><style>body{margin:0}</style></head><body>${slide(1, '')}${slide(
        2,
        '<div style="width:400px;height:60px;overflow:hidden;margin:80px"><p style="margin:0">This paragraph is far too long for the small box it was given on this slide.</p></div>',
      )}${slide(3, '')}</body></html>`,
      { kind: 'deck', renderer: 'deck-html' },
    );
    const result = ok(await check(root));
    assert.strictEqual(result.mode, 'deck');
    assert.strictEqual(result.slideCount, 3);
    const overflow = result.findings.filter((f) => f.check === 'overflow');
    assert.ok(overflow.length > 0, JSON.stringify(result.findings));
    assert.ok(overflow.every((f) => f.slide === 2), JSON.stringify(overflow));
    assert.deepStrictEqual(result.images.map((i) => i.label), ['slides 1–3']);
    assert.ok(Math.max(result.images[0].width, result.images[0].height) <= MAX_IMAGE_EDGE);
    assert.match(formatCheckResult(result), /ERROR \[overflow\] slide 2:/);
  });

  const diagram = (links: string) => `<!doctype html><html><head><style>body{margin:0;font:14px sans-serif}.n{width:120px;height:44px;border:1px solid #888;background:#fff}</style></head><body>
    <div data-od-diagram><div class="n" data-od-node="web" data-rank="1" data-lane="1">web</div><div class="n" data-od-node="api" data-rank="2" data-lane="1">api</div>${links}</div>${diagramRuntimeBlock()}</body></html>`;

  it('checks a diagram at desktop width only and reports runtime errors', async () => {
    const root = await workspace(diagram('<i data-od-link data-from="web" data-to="api" hidden></i><i data-od-link data-from="api" data-to="cache" hidden></i>'), { kind: 'diagram', renderer: 'diagram' });
    const result = ok(await check(root));
    assert.deepStrictEqual(result.viewports?.map((v) => v.name), ['desktop']);
    const errors = result.findings.filter((f) => f.check === 'diagram-error');
    assert.strictEqual(errors.length, 1, JSON.stringify(result.findings));
    assert.match(errors[0].message, /cache/);
    assert.ok(result.findings.every((f) => f.viewport === undefined || f.viewport === 'desktop'));
  });

  it('exports a diagram to PNG with its connectors drawn', async () => {
    const root = await workspace(diagram('<i data-od-link data-from="web" data-to="api" hidden></i>'), { kind: 'diagram', renderer: 'diagram' });
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, format: 'png' });
    assert.ok(result.ok && !('output' in result), JSON.stringify(result));
    assert.strictEqual(result.files.length, 1);
  });

  it('reports stale code sources recorded at registration', async () => {
    const root = await workspace(diagram('<i data-od-link data-from="web" data-to="api" hidden></i>'));
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'api.ts'), 'export const port = 1;\n');
    const reg = await prepareSourceRegistration({ workspaceRoot: root, outputDir: '.open-design', entryPath: ENTRY, sourcePaths: ['src/api.ts'] });
    assert.deepStrictEqual(reg.sources.map((s) => s.path), ['src/api.ts']);
    assert.deepStrictEqual(reg.warnings, []);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'diagram', renderer: 'diagram', exports: ['svg'], title: 'D', sources: reg.sources } });
    assert.ok(ok(await check(root, { maxImages: 0 })).findings.every((f) => f.check !== 'stale-sources'));
    await fs.writeFile(path.join(root, 'src', 'api.ts'), 'export const port = 2;\n');
    const stale = ok(await check(root, { maxImages: 0 })).findings.filter((f) => f.check === 'stale-sources');
    assert.strictEqual(stale.length, 1);
    assert.match(stale[0].message, /src\/api\.ts \(changed\)/);
  });

  it('rejects unregistered entries, unsupported renderers and bad options without a browser', async () => {
    const root = await workspace(page(''), { kind: 'markdown-document', renderer: 'markdown' });
    const unsupported = await check(root);
    assert.ok(!unsupported.ok && unsupported.code === 'unsupported-kind');
    const missing = await checkArtifact({ workspaceRoot: root, entryPath: '.open-design/check/none.html' });
    assert.ok(!missing.ok && missing.code === 'not-found');
    const bad = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, maxImages: 7 });
    assert.ok(!bad.ok && bad.code === 'invalid-args');
    const dup = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, viewports: [{ name: 'a', width: 400, height: 800 }, { name: 'a', width: 800, height: 800 }] });
    assert.ok(!dup.ok && dup.code === 'invalid-args');
    const page2 = await workspace(page(''));
    const slides = await check(page2, { slides: [1] });
    assert.ok(!slides.ok && slides.code === 'invalid-args');
  });
});

describe('state accessibility checks (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });
  const findings = async (html: string, extra: Partial<Parameters<typeof checkArtifact>[0]> = {}, manifest: Record<string, unknown> = {}) =>
    ok(await checkArtifact({ workspaceRoot: await workspace(html, manifest), entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 0, ...extra })).findings;
  const STATE = ['state-contrast', 'focus-visible', 'tap-target', 'reflow', 'reduced-motion', 'motion-no-reduced-path'];
  const stateCodes = (list: Awaited<ReturnType<typeof findings>>) => list.filter((f) => STATE.includes(f.check) && f.severity !== 'info');

  it('reports a hover colour that drops below 4.5:1, naming the button and the state', async () => {
    const found = await findings(page('<button class="go">Continue</button>', '.go{background:#fff;color:#222;border:2px solid #222;padding:12px 20px;font:16px sans-serif} .go:hover{color:#aaa;border-color:#aaa}'));
    const hits = found.filter((f) => f.check === 'state-contrast');
    assert.strictEqual(hits.length, 1, JSON.stringify(found));
    assert.match(hits[0].message, /button\.go "Continue" drops to 2\.\d+:1 contrast on hover \(needs 4\.5:1/);
  });

  it('reports links whose focus outline is removed as one grouped focus-visible error, and keeps the browser outline as visible', async () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="#${i}" class="l">Link ${i + 1}</a> `).join('');
    const found = await findings(page(`<nav>${links}</nav>`, 'a:focus{outline:none} nav{display:flex;flex-wrap:wrap;gap:16px} a{padding:12px}'));
    const hits = found.filter((f) => f.check === 'focus-visible');
    assert.strictEqual(hits.length, 1, JSON.stringify(found));
    assert.strictEqual(hits[0].severity, 'error');
    assert.match(hits[0].message, /^30 elements: a\.l "Link 1"; a\.l "Link 2"; a\.l "Link 3"; a\.l "Link 4"; a\.l "Link 5" and 25 more\. The first: a\.l "Link 1" shows no change when focused/);
    const fine = await findings(page(`<nav>${links}</nav>`, 'nav{display:flex;flex-wrap:wrap;gap:16px} a{padding:12px}'));
    assert.deepStrictEqual(fine.filter((f) => f.check === 'focus-visible'), []);
  });

  it('reports a small icon button next to another on the phone, but not a link inside a paragraph', async () => {
    const found = await findings(
      page('<div class="bar"><button class="close" aria-label="Close">×</button><button class="pin" aria-label="Pin">+</button></div><p>Read <a href="#t">the terms</a> before you start.</p>',
        '.bar{display:flex;gap:4px} .bar button{width:20px;height:20px;padding:0;border:0;background:#eee;color:#111;font:14px sans-serif}'),
    );
    const hits = found.filter((f) => f.check === 'tap-target');
    assert.strictEqual(hits.length, 1, JSON.stringify(found));
    assert.strictEqual(hits[0].severity, 'warning');
    assert.strictEqual(hits[0].viewport, 'mobile');
    assert.match(hits[0].message, /^2 elements: button\.close "×"; button\.pin "\+"\. The first: button\.close "×" is 20×20px on a phone, too close to button\.pin/);
    assert.ok(!found.some((f) => f.check === 'tap-target' && /terms/.test(f.message)));
  });

  it('reports a layout with a 360px minimum width as a reflow error at 320px', async () => {
    // 360px with main's 24px padding: fits the 390px phone, scrolls at 320px.
    const found = await findings(page('<div class="wide">Pricing</div>', 'main{min-width:312px}'));
    const hits = found.filter((f) => f.check === 'reflow');
    assert.ok(hits.length >= 1, JSON.stringify(found));
    assert.ok(hits.every((f) => f.severity === 'error' && f.viewport === '320px'));
    assert.ok(!found.some((f) => f.check === 'horizontal-scroll'));
  });

  it('reports an endless marquee that ignores reduced motion, and not one that honours it', async () => {
    const marquee = '<div class="m">Now booking</div>';
    const css = '@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-100px)}} .m{animation:slide 4s linear infinite}';
    const hits = (await findings(page(marquee, css))).filter((f) => f.check === 'motion-no-reduced-path');
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].severity, 'error');
    assert.match(hits[0].message, /div\.m "Now booking" keeps its animation "slide" \(looping\)/);
    const honoured = await findings(page(marquee, `${css} @media (prefers-reduced-motion: reduce){.m{animation:none}}`));
    assert.deepStrictEqual(honoured.filter((f) => f.check === 'motion-no-reduced-path' || f.check === 'reduced-motion'), []);
  });

  it('runs none of the state checks with states: false, or on a fixed-format poster', async () => {
    const bad = page('<div class="m">x</div><button style="width:10px;height:10px;padding:0"></button><button style="width:10px;height:10px;padding:0"></button>', 'main{min-width:360px} a:focus,button:focus{outline:none} @keyframes s{to{opacity:.2}} .m{animation:s 1s infinite}');
    assert.ok(stateCodes(await findings(bad)).length > 0);
    assert.deepStrictEqual(stateCodes(await findings(bad, { states: false })), []);
    const poster = `<!doctype html><html><head><style>body{margin:0}[data-od-card]{width:1080px;height:1350px;background:#fff;font:64px sans-serif}
      @keyframes s{to{opacity:.2}} h1{animation:s 1s infinite}</style></head><body><div data-od-card><h1>Gig</h1><a href="#" style="outline:none">Tickets</a></div></body></html>`;
    assert.deepStrictEqual(stateCodes(await findings(poster, {}, { metadata: { format: 'ig-portrait' } })), []);
  });

  it('attaches a crop of the unfocused element and the 320px render when they fail, within maxImages', async () => {
    const root = await workspace(page('<a href="#x" class="bare">Read more</a>', 'a:focus{outline:none} main{min-width:312px}'));
    const result = ok(await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 4, saveRun: false }));
    assert.deepStrictEqual(result.images.map((i) => i.label), ['desktop', 'mobile', 'focus: a.bare "Read more"', 'reflow 320px']);
    const capped = ok(await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 2, saveRun: false }));
    assert.deepStrictEqual(capped.omitted, ['focus: a.bare "Read more"', 'reflow 320px']);
  });
});
