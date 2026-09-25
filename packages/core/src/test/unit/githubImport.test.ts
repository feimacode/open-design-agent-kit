import * as assert from 'node:assert';
import { fetchGithubDesignTokens, normalizeGithubUrl } from '../../generation/githubImport';

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

describe('fetchGithubDesignTokens (bare repository)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(files: Record<string, string>): string[] {
    const requested: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify({ default_branch: 'main' }));
      const body = files[url.replace('https://raw.githubusercontent.com/acme/brand/main/', '')];
      return body === undefined ? new Response('', { status: 404 }) : new Response(body);
    }) as typeof fetch;
    return requested;
  }

  it('returns the root DESIGN.md alone plus a sibling tokens.css verbatim', async () => {
    const requested = stubFetch({ 'DESIGN.md': '# Brand\n', 'tokens.css': ':root { --accent: #ff385c; }\n', 'tailwind.config.js': 'x' });
    const result = await fetchGithubDesignTokens('https://github.com/acme/brand');
    assert.strictEqual(result.content, '# Brand\n');
    assert.strictEqual(result.tokensCss, ':root { --accent: #ff385c; }\n');
    assert.ok(!requested.some((u) => u.endsWith('tailwind.config.js')), 'no other candidates are probed');
  });

  it('has no tokensCss when the repository has no root tokens.css', async () => {
    stubFetch({ 'DESIGN.md': '# Brand\n' });
    const result = await fetchGithubDesignTokens('https://github.com/acme/brand');
    assert.strictEqual(result.tokensCss, undefined);
  });
});
