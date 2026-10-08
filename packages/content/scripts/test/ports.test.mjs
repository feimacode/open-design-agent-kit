import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPorts } from '../ports.mjs';

const COMMIT = '553ed98c283f9c0f489902d035416a972d6a9699';
async function fixture({ header = true, listed = true, example = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ports-'));
  const h = header ? `<!-- Ported from x at commit ${COMMIT.slice(0, 12)}. -->\n` : '';
  await fs.mkdir(path.join(root, 'skills', 'memo'), { recursive: true });
  await fs.writeFile(path.join(root, 'skills', 'memo', 'SKILL.md'), `---\nname: memo\n---\n${h}Body`);
  if (example) {
    await fs.mkdir(path.join(root, 'examples', 'memo'), { recursive: true });
    await fs.writeFile(path.join(root, 'examples', 'memo', 'SKILL.md'), `---\nname: memo\n---\n${h}`);
  }
  await fs.writeFile(path.join(root, 'ports.json'), JSON.stringify({ ports: [{ id: 'memo', commit: COMMIT, license: 'Apache-2.0', examples: ['memo'] }] }));
  const doc = path.join(root, 'ports.md');
  await fs.writeFile(doc, listed ? '| `memo` | html-anything |' : 'nothing');
  return { root, doc };
}

test('a recorded, headed and documented port passes', async () => {
  const { root, doc } = await fixture();
  assert.deepEqual(await checkPorts(root, doc), []);
});

test('a missing header, a missing example and a missing docs entry are each reported', async () => {
  let f = await fixture({ header: false });
  assert.ok((await checkPorts(f.root, f.doc)).some((p) => p.includes('provenance header')));
  f = await fixture({ example: false });
  assert.ok((await checkPorts(f.root, f.doc)).some((p) => p.includes('example memo is missing')));
  f = await fixture({ listed: false });
  assert.ok((await checkPorts(f.root, f.doc)).some((p) => p.includes('upstream-ports.md')));
});
