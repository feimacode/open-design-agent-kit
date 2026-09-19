import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectExistingApp } from '../../workspace/appDetection';

async function makeWorkspace(packageJson?: unknown): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-appdetect-'));
  if (packageJson !== undefined) {
    await fs.writeFile(path.join(root, 'package.json'), typeof packageJson === 'string' ? packageJson : JSON.stringify(packageJson));
  }
  return root;
}

describe('detectExistingApp', () => {
  it('returns [] immediately when no workspace root is given, without touching the filesystem', async () => {
    const result = await detectExistingApp(undefined);
    assert.deepStrictEqual(result, []);
  });

  it('returns [] when there is no package.json', async () => {
    const root = await makeWorkspace();
    assert.deepStrictEqual(await detectExistingApp(root), []);
  });

  it('returns [] instead of throwing when package.json is malformed', async () => {
    const root = await makeWorkspace('{ not valid json');
    assert.deepStrictEqual(await detectExistingApp(root), []);
  });

  it('detects a recognized framework dependency', async () => {
    const root = await makeWorkspace({ dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } });
    assert.deepStrictEqual(await detectExistingApp(root), ['React']);
  });

  it('detects a framework listed under devDependencies too', async () => {
    const root = await makeWorkspace({ devDependencies: { vue: '^3.0.0' } });
    assert.deepStrictEqual(await detectExistingApp(root), ['Vue']);
  });

  it('reports every match found, e.g. both React and Next.js for a Next.js app', async () => {
    const root = await makeWorkspace({ dependencies: { react: '^18.0.0', next: '^14.0.0' } });
    const result = await detectExistingApp(root);
    assert.deepStrictEqual(new Set(result), new Set(['React', 'Next.js']));
  });

  it('returns [] when dependencies exist but none are recognized frameworks', async () => {
    const root = await makeWorkspace({ dependencies: { lodash: '^4.0.0', chalk: '^5.0.0' } });
    assert.deepStrictEqual(await detectExistingApp(root), []);
  });
});
