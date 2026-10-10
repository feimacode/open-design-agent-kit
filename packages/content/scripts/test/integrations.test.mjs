import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIntegrationUsage, validateIntegrations } from '../integrations.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shipped = JSON.parse(await fs.readFile(path.join(here, '..', '..', 'local', 'integrations.json'), 'utf8'));
const NOW = new Date('2026-10-10T00:00:00Z');

const base = () => ({
  capabilities: { 'design.import': 'd', 'social.post': 'p' },
  integrations: [
    {
      id: 'demo', displayName: 'Demo', vendor: 'Demo', tier: 'official-service', installable: true,
      capabilities: { 'design.import': 'import-thing' },
      server: { transport: 'http', url: 'https://mcp.example.com/mcp', suggestedName: 'demo' },
      auth: { kind: 'oauth-dcr' }, manualFallback: 'Export and upload by hand.', verifiedAt: '2026-10-01', toolsVerified: true,
    },
  ],
});

test('the shipped registry has no errors', () => {
  const { errors } = validateIntegrations(shipped, NOW);
  assert.deepEqual(errors, []);
});

test('the shipped registry has the initial entries, X first and manual-only', () => {
  const ids = shipped.integrations.map((e) => e.id);
  for (const id of ['canva', 'figma', 'notion', 'google-drive', 'slack', 'buffer', 'metricool', 'x']) assert.ok(ids.includes(id), id);
  const x = shipped.integrations.find((e) => e.id === 'x');
  assert.equal(x.tier, 'official-platform');
  assert.equal(x.installable, false);
});

test('a valid entry passes', () => {
  assert.deepEqual(validateIntegrations(base(), NOW), { errors: [], warnings: [] });
});

test('an unknown capability key is rejected, naming the entry and key', () => {
  const r = base();
  r.integrations[0].capabilities['design.teleport'] = 'x';
  assert.match(validateIntegrations(r, NOW).errors.join('\n'), /demo: unknown capability "design\.teleport"/);
});

test('a non-https URL and an unknown auth kind are rejected', () => {
  const r = base();
  r.integrations[0].server.url = 'http://mcp.example.com/mcp';
  r.integrations[0].auth.kind = 'magic';
  const errors = validateIntegrations(r, NOW).errors.join('\n');
  assert.match(errors, /https:\/\//);
  assert.match(errors, /auth\.kind/);
});

test('api-key-header needs an env var, and a literal credential is rejected', () => {
  const r = base();
  r.integrations[0].auth = { kind: 'api-key-header', header: 'Authorization' };
  r.integrations[0].caveats = ['Use Bearer abcdefghijklmnopqrstuvwxyz123456 for testing'];
  const errors = validateIntegrations(r, NOW).errors.join('\n');
  assert.match(errors, /envVar/);
  assert.match(errors, /demo: caveats\[0\] looks like a literal credential/);
});

test('an env var reference is not mistaken for a credential', () => {
  const r = base();
  r.integrations[0].caveats = ['Header: Bearer ${DEMO_API_KEY}'];
  assert.deepEqual(validateIntegrations(r, NOW).errors, []);
});

test('duplicate ids fail; a stale or unverified entry only warns', () => {
  const r = base();
  r.integrations.push({ ...r.integrations[0] });
  assert.match(validateIntegrations(r, NOW).errors.join('\n'), /demo: id used twice/);
  const s = base();
  s.integrations[0].verifiedAt = '2026-01-01';
  s.integrations[0].toolsVerified = false;
  const { errors, warnings } = validateIntegrations(s, NOW);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 2);
});

test('a non-installable entry needs manual steps; an aggregator needs platforms', () => {
  const r = base();
  r.integrations[0].installable = false;
  r.integrations[0].tier = 'aggregator';
  const errors = validateIntegrations(r, NOW).errors.join('\n');
  assert.match(errors, /manualSetup/);
  assert.match(errors, /platforms/);
});

test('a skill pre-approving a registry tool is flagged; an overview without the block is flagged', () => {
  const skill = (tools) => `---\nname: x\nallowed-tools: ${tools}\n---\nBody`;
  const ok = 'Call list_open_design_integrations when a step would hand work to another service.';
  const problems = checkIntegrationUsage(
    shipped,
    [
      { file: 'a/SKILL.md', content: skill('mcp__claude_ai_Canva__*') },
      { file: 'b/SKILL.md', content: skill('Bash(git status *) mcp__buffer__create_post') },
      { file: 'c/SKILL.md', content: skill('Read Bash(npm test)') },
      { file: 'd/SKILL.md', content: '---\nname: d\nallowed-tools:\n  - mcp__figma__use_figma\n---\n' },
    ],
    [
      { file: 'good.md', content: ok },
      { file: 'bad.md', content: 'No block here.' },
    ],
  );
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.ok(problems.some((p) => p.startsWith('a/SKILL.md')));
  assert.ok(problems.some((p) => p.startsWith('b/SKILL.md')));
  assert.ok(problems.some((p) => p.startsWith('d/SKILL.md')));
  assert.ok(problems.some((p) => p.startsWith('bad.md')));
});

test('docs must be an object of strings when present', () => {
  const r = base();
  r.integrations[0].docs = { summary: 'ok', signIn: 3 };
  assert.match(validateIntegrations(r, NOW).errors.join('\n'), /demo: docs\.signIn must be a string/);
});

test('an entry without a manual fallback is rejected', () => {
  const r = base();
  delete r.integrations[0].manualFallback;
  assert.match(validateIntegrations(r, NOW).errors.join('\n'), /demo: needs a manualFallback/);
});
