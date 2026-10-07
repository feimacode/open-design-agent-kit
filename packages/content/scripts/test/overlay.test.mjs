import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyLocalOverlay,
  findRedundantOverrides,
  listOverlayFiles,
  OVERLAY_MARKER,
  TOKENS_OVERRIDE_FILE,
  NEW_DESIGN_SYSTEM_FILES,
} from '../apply-local-overlay.mjs';
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

  const expectedCounts = { skills: 1, examples: 0, prompts: 1, designSystemOverrides: 0, designSystemPackages: 0 };
  assert.deepEqual(await applyLocalOverlay(target, local), expectedCounts);
  assert.deepEqual(await applyLocalOverlay(target, local), expectedCounts);

  assert.match(await fs.readFile(path.join(target, 'skills', 'mine', 'SKILL.md'), 'utf8'), /Body of mine/);
  await fs.access(path.join(target, 'skills', 'mine', OVERLAY_MARKER));
  assert.equal(await fs.readFile(path.join(target, 'prompts', 'p.md'), 'utf8'), 'hello');
  const manifest = JSON.parse(await fs.readFile(path.join(target, 'MANIFEST.json'), 'utf8'));
  assert.deepEqual(manifest.localOverlay, expectedCounts);
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

async function writeDesignSystem(root, id) {
  const dir = path.join(root, 'design-systems', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'DESIGN.md'), `# ${id}\n`);
  await fs.writeFile(path.join(dir, 'tokens.css'), ':root { --accent: #2563eb; }\n');
}

async function writeOverride(root, id, css = ':root { --accent: #9333ea; }\n') {
  const dir = path.join(root, 'design-systems', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, TOKENS_OVERRIDE_FILE), css);
}

test('design-system token overrides are copied beside, never over, the upstream tokens.css', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeDesignSystem(target, 'application');
  await writeOverride(local, 'application');

  assert.equal((await applyLocalOverlay(target, local)).designSystemOverrides, 1);
  const dir = path.join(target, 'design-systems', 'application');
  assert.equal(await fs.readFile(path.join(dir, 'tokens.css'), 'utf8'), ':root { --accent: #2563eb; }\n');
  assert.equal(await fs.readFile(path.join(dir, TOKENS_OVERRIDE_FILE), 'utf8'), ':root { --accent: #9333ea; }\n');
  assert.deepEqual(await listOverlayFiles(local), [path.join('design-systems', 'application', TOKENS_OVERRIDE_FILE)]);
});

test('an override for an unknown design system fails and names the id', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeOverride(local, 'no-such-system');
  await assert.rejects(applyLocalOverlay(target, local), /no-such-system \(override of a non-existent upstream design system\)/);
});

test('an override directory with any other file fails', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeDesignSystem(target, 'application');
  await writeOverride(local, 'application');
  await fs.writeFile(path.join(local, 'design-systems', 'application', 'DESIGN.md'), '# shadow');
  await assert.rejects(applyLocalOverlay(target, local), /application \(must contain exactly tokens\.override\.css/);
});

test('re-applying after an override is removed from local/ drops it from the target', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeDesignSystem(target, 'application');
  await writeOverride(local, 'application');
  await applyLocalOverlay(target, local);
  await fs.rm(path.join(local, 'design-systems'), { recursive: true });
  await applyLocalOverlay(target, local);
  await assert.rejects(fs.access(path.join(target, 'design-systems', 'application', TOKENS_OVERRIDE_FILE)));
});

async function writeNewDesignSystemPackage(root, id, { manifestId = id } = {}) {
  const dir = path.join(root, 'design-systems', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'DESIGN.md'), `# ${id}\n`);
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ schemaVersion: 'od-design-system-project/v1', id: manifestId, name: id, category: 'Test', description: 'test' }),
  );
  await fs.writeFile(path.join(dir, 'tokens.css'), ':root { --accent: #c084fc; --fg: #111; --bg: #fff; }\n');
}

test('a new design system with no upstream counterpart is copied and marked', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeNewDesignSystemPackage(local, 'riso');

  const counts = await applyLocalOverlay(target, local);
  assert.deepEqual(counts, { skills: 0, examples: 0, prompts: 0, designSystemOverrides: 0, designSystemPackages: 1 });

  const dir = path.join(target, 'design-systems', 'riso');
  assert.match(await fs.readFile(path.join(dir, 'DESIGN.md'), 'utf8'), /# riso/);
  await fs.access(path.join(dir, 'manifest.json'));
  await fs.access(path.join(dir, OVERLAY_MARKER));
  assert.deepEqual(await listOverlayFiles(local), [
    path.join('design-systems', 'riso', 'DESIGN.md'),
    path.join('design-systems', 'riso', 'manifest.json'),
    path.join('design-systems', 'riso', 'tokens.css'),
  ]);
});

test('re-applying a new design system package is idempotent', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeNewDesignSystemPackage(local, 'riso');
  await applyLocalOverlay(target, local);
  assert.deepEqual(await applyLocalOverlay(target, local), { skills: 0, examples: 0, prompts: 0, designSystemOverrides: 0, designSystemPackages: 1 });
});

test('a new design system package colliding with an existing upstream id fails', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeDesignSystem(target, 'application');
  await writeNewDesignSystemPackage(local, 'application');
  await assert.rejects(applyLocalOverlay(target, local), /application \(upstream design system already has this id\)/);
});

test('a new design system package missing a required file fails', async () => {
  const local = await tmp();
  const target = await tmp();
  const dir = path.join(local, 'design-systems', 'riso');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'DESIGN.md'), '# riso\n');
  await fs.writeFile(path.join(dir, 'tokens.css'), ':root {}\n');
  assert.deepEqual(NEW_DESIGN_SYSTEM_FILES, ['DESIGN.md', 'manifest.json', 'tokens.css']);
  await assert.rejects(applyLocalOverlay(target, local), /riso \(must contain exactly tokens\.override\.css, or exactly DESIGN\.md, manifest\.json, tokens\.css/);
});

test('re-applying after a new design system package is removed from local/ drops the whole folder from the target', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeNewDesignSystemPackage(local, 'riso');
  await applyLocalOverlay(target, local);
  await fs.rm(path.join(local, 'design-systems'), { recursive: true });
  await applyLocalOverlay(target, local);
  await assert.rejects(fs.access(path.join(target, 'design-systems', 'riso')));
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

test('overrides equal to the upstream value are reported as redundant', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeDesignSystem(target, 'application');
  await writeOverride(local, 'application', '/* note: --accent: #000; */\n:root {\n  --accent: #2563EB;\n  --meta: #9333ea;\n}\n');
  assert.deepEqual(await findRedundantOverrides(target, local), ['application: --accent']);
});

test('findRedundantOverrides skips new design-system packages (no override file to check)', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeNewDesignSystemPackage(local, 'riso');
  assert.deepEqual(await findRedundantOverrides(target, local), []);
});

test('overlay examples are copied and marked, and colliding with an upstream example fails', async () => {
  const local = await tmp();
  const target = await tmp();
  await writeSkill(local, 'skills', 'diagram');
  await writeSkill(local, 'examples', 'diagram');
  await fs.writeFile(path.join(local, 'examples', 'diagram', 'example.html'), '<p>d</p>');
  assert.equal((await applyLocalOverlay(target, local)).examples, 1);
  assert.equal(await fs.readFile(path.join(target, 'examples', 'diagram', 'example.html'), 'utf8'), '<p>d</p>');
  await fs.access(path.join(target, 'examples', 'diagram', OVERLAY_MARKER));
  assert.ok((await listOverlayFiles(local)).includes(path.join('examples', 'diagram', 'example.html')));

  const clash = await tmp();
  await writeSkill(clash, 'examples', 'resume-modern');
  const upstream = await tmp();
  await writeSkill(upstream, 'examples', 'resume-modern');
  await assert.rejects(applyLocalOverlay(upstream, clash), /resume-modern \(upstream example\)/);
});
