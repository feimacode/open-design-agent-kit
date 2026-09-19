import * as assert from 'node:assert';
import { synthesizeBrandEvidence } from '../../generation/brandExtraction';

describe('synthesizeBrandEvidence', () => {
  it('ranks hex colors by frequency and dedupes case', () => {
    const html = `
      <style>
        .a { color: #FF6600; background: #ff6600; }
        .b { color: #123ABC; }
      </style>
    `;
    const evidence = synthesizeBrandEvidence(new URL('https://example.com'), html, [], []);
    assert.deepStrictEqual(evidence.colors, ['#ff6600', '#123abc']);
  });

  it('extracts the first font-family per declaration, stripping quotes, skipping keyword values', () => {
    const html = `
      <style>
        body { font-family: "Space Grotesk", sans-serif; }
        h1 { font-family: Georgia, serif; }
        .x { font-family: inherit; }
      </style>
    `;
    const evidence = synthesizeBrandEvidence(new URL('https://example.com'), html, [], []);
    assert.deepStrictEqual(evidence.fonts, ['Space Grotesk', 'Georgia']);
  });

  it('finds a favicon link, resolved against the base URL', () => {
    const html = `<link rel="icon" href="/assets/favicon.png">`;
    const evidence = synthesizeBrandEvidence(new URL('https://example.com/about'), html, [], []);
    assert.strictEqual(evidence.faviconUrl, 'https://example.com/assets/favicon.png');
  });

  it('falls back to og:image when no favicon link is present', () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/logo.png">`;
    const evidence = synthesizeBrandEvidence(new URL('https://example.com'), html, [], []);
    assert.strictEqual(evidence.faviconUrl, 'https://cdn.example.com/logo.png');
  });

  it('merges colors/fonts harvested from stylesheet texts with the HTML', () => {
    const html = `<style>.a { color: #111111; }</style>`;
    const css = `.b { color: #222222; font-family: 'Inter', sans-serif; }`;
    const evidence = synthesizeBrandEvidence(new URL('https://example.com'), html, [css], []);
    assert.deepStrictEqual(evidence.colors.sort(), ['#111111', '#222222']);
    assert.deepStrictEqual(evidence.fonts, ['Inter']);
  });

  it('returns an empty (but never throwing) result when html is undefined', () => {
    const evidence = synthesizeBrandEvidence(new URL('https://example.com'), undefined, [], ['fetch failed']);
    assert.deepStrictEqual(evidence.colors, []);
    assert.deepStrictEqual(evidence.fonts, []);
    assert.strictEqual(evidence.faviconUrl, undefined);
    assert.deepStrictEqual(evidence.warnings, ['fetch failed']);
  });
});
