import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderGuideTable, renderReadmeTable, replaceBetweenMarkers, staleIntegrationDocs } from '../generate-integrations-docs.mjs';

const registry = {
  capabilities: { 'design.import': 'Import a file', 'social.post': 'Post' },
  integrations: [
    { id: 'x', displayName: 'X (official API server)', vendor: 'X', tier: 'official-platform', capabilities: { 'social.post': 'p' }, docs: { summary: 'Post', signIn: 'Dev app', notes: 'Self-hosted' } },
    { id: 'canva', displayName: 'Canva', vendor: 'Canva', tier: 'official-service', capabilities: { 'design.import': 'i' } },
  ],
};

test('tables list services first, use docs wording, and fall back to capabilities', () => {
  const guide = renderGuideTable(registry).split('\n');
  assert.equal(guide[2], '| Canva | Import a file | Canva account |  |');
  assert.equal(guide[3], '| X | Post | Dev app | Self-hosted |');
  assert.equal(renderReadmeTable(registry).split('\n')[2], '| Canva | Import a file |');
});

test('replaceBetweenMarkers rewrites only the marked section', () => {
  const text = 'a\n<!-- integrations:start -->\nold\n<!-- integrations:end -->\nb';
  assert.equal(replaceBetweenMarkers(text, 'new'), 'a\n<!-- integrations:start -->\nnew\n<!-- integrations:end -->\nb');
  assert.equal(replaceBetweenMarkers('no markers', 'x'), undefined);
});

test('a stale or unmarked file is reported', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-intdocs-'));
  await fs.mkdir(path.join(root, 'packages/content/local'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs/guides'), { recursive: true });
  await fs.writeFile(path.join(root, 'packages/content/local/integrations.json'), JSON.stringify(registry));
  await fs.writeFile(path.join(root, 'docs/guides/integrations.md'), '<!-- integrations:start -->\nold\n<!-- integrations:end -->\n');
  await fs.writeFile(path.join(root, 'README.md'), 'nothing');
  const stale = await staleIntegrationDocs(root);
  assert.equal(stale.length, 2);
  assert.match(stale[0], /docs\/guides\/integrations\.md: integrations table is out of date/);
  assert.match(stale[1], /README\.md: missing/);
});
