import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAppShellBlocks, extractShellBlock } from '../appShell.mjs';

const block = (body) => `<!-- od:app-shell:start -->\n${body}\n<!-- od:app-shell:end -->`;

async function fixture(skills) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-shell-'));
  for (const [id, text] of Object.entries(skills)) {
    await fs.mkdir(path.join(root, 'skills', id), { recursive: true });
    await fs.writeFile(path.join(root, 'skills', id, 'SKILL.md'), text);
  }
  return root;
}

test('extracts the text between the markers', () => {
  assert.equal(extractShellBlock(`a\n${block('<html>')}\nb`), '<html>');
  assert.equal(extractShellBlock('no shell here'), undefined);
});

test('matching shells pass, a drifted one is named', async () => {
  const ok = await fixture({ 'app-shell': block('X'), 'app-form': block('X'), other: 'no shell' });
  assert.deepEqual(await checkAppShellBlocks(ok), []);
  const bad = await fixture({ 'app-shell': block('X'), 'app-form': block('Y') });
  const problems = await checkAppShellBlocks(bad);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /app-form/);
});

test('the bundled app screen templates share one shell', async () => {
  const localRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'local');
  assert.deepEqual(await checkAppShellBlocks(localRoot), []);
});
