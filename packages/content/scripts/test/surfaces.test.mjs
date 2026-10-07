import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSurfaces, isStubEntry, STUB_MARKER } from '../surfaces.mjs';

async function catalog(surfaces, entries = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-surfaces-'));
  for (const [rel, body] of Object.entries(entries)) {
    await fs.mkdir(path.join(root, path.dirname(rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
  await fs.writeFile(path.join(root, 'surfaces.json'), JSON.stringify({ surfaces }));
  return root;
}
const ready = (id, entries, extra = {}) => ({ id, label: id, description: 'd', status: 'ready', entries, ...extra });
const real = '---\nname: x\n---\nA real workflow.';
const stub = `---\nname: y\n---\n${STUB_MARKER} in OpenDesign.`;

test('a valid catalog has no problems; planned surfaces are not checked', async () => {
  const root = await catalog([ready('poster', ['poster-hero'], { prompt: 'open-design-poster' }), { id: '3d', label: '3D', description: 'd', status: 'planned', entries: ['nope'] }], {
    'skills/poster-hero/SKILL.md': real,
    'prompts/poster.md': '---\nname: open-design-poster\ndescription: d\n---\n{{brief}}',
  });
  assert.deepEqual(await checkSurfaces(root), []);
});

test('a missing entry, a stub entry and an unknown prompt are each reported by name', async () => {
  const root = await catalog([ready('animation', ['remotion', 'ghost'], { prompt: 'open-design-nope' })], { 'skills/remotion/SKILL.md': stub });
  const problems = await checkSurfaces(root);
  assert.ok(problems.some((p) => p.includes('animation') && p.includes('"remotion"') && p.includes('stub')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('"ghost"') && p.includes("doesn't exist")));
  assert.ok(problems.some((p) => p.includes('open-design-nope')));
});

test('a stub skill paired with a real example is not a stub entry', async () => {
  const root = await catalog([ready('x', ['pair'])], { 'skills/pair/SKILL.md': stub, 'examples/pair/SKILL.md': real, 'examples/pair/example.html': '<p>' });
  assert.deepEqual(await checkSurfaces(root), []);
  assert.equal(await isStubEntry(path.join(root, 'skills', 'pair')), true);
  assert.equal(await isStubEntry(path.join(root, 'examples', 'pair')), false);
});

test('the shipped catalog passes against the shipped assets', async () => {
  const assets = path.join(import.meta.dirname, '..', '..', 'assets', 'open-design');
  assert.deepEqual(await checkSurfaces(assets), []);
});
