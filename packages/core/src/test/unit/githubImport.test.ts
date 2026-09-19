import * as assert from 'node:assert';
import { normalizeGithubUrl } from '../../generation/githubImport';

describe('normalizeGithubUrl', () => {
  it('parses a blob URL into owner/repo/branch/path', () => {
    const ref = normalizeGithubUrl('https://github.com/acme/design-system/blob/main/tokens.css');
    assert.deepStrictEqual(ref, { owner: 'acme', repo: 'design-system', branch: 'main', path: 'tokens.css' });
  });

  it('parses a blob URL with a nested path', () => {
    const ref = normalizeGithubUrl('https://github.com/acme/design-system/blob/main/src/styles/tokens.css');
    assert.deepStrictEqual(ref, { owner: 'acme', repo: 'design-system', branch: 'main', path: 'src/styles/tokens.css' });
  });

  it('parses an already-raw githubusercontent URL', () => {
    const ref = normalizeGithubUrl('https://raw.githubusercontent.com/acme/design-system/main/tokens.css');
    assert.deepStrictEqual(ref, { owner: 'acme', repo: 'design-system', branch: 'main', path: 'tokens.css' });
  });

  it('parses a tree URL as a bare repo reference with a branch, no path', () => {
    const ref = normalizeGithubUrl('https://github.com/acme/design-system/tree/develop');
    assert.deepStrictEqual(ref, { owner: 'acme', repo: 'design-system', branch: 'develop' });
  });

  it('parses a bare repo URL with no branch or path', () => {
    const ref = normalizeGithubUrl('https://github.com/acme/design-system');
    assert.deepStrictEqual(ref, { owner: 'acme', repo: 'design-system' });
  });

  it('returns undefined for a non-GitHub URL', () => {
    assert.strictEqual(normalizeGithubUrl('https://example.com/acme/design-system'), undefined);
  });

  it('returns undefined for an unparseable string', () => {
    assert.strictEqual(normalizeGithubUrl('not a url'), undefined);
  });
});
