import * as assert from 'node:assert';
import { validateArtifactManifestInput, inferLegacyManifest } from '../../vendored/artifactManifest';

describe('artifactManifest', () => {
  describe('validateArtifactManifestInput', () => {
    it('accepts a valid manifest and fills in defaults', () => {
      const result = validateArtifactManifestInput(
        { kind: 'html', renderer: 'html', exports: ['html', 'zip'], title: 'Coffee landing' },
        'index.html',
      );
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value?.kind, 'html');
        assert.strictEqual(result.value?.entry, 'index.html');
        assert.strictEqual(result.value?.status, 'complete');
      }
    });

    it('rejects an unknown kind', () => {
      const result = validateArtifactManifestInput({ kind: 'not-a-kind', renderer: 'html', exports: ['html'] }, 'index.html');
      assert.strictEqual(result.ok, false);
    });

    it('rejects supportingFiles with path traversal', () => {
      const result = validateArtifactManifestInput(
        { kind: 'html', renderer: 'html', exports: ['html'], supportingFiles: ['../secret.txt'] },
        'index.html',
      );
      assert.strictEqual(result.ok, false);
    });

    it('rejects an absolute-path entry', () => {
      const result = validateArtifactManifestInput({ kind: 'html', renderer: 'html', exports: ['html'] }, '/etc/passwd');
      assert.strictEqual(result.ok, false);
    });

    it('treats a null manifest as ok/null', () => {
      const result = validateArtifactManifestInput(null, 'index.html');
      assert.strictEqual(result.ok, true);
      if (result.ok) assert.strictEqual(result.value, null);
    });
  });

  describe('inferLegacyManifest', () => {
    it('infers html kind for .html', () => {
      const manifest = inferLegacyManifest('page.html');
      assert.strictEqual(manifest?.kind, 'html');
    });

    it('infers deck kind for a deck-named html file', () => {
      const manifest = inferLegacyManifest('pitch-deck.html');
      assert.strictEqual(manifest?.kind, 'deck');
    });

    it('infers markdown-document kind for .md', () => {
      const manifest = inferLegacyManifest('notes.md');
      assert.strictEqual(manifest?.kind, 'markdown-document');
    });

    it('returns null for an unrecognized extension', () => {
      const manifest = inferLegacyManifest('data.bin');
      assert.strictEqual(manifest, null);
    });
  });
});
