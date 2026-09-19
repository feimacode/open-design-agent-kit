import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { copyExampleArtifact } from '../../workspace/remixExample';

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('copyExampleArtifact', () => {
  it('copies example.html to the destination entry path', async () => {
    const assetsRoot = await makeTempDir('od-ext-assets-');
    const workspaceRoot = await makeTempDir('od-ext-ws-');

    await fs.mkdir(path.join(assetsRoot, 'examples', 'holo-hero'), { recursive: true });
    await fs.writeFile(path.join(assetsRoot, 'examples', 'holo-hero', 'example.html'), '<!doctype html><h1>Holo</h1>');

    const result = await copyExampleArtifact({
      assetsRoot,
      exampleArtifactPath: 'examples/holo-hero/example.html',
      workspaceRoot,
      entryPath: '.open-design/holo-hero/holo-hero.html',
    });

    const written = await fs.readFile(path.join(workspaceRoot, '.open-design/holo-hero/holo-hero.html'), 'utf8');
    assert.match(written, /Holo/);
    assert.deepStrictEqual(result.supportingFiles, []);
  });

  it('also copies a sibling assets/ directory and lists it as supportingFiles', async () => {
    const assetsRoot = await makeTempDir('od-ext-assets-');
    const workspaceRoot = await makeTempDir('od-ext-ws-');

    const exampleDir = path.join(assetsRoot, 'examples', 'with-assets');
    await fs.mkdir(path.join(exampleDir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(exampleDir, 'example.html'), '<!doctype html><img src="assets/hero.png">');
    await fs.writeFile(path.join(exampleDir, 'assets', 'hero.png'), 'fake-png-bytes');

    const result = await copyExampleArtifact({
      assetsRoot,
      exampleArtifactPath: 'examples/with-assets/example.html',
      workspaceRoot,
      entryPath: '.open-design/with-assets/with-assets.html',
    });

    const copiedAsset = await fs
      .access(path.join(workspaceRoot, '.open-design/with-assets/assets/hero.png'))
      .then(() => true)
      .catch(() => false);
    assert.strictEqual(copiedAsset, true);
    assert.deepStrictEqual(result.supportingFiles, ['assets/hero.png']);
  });

  it('rejects an entryPath that escapes the workspace', async () => {
    const assetsRoot = await makeTempDir('od-ext-assets-');
    const workspaceRoot = await makeTempDir('od-ext-ws-');
    await fs.mkdir(path.join(assetsRoot, 'examples', 'x'), { recursive: true });
    await fs.writeFile(path.join(assetsRoot, 'examples', 'x', 'example.html'), '<!doctype html>');

    await assert.rejects(
      copyExampleArtifact({
        assetsRoot,
        exampleArtifactPath: 'examples/x/example.html',
        workspaceRoot,
        entryPath: '../outside.html',
      }),
    );
  });
});
