import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyLocalOverlay, OVERLAY_MARKER } from '../apply-local-overlay.mjs';
import { collectCuratedEntries } from '../curatedEntries.mjs';

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-overlay-test-'));
}

async function writeSkill(root, subdir, id, frontmatter = '') {
  const dir = path.join(root, subdir, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${id}\n${frontmatter}od:\n  mode: prototype\n---\n\nBody of ${id}\n`);
}

test('overlay skills and prompts are copied and marked, and re-applying is idempotent', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeSkill(local, 'skills', 'mine');
  await fs.mkdir(path.join(local, 'prompts'));
  await fs.writeFile(path.join(local, 'prompts', 'p.md'), 'hello');
  await writeSkill(target, 'skills', 'upstream-skill');
  await fs.writeFile(path.join(target, 'MANIFEST.json'), '{"sourceRef":"x"}');

  assert.deepEqual(await applyLocalOverlay(target, local), { skills: 1, prompts: 1 });
  assert.deepEqual(await applyLocalOverlay(target, local), { skills: 1, prompts: 1 });

  assert.match(await fs.readFile(path.join(target, 'skills', 'mine', 'SKILL.md'), 'utf8'), /Body of mine/);
  await fs.access(path.join(target, 'skills', 'mine', OVERLAY_MARKER));
  assert.equal(await fs.readFile(path.join(target, 'prompts', 'p.md'), 'utf8'), 'hello');
  const manifest = JSON.parse(await fs.readFile(path.join(target, 'MANIFEST.json'), 'utf8'));
  assert.deepEqual(manifest.localOverlay, { skills: 1, prompts: 1 });
  assert.equal(manifest.sourceRef, 'x');
});

test('overlay id colliding with an upstream skill fails and names the id', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeSkill(local, 'skills', 'card-twitter');
  await writeSkill(target, 'skills', 'card-twitter');
  await assert.rejects(applyLocalOverlay(target, local), /card-twitter \(upstream skill\)/);
});

test('overlay id colliding with an upstream design template fails', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeSkill(local, 'skills', 'hyperframes');
  await writeSkill(target, 'design-templates', 'hyperframes');
  await assert.rejects(applyLocalOverlay(target, local), /hyperframes \(upstream design-template\)/);
});

test('local curation list adds uncurated entries', async () => {
  const assets = await tmp();
  await writeSkill(assets, 'skills', 'flagged', 'featured: 1\n');
  await writeSkill(assets, 'skills', 'plain');
  await writeSkill(assets, 'design-templates', 'other');
  const curated = path.join(await tmp(), 'curated.json');
  await fs.writeFile(curated, '["plain"]');
  const ids = (await collectCuratedEntries(assets, curated)).map((e) => e.publicId);
  assert.deepEqual(ids, ['od:prototype:flagged', 'od:prototype:plain']);
});

test('unknown id in the local curation list fails', async () => {
  const assets = await tmp();
  await writeSkill(assets, 'skills', 'plain');
  const curated = path.join(await tmp(), 'curated.json');
  await fs.writeFile(curated, '["plain","typo-id"]');
  await assert.rejects(collectCuratedEntries(assets, curated), /unknown entry id\(s\): typo-id/);
});

test('missing curation list means upstream flags only', async () => {
  const assets = await tmp();
  await writeSkill(assets, 'skills', 'plain');
  assert.deepEqual(await collectCuratedEntries(assets, path.join(assets, 'nope.json')), []);
});
