import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { chatCompletion, fileTools, HIDDEN_KIT_TOOLS, mcpResultText, mcpToFunctions, runTurn } from '../evals/apiAgent.mjs';
import { armComparison, bareEligible, caseVerdict } from '../evals/lib.mjs';

const ok = (message, usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }], usage }) });

test('chatCompletion posts to /chat/completions with the key and retries a rate limit', async () => {
  const calls = [];
  const replies = [{ ok: false, status: 429, headers: new Map([['retry-after', '0']]), text: async () => 'slow down' }, ok({ role: 'assistant', content: 'hi' })];
  const fetchImpl = async (url, init) => (calls.push({ url, init }), replies.shift());
  const res = await chatCompletion({ baseUrl: 'https://api.example.com/v1/', apiKey: 'k', model: 'm', messages: [], fetchImpl, sleep: async () => {} });
  assert.equal(res.choices[0].message.content, 'hi');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, 'Bearer k');
  assert.equal(JSON.parse(calls[0].init.body).model, 'm');
});

test('chatCompletion throws a client error at once, with the status', async () => {
  let n = 0;
  const fetchImpl = async () => (n++, { ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'bad key' });
  await assert.rejects(chatCompletion({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', messages: [], fetchImpl, sleep: async () => {} }), /401.*bad key/);
  assert.equal(n, 1);
});

test('fileTools write, read and list inside the folder and refuse paths outside it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-evals-files-'));
  try {
    const files = fileTools(root);
    assert.match(await files.call('write_file', { path: 'a/b.html', content: '<p>x</p>' }), /Wrote a\/b.html/);
    assert.equal(await readFile(path.join(root, 'a', 'b.html'), 'utf8'), '<p>x</p>');
    assert.equal(await files.call('read_file', { path: 'a/b.html' }), '<p>x</p>');
    assert.equal(await files.call('list_files', {}), 'a/\na/b.html');
    await assert.rejects(files.call('read_file', { path: '../secret' }), /outside the working folder/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('mcpToFunctions hides tools that pick another folder or open windows, and mcpResultText flattens content', () => {
  const tools = mcpToFunctions([...HIDDEN_KIT_TOOLS].map((name) => ({ name })).concat({ name: 'check_open_design_artifact', description: 'Checks', inputSchema: { type: 'object' } }));
  assert.deepEqual(tools.map((t) => t.function.name), ['check_open_design_artifact']);
  assert.equal(mcpResultText({ content: [{ type: 'text', text: 'a' }, { type: 'image', mimeType: 'image/png' }] }), 'a\n\n[image: image/png, not shown]');
  assert.equal(mcpResultText({ isError: true, content: [{ type: 'text', text: 'no' }] }), 'Error: no');
});

test('runTurn runs tool calls until the model answers, and reports tools, text and tokens', async () => {
  const replies = [
    ok({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"x":1}' } }, { id: 'c2', type: 'function', function: { name: 'echo', arguments: '{bad' } }] }),
    ok({ role: 'assistant', content: 'Done.' }),
  ];
  const sent = [];
  const fetchImpl = async (_url, init) => (sent.push(JSON.parse(init.body)), replies.shift());
  const echo = { definitions: [{ type: 'function', function: { name: 'echo', parameters: { type: 'object' } } }], names: new Set(['echo']), call: async (_n, args) => `got ${args.x}` };
  const messages = [{ role: 'user', content: 'go' }];
  const t = await runTurn({ endpoint: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl }, messages, toolsets: [echo], maxTurns: 5 });
  assert.equal(t.finalText, 'Done.');
  assert.deepEqual(t.toolUses, [{ name: 'echo', input: { x: 1 } }]);
  assert.deepEqual(t.usage, { prompt: 20, completion: 10 });
  assert.deepEqual(sent[1].messages.filter((m) => m.role === 'tool').map((m) => m.content), ['got 1', 'Error: the arguments were not valid JSON. Send the call again with valid JSON arguments.']);
  assert.equal(sent[0].tools[0].function.name, 'echo');
});

test('runTurn stops at the turn cap', async () => {
  const fetchImpl = async () => ok({ role: 'assistant', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'echo', arguments: '{}' } }] });
  const echo = { definitions: [], names: new Set(['echo']), call: async () => 'x' };
  const t = await runTurn({ endpoint: { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl }, messages: [], toolsets: [echo], maxTurns: 2 });
  assert.match(t.error, /2-turn cap/);
});

test('bareEligible skips briefs with an app, a site or follow-ups', () => {
  assert.equal(bareEligible({ id: 'a' }), true);
  assert.equal(bareEligible({ id: 'b', fixture: 'acme' }), false);
  assert.equal(bareEligible({ id: 'c', site: 'trattoria' }), false);
  assert.equal(bareEligible({ id: 'd', followUps: ['bolder'] }), false);
});

const design = (over = {}) => ({ entryPath: 'p.html', checkOk: true, errors: {}, warnings: {}, skill: 'od:prototype:poster-hero', signature: { accent: '#111' }, ...over });

test('caseVerdict passes a clean on-route design and names every failure', () => {
  const brief = { id: 'gig-poster', expect: { skills: ['poster-hero'], questions: { max: 1 } } };
  assert.deepEqual(caseVerdict({ designs: [design()], questions: 0 }, brief), { pass: true, reasons: [] });
  const bad = caseVerdict({ designs: [design({ errors: { overlap: 2 }, skill: 'od:deck:x' })], questions: 3 }, brief);
  assert.equal(bad.pass, false);
  assert.equal(bad.reasons.length, 3);
  // Without the kit there is no skill to be on or off route.
  assert.equal(caseVerdict({ arm: 'bare', designs: [design({ skill: undefined })], questions: 0 }, brief).pass, true);
  assert.deepEqual(caseVerdict({ designs: [], agentError: 'boom' }, brief).reasons, ['agent error: boom', 'no design']);
});

test('armComparison totals each arm only when a run has both', () => {
  const brief = { id: 'g', expect: {} };
  const briefs = new Map([['g', brief]]);
  assert.equal(armComparison([{ arm: 'kit', brief: 'g', designs: [design()] }], briefs), undefined);
  const table = armComparison(
    [
      { arm: 'kit', brief: 'g', designs: [design()], tokens: { prompt: 900, completion: 100 } },
      { arm: 'bare', brief: 'g', designs: [design({ errors: { contrast: 3 } })] },
      { arm: 'bare', brief: 'g', designs: [] },
    ],
    briefs,
  );
  const lines = table.split('\n');
  assert.equal(lines[2], '| With the kit | 1 | 1 (100%) | 0 | 0.0 | 0.0 | 1 of 1 | 1,000 |');
  assert.equal(lines[3], '| Without the kit | 2 | 0 (0%) | 1 | 3.0 | 0.0 | 1 of 1 | n/a |');
});
