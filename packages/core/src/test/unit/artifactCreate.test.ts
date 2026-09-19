import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  writeArtifactManifest,
  readArtifact,
  resolveArtifactManifest,
  ArtifactEntryMissingError,
  ArtifactManifestRequiredError,
} from '../../vendored/artifactCreate';

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-test-'));
}

describe('artifactCreate', () => {
  describe('resolveArtifactManifest', () => {
    it('infers a manifest when none is given for a known extension', () => {
      const manifest = resolveArtifactManifest({ entry: 'page.html' });
      assert.strictEqual(manifest.kind, 'html');
    });

    it('throws ArtifactManifestRequiredError for an unrecognized extension with no manifest', () => {
      assert.throws(() => resolveArtifactManifest({ entry: 'data.bin' }), ArtifactManifestRequiredError);
    });
  });

  describe('writeArtifactManifest / readArtifact', () => {
    it('throws ArtifactEntryMissingError if the entry file was never written', async () => {
      const workspaceRoot = await makeTempWorkspace();
      await assert.rejects(
        writeArtifactManifest({ workspaceRoot, entryPath: 'missing/index.html', artifactManifest: undefined }),
        ArtifactEntryMissingError,
      );
    });

    it('writes a manifest sidecar next to an existing entry file, and reads it back', async () => {
      const workspaceRoot = await makeTempWorkspace();
      const entryPath = 'coffee-landing/coffee-landing.html';
      await fs.mkdir(path.join(workspaceRoot, 'coffee-landing'), { recursive: true });
      await fs.writeFile(path.join(workspaceRoot, entryPath), '<!doctype html><h1>Coffee</h1>');

      const manifest = await writeArtifactManifest({
        workspaceRoot,
        entryPath,
        artifactManifest: { kind: 'html', renderer: 'html', exports: ['html', 'zip'], title: 'Coffee landing' },
      });
      assert.strictEqual(manifest.kind, 'html');

      const sidecarPath = path.join(workspaceRoot, `${entryPath}.artifact.json`);
      const sidecarExists = await fs
        .access(sidecarPath)
        .then(() => true)
        .catch(() => false);
      assert.strictEqual(sidecarExists, true);

      const result = await readArtifact({ workspaceRoot, entryPath });
      assert.ok(result);
      assert.strictEqual(result?.manifest?.kind, 'html');
      assert.match(result?.entryContent ?? '', /Coffee/);
    });

    it('rejects an entryPath that escapes the workspace', async () => {
      const workspaceRoot = await makeTempWorkspace();
      await assert.rejects(
        writeArtifactManifest({ workspaceRoot, entryPath: '../outside.html', artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'] } }),
      );
    });

    it('readArtifact returns null when the entry file does not exist', async () => {
      const workspaceRoot = await makeTempWorkspace();
      const result = await readArtifact({ workspaceRoot, entryPath: 'nope.html' });
      assert.strictEqual(result, null);
    });
  });
});
