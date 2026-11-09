import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefProblem, countAssumptionLines, countQuestions, loadBriefs, parseTranscript, scoreRows, signatureFromHtml, summary } from '../evals/lib.mjs';

test('every committed brief loads, with six surfaces and at least two vague ones', async () => {
  const briefs = await loadBriefs();
  const surfaces = new Set(briefs.filter((b) => !b.vague).map((b) => b.expect.surface));
  for (const s of ['poster', 'prototype', 'slides', 'shop', 'cards', 'data-report']) assert.ok(surfaces.has(s), `no brief for ${s}`);
  assert.ok(briefs.filter((b) => b.vague).length >= 2);
});

test('briefProblem names what is missing', () => {
  assert.match(briefProblem({ id: 'x', request: 'r', expect: { surface: 'poster' }, must: ['m'] }, 'y.yaml'), /file name/);
  assert.match(briefProblem({ id: 'x', expect: { surface: 'poster' }, must: ['m'] }, 'x.yaml'), /request/);
  assert.match(briefProblem({ id: 'x', request: 'r', expect: { surface: 'poster' }, must: [] }, 'x.yaml'), /must/);
  assert.equal(briefProblem({ id: 'x', request: 'r', expect: { surface: 'poster' }, answers: { a: 'b' }, must: ['m'] }, 'x.yaml'), undefined);
  assert.match(briefProblem({ id: 'x', request: 'r', expect: { surface: 'any' }, site: 'nope', must: ['m'] }, 'x.yaml'), /site must name a folder/);
  assert.match(briefProblem({ id: 'x', request: 'Audit it', expect: { surface: 'any' }, site: 'trattoria-site', must: ['m'] }, 'x.yaml'), /\{\{site\}\}/);
  assert.equal(briefProblem({ id: 'x', request: 'Audit {{site}}', expect: { surface: 'any' }, site: 'trattoria-site', must: ['m'] }, 'x.yaml'), undefined);
  assert.match(briefProblem({ id: 'x', request: 'r', expect: { surface: 'any' }, followUps: 'bolder', must: ['m'] }, 'x.yaml'), /followUps/);
  assert.equal(briefProblem({ id: 'x', request: 'r', expect: { surface: 'any' }, followUps: ['Make it bolder'], must: ['m'] }, 'x.yaml'), undefined);
});

test('summary counts steering edits and how they were checked', () => {
  const edits = [
    { verb: 'bolder', scope: 'the pricing section', status: 'checked', checked: true, outOfScope: 0, regressions: 0, noEffect: false },
    { verb: 'roomier', scope: 'the table', status: 'checked', checked: true, outOfScope: 2, regressions: 0, noEffect: false },
    { verb: 'quieter', scope: 'the footer', status: 'prepared', checked: false, outOfScope: 0, regressions: 0, noEffect: false },
    { verb: 'denser', scope: 'the hero', status: 'undone', checked: false, outOfScope: 0, regressions: 0, noEffect: false },
  ];
  const text = summary([{ repeat: 1, designs: [{ errors: {}, warnings: {}, signature: { source: 'html' }, edits }] }]);
  assert.match(text, /Steering edits: 4; checked and in scope with no new findings 1; unchecked 1; undone or dropped 1; no measurable effect 0\./);
});

test('parseTranscript collects text, tool uses and the result, skipping other events', () => {
  const lines = [
    { type: 'system', subtype: 'init' },
    { type: 'stream_event' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }, { type: 'tool_use', name: 'Skill', input: {} }] } },
    'not json',
    { type: 'result', session_id: 's1', total_cost_usd: 0.1 },
  ].map((l) => (typeof l === 'string' ? l : JSON.stringify(l)));
  const t = parseTranscript(lines.join('\n'));
  assert.deepEqual(t.texts, ['Hi']);
  assert.equal(t.toolUses.length, 1);
  assert.equal(t.result.session_id, 's1');
});

test('countQuestions counts distinct lines with a question mark', () => {
  assert.equal(countQuestions('Before I start, is this for print?\n- Which size?\n1. Which size?\nThanks.'), 2);
  assert.equal(countQuestions('1. **Print or screens?** If print, which size.'), 1);
  assert.equal(countQuestions('Done. It is at .open-design/x.html'), 0);
});

test('countAssumptionLines finds stated assumptions', () => {
  assert.equal(countAssumptionLines(['Assumed: A3 print.\n- I picked a dark theme\nNothing else', '**Assumptions**']), 3);
});

test('signatureFromHtml reads accent, fonts and theme, resolving custom properties', () => {
  const html = `<style>
    :root { --bg: #0b0b10; --accent: #e2b04a; }
    body { background: var(--bg); font-family: "Inter", sans-serif; }
    h1 { font-family: 'Playfair Display', serif; color: #333; }
  </style>`;
  assert.deepEqual(signatureFromHtml(html), { accent: '#e2b04a', display: 'Playfair Display', body: 'Inter', theme: 'dark' });
  assert.deepEqual(signatureFromHtml('<p>no css</p>'), { accent: undefined, display: undefined, body: undefined, theme: undefined });
});

test('scoreRows flags off-route skills and question counts, and shows n/a without an agent run', () => {
  const brief = { id: 'gig-poster', expect: { surface: 'poster', skills: ['poster-hero'], questions: { max: 1 } }, must: ['m'] };
  const design = { entryPath: 'a.html', skill: 'od:prototype:image-poster', checkOk: true, errors: { contrast: 2 }, warnings: {}, signature: { source: 'html' } };
  const [row] = scoreRows([{ brief: 'gig-poster', repeat: 1, designs: [design], questions: 2, toolCalls: 5, wallSeconds: 61.4 }], new Map([['gig-poster', brief]]));
  assert.equal(row.skill, 'od:prototype:image-poster ⚠');
  assert.equal(row.questions, '2 ⚠');
  assert.equal(row.errors, '2');
  assert.equal(row.errorCodes, 'contrast×2');
  assert.equal(row.critic, 'n/a');
  assert.equal(row.time, '61s');
  const [scored] = scoreRows([{ workspace: '/w/desktop-poster', designs: [{ ...design, skill: 'od:prototype:poster-hero' }] }]);
  assert.equal(scored.questions, 'n/a');
  assert.equal(scored.toolCalls, 'n/a');
});

test('summary totals errors per repeat and counts distinct signatures', () => {
  const d = (errors, accent) => ({ errors, warnings: {}, signature: { source: 'html', accent } });
  const text = summary([
    { repeat: 1, designs: [d({ a: 1 }, '#f00')] },
    { repeat: 2, designs: [d({ a: 2, b: 1 }, '#f00'), d({}, '#00f')] },
    { repeat: 2, designs: [] },
  ]);
  assert.match(text, /#1 1, #2 3/);
  assert.match(text, /Distinct look signatures: 2 of 3/);
  assert.match(text, /runs with no design: 1/);
  assert.match(text, /Critic: n\/a/);
});

test('summary counts before/after pages and their re-checked findings', () => {
  const text = summary([{ repeat: 1, designs: [], beforeAfter: [{ entryPath: 'a/before-after.html', fixed: 3, open: 1, summary: 2 }] }]);
  assert.match(text, /Before\/after pages: 1; audit findings re-checked as fixed 3, still open 1; cited summary lines 2/);
  assert.doesNotMatch(summary([{ repeat: 1, designs: [] }]), /Before\/after/);
});
