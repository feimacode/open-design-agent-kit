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

    it('accepts and round-trips collection fields', () => {
      const result = validateArtifactManifestInput(
        {
          kind: 'html',
          renderer: 'html',
          exports: ['html'],
          collectionId: 'fintech-onboarding',
          collectionName: 'Fintech Onboarding Flow',
          screenRole: 'splash',
          screenIndex: 0,
        },
        'index.html',
      );
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value?.collectionId, 'fintech-onboarding');
        assert.strictEqual(result.value?.collectionName, 'Fintech Onboarding Flow');
        assert.strictEqual(result.value?.screenRole, 'splash');
        assert.strictEqual(result.value?.screenIndex, 0);
      }
    });

    it('omits collection fields entirely when not given', () => {
      const result = validateArtifactManifestInput({ kind: 'html', renderer: 'html', exports: ['html'] }, 'index.html');
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value?.collectionId, undefined);
        assert.strictEqual(result.value?.screenIndex, undefined);
      }
    });

    it('rejects a screenIndex out of bounds', () => {
      const negative = validateArtifactManifestInput({ kind: 'html', renderer: 'html', exports: ['html'], screenIndex: -1 }, 'index.html');
      assert.strictEqual(negative.ok, false);

      const tooLarge = validateArtifactManifestInput({ kind: 'html', renderer: 'html', exports: ['html'], screenIndex: 1000 }, 'index.html');
      assert.strictEqual(tooLarge.ok, false);

      const notAnInteger = validateArtifactManifestInput({ kind: 'html', renderer: 'html', exports: ['html'], screenIndex: 1.5 }, 'index.html');
      assert.strictEqual(notAnInteger.ok, false);
    });

    it('rejects a collectionId over the max length', () => {
      const result = validateArtifactManifestInput(
        { kind: 'html', renderer: 'html', exports: ['html'], collectionId: 'x'.repeat(101) },
        'index.html',
      );
      assert.strictEqual(result.ok, false);
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
