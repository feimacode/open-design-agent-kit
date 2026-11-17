import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact } from '../../export/checkArtifact';
import { compareMotionOutsideScope, verbEffect, type ScopeMeasurements } from '../../export/editGuard';
import { filmstripBeats, isFilm, motionFindings, pageVocabulary, type MotionInventory } from '../../export/motionAudit';
import { prepareEdit } from '../../generation/steeringEdits';
import { isSteeringVerb, PAGE_SCOPE_VERBS, STEERING_VERBS } from '../../generation/steeringVerbs';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const inv = (o: Partial<MotionInventory>): MotionInventory => ({ transitions: [], animations: [], inferred: [], rootTokens: {}, ...o });
const anim = (selector: string, startMs: number, durationMs = 400) => ({ selector, name: 'rise', durationMs, startMs, easing: 'ease-out', properties: ['opacity', 'transform'], infinite: false, travelPx: 24 });
const codes = (f: ReturnType<typeof motionFindings>) => f.map((x) => x.check);

describe('motion checks: rules', () => {
  it('reports a slow linear hover (spec: slow linear hover)', () => {
    const f = motionFindings(inv({ transitions: [{ selector: 'button.go', interactive: true, property: 'background-color', durationMs: 800, easing: 'linear' }] }), { film: false });
    assert.deepStrictEqual(codes(f), ['motion-slow-ui', 'motion-linear-ui']);
    assert.match(f[0].message, /button\.go: background-color transition up to 800ms/);
  });

  it("doesn't call a spinner's linear easing a mistake", () => {
    const f = motionFindings(inv({ transitions: [{ selector: 'div.spinner', interactive: false, property: 'transform', durationMs: 300, easing: 'linear' }] }), { film: false });
    assert.deepStrictEqual(f, []);
  });

  it('judges a film only on crowding and the vocabulary (spec: film arrival)', () => {
    const film = inv({ transitions: [{ selector: 'h1.title', interactive: false, property: 'width', durationMs: 1200, easing: 'linear' }], animations: [anim('h1.title', 0, 1200)] });
    assert.deepStrictEqual(motionFindings(film, { film: true }), []);
    assert.deepStrictEqual(codes(motionFindings(film, { film: false })), ['motion-slow-ui', 'motion-linear-ui', 'motion-layout-property']);
  });

  it('reports ten cards entering at once, but not a stagger', () => {
    const together = inv({ animations: Array.from({ length: 10 }, (_, i) => anim(`div.card${i}`, 300)) });
    const f = motionFindings(together, { film: false });
    assert.deepStrictEqual(codes(f), ['motion-crowded']);
    assert.match(f[0].message, /^10 elements start moving within 100ms at 0\.30s/);
    const staggered = inv({ animations: Array.from({ length: 10 }, (_, i) => anim(`div.card${i}`, 300 + i * 60)) });
    assert.deepStrictEqual(motionFindings(staggered, { film: false }), []);
  });

  it('compares durations and easings with the vocabulary the page declares', () => {
    const rootTokens = { '--motion-fast': '150ms', '--motion-base': '200ms', '--ease-standard': 'cubic-bezier(0.2, 0, 0, 1)' };
    const vocab = pageVocabulary(rootTokens)!;
    assert.ok(vocab.durations.includes(400) && vocab.easings.has('cubic-bezier(0.2,0,0,1)'));
    const on = inv({ rootTokens, transitions: [{ selector: 'a.x', interactive: true, property: 'color', durationMs: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' }] });
    assert.deepStrictEqual(motionFindings(on, { film: false }), []);
    const off = inv({ rootTokens, transitions: [{ selector: 'a.x', interactive: true, property: 'color', durationMs: 330, easing: 'ease-in-out' }] });
    const f = motionFindings(off, { film: false });
    assert.deepStrictEqual(codes(f), ['motion-off-vocabulary', 'motion-off-vocabulary']);
    assert.match(f[0].message, /330ms on a\.x/);
    assert.strictEqual(pageVocabulary({}), undefined, 'no tokens, nothing to compare with');
  });

  it('picks filmstrip beats from frames, else animations, at most 12', () => {
    assert.deepStrictEqual(filmstripBeats({ frameDurationsMs: [1000, 1000, 1500], animations: [] }), [0, 1, 2, 3.45]);
    assert.deepStrictEqual(filmstripBeats({ frameDurationsMs: [], animations: [anim('a', 200, 600), anim('b', 400, 600)] }), [0.2, 0.4, 0.8, 1]);
    assert.strictEqual(filmstripBeats({ frameDurationsMs: Array(30).fill(500), animations: [] }).length, 12);
    assert.ok(isFilm('<section data-duration="2000">', undefined) && isFilm('<p>', 'od:video:video-hyperframes') && !isFilm('<p>', 'od:prototype:saas-landing'));
  });
});

describe('motion verbs', () => {
  const m = (motion: ScopeMeasurements['motion']): ScopeMeasurements => ({ maxFont: 0, maxWeight: 0, accentColors: 0, accentArea: 0, decorative: 0, spacing: 0, distinctSpacing: 0, distinctFonts: 0, distinctRadii: 0, visible: 1, words: 1, height: 1, stateFrames: 0, motion });
  const effect = (verb: Parameters<typeof verbEffect>[0], b: ScopeMeasurements['motion'], a: ScopeMeasurements['motion']) => verbEffect(verb, { before: m(b), after: m(a), findingsBefore: 0, findingsAfter: 0, signalsBefore: 0, signalsAfter: 0 });
  const base = { moving: 9, travel: 300, meanDuration: 600, overshoot: 0.3, easings: 3, abrupt: 2 };

  it('are steering verbs, allowed on the whole page', () => {
    for (const v of ['calmer', 'snappier', 'smoother']) assert.ok(isSteeringVerb(v) && PAGE_SCOPE_VERBS.includes(v as never));
    assert.strictEqual(STEERING_VERBS.length, 10);
  });

  it('measure their direction (spec: calmer hero)', () => {
    assert.deepStrictEqual(effect('calmer', base, { ...base, moving: 3, travel: 80, overshoot: 0 }), ['moving elements 9→3', 'travel 300→80 px', 'overshoot 0.30→0.00']);
    assert.deepStrictEqual(effect('snappier', base, { ...base, meanDuration: 250 }), ['mean duration 600→250 ms']);
    assert.deepStrictEqual(effect('smoother', base, { ...base, easings: 1, abrupt: 0 }), ['easing curves 3→1', 'abrupt starts or stops 2→0']);
    assert.deepStrictEqual(effect('calmer', base, base), []);
  });

  it('name motion that changed outside the part', () => {
    const before = { 'a.btn.footer-link@40': 'transition all 0.3s ease', 'div.hero@3': 'animation rise 0.6s ease-out' };
    const after = { 'a.btn.footer-link@40': 'transition all 0.12s ease', 'div.hero@3': 'animation rise 0.6s ease-out' };
    const msgs = compareMotionOutsideScope(before, after);
    assert.strictEqual(msgs.length, 1);
    assert.match(msgs[0], /^a\.btn\.footer-link outside the edited part moves differently now \(transition all 0\.3s ease → transition all 0\.12s ease\)/);
  });
});

describe('motion checks in the check (real browser; skipped when none is installed)', function () {
  this.timeout(240000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });
  const ENTRY = '.open-design/motion/page.html';
  async function workspace(html: string, manifest: Record<string, unknown> = {}): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-motion-check-'));
    await fs.mkdir(path.join(root, '.open-design', 'motion'), { recursive: true });
    await fs.writeFile(path.join(root, ENTRY), html);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Motion', ...manifest } });
    return root;
  }
  const page = (body: string, style = '', script = '') => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0;font:18px/1.5 sans-serif;color:#111;background:#fff} main{padding:24px} ${style}</style></head><body><main><h1>Launch</h1>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
  const check = async (html: string, extra: Record<string, unknown> = {}, manifest: Record<string, unknown> = {}) => {
    const r = await checkArtifact({ workspaceRoot: await workspace(html, manifest), entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 0, saveRun: false, ...extra });
    assert.ok(r.ok, JSON.stringify(r));
    return r;
  };

  it('reports a slow linear hover, a width animation and ten cards entering at once', async () => {
    const cards = Array.from({ length: 10 }, (_, i) => `<div class="card">Card ${i + 1}</div>`).join('');
    const r = await check(
      page(`<button class="go">Continue</button><div class="bar"></div>${cards}`, `.go{transition:background-color 800ms linear} .go:hover{background:#ddd} @keyframes grow{from{width:0}to{width:200px}} .bar{height:4px;background:#111;animation:grow 400ms ease-out both} @keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}} .card{animation:rise 500ms ease-out both}`),
      { states: false },
    );
    const got = new Set(r.findings.map((f) => f.check));
    for (const c of ['motion-slow-ui', 'motion-linear-ui', 'motion-layout-property', 'motion-crowded']) assert.ok(got.has(c), `${c} in ${JSON.stringify(r.findings)}`);
    assert.match(r.findings.find((f) => f.check === 'motion-slow-ui')!.message, /button\.go/);
  });

  it('reports script motion that ignores reduced motion as an error (motion-no-reduced-path)', async () => {
    const r = await check(page('<div class="orb" style="width:40px;height:40px;background:#e11d48"></div>', '', "const o=document.querySelector('.orb');(function f(t){o.style.transform='translateX('+Math.round(Math.sin(t/300)*80)+'px)';requestAnimationFrame(f)})(0);"));
    const hit = r.findings.find((f) => f.check === 'motion-no-reduced-path');
    assert.ok(hit && hit.severity === 'error', JSON.stringify(r.findings));
  });

  it("doesn't hold a film's long arrival to UI limits, and returns a filmstrip of its frames (spec: storyboard film)", async () => {
    const frames = Array.from({ length: 8 }, (_, i) => `<section data-duration="500" style="--i:${i}"></section>`).join('');
    const r = await check(page(`${frames}<h2 class="t">Hello</h2>`, '@keyframes in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}} .t{animation:in 1200ms cubic-bezier(0.2,0,0,1) both}'), { filmstrip: true, maxImages: 2, states: false }, { sourceSkillId: 'od:video:video-hyperframes' });
    assert.ok(!r.findings.some((f) => f.check === 'motion-slow-ui'), JSON.stringify(r.findings));
    assert.match(r.images[0].label, /^filmstrip: 0s, 0\.5s, 1s, 1\.5s, 2s, 2\.5s, 3s, 3\.5s, 3\.95s$/);
    assert.strictEqual(r.images.length, 2, 'the filmstrip counts as one image');
  });

  it('a calmer edit that moves fewer elements passes; a shared transition that leaks out is out of scope', async () => {
    const cards = Array.from({ length: 6 }, (_, i) => `<div class="card">Card ${i + 1}</div>`).join('');
    const html = page(`<section class="hero"><h2>Hero</h2>${cards}</section><footer><a class="btn" href="#">Contact</a></footer>`, '@keyframes rise{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}} .card{animation:rise 600ms cubic-bezier(0.34,1.4,0.64,1) both} .btn{transition:color 300ms ease}');
    const root = await workspace(html);
    const prepared = await prepareEdit({ workspaceRoot: root, outputDir: '.open-design', entryPath: ENTRY, verb: 'calmer', scope: { heading: 'Hero' } });
    assert.ok(prepared.status === 'prepared', JSON.stringify(prepared));
    const stamped = await fs.readFile(path.join(root, ENTRY), 'utf8');
    const scoped = stamped.replace('</style>', '[data-od-id="edit-hero"] .card:nth-child(n+3){animation:none} [data-od-id="edit-hero"] .card{animation-timing-function:ease-out}</style>');
    await fs.writeFile(path.join(root, ENTRY), scoped);
    const good = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, editId: prepared.editId, browserPath, states: false, saveRun: false, maxImages: 0 });
    assert.ok(good.ok, JSON.stringify(good));
    assert.deepStrictEqual(good.findings.filter((f) => f.check === 'edit-no-effect' || f.check === 'edit-out-of-scope'), [], JSON.stringify(good.findings));
    assert.match(good.editSummary ?? '', /moving elements 6→\d/);

    await fs.writeFile(path.join(root, ENTRY), stamped.replace('.btn{transition:color 300ms ease}', '.btn{transition:color 100ms ease}'));
    const leaky = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, editId: prepared.editId, browserPath, states: false, saveRun: false, maxImages: 0 });
    assert.ok(leaky.ok);
    assert.ok(leaky.findings.some((f) => f.check === 'edit-out-of-scope' && /a\.btn outside the edited part moves differently now/.test(f.message)), JSON.stringify(leaky.findings));
  });
});
