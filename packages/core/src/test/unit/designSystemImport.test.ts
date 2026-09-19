import * as assert from 'node:assert';
import { buildDesignSystemMarkdown, looksLikeDesignMd } from '../../generation/designSystemImport';

describe('looksLikeDesignMd', () => {
  it('is true when the first non-blank line is a heading', () => {
    assert.strictEqual(looksLikeDesignMd('# My Brand\n\n> Category: X\n> Summary.'), true);
    assert.strictEqual(looksLikeDesignMd('\n\n  # My Brand\n'), true, 'leading blank lines should be skipped');
  });

  it('is false for raw CSS/JSON/config content with no leading heading', () => {
    assert.strictEqual(looksLikeDesignMd(':root { --brand: #ff0000; }'), false);
    assert.strictEqual(looksLikeDesignMd('{ "colors": { "brand": "#ff0000" } }'), false);
    assert.strictEqual(looksLikeDesignMd(''), false);
  });
});

describe('buildDesignSystemMarkdown', () => {
  it('passes an already DESIGN.md-shaped input through verbatim, unchanged', () => {
    const rawContent = '# My Brand\n\n> Category: Retail\n> A hand-written brand.\n\n## Color Palette\n\n- #ff0000\n';
    const result = buildDesignSystemMarkdown({ name: 'ignored', category: 'ignored', sourceLabel: 'ignored', rawContent });
    assert.strictEqual(result, rawContent, 'verbatim passthrough must not rewrite or wrap already-shaped content');
  });

  it('synthesizes a DESIGN.md from raw tokens, extracting colors/fonts and preserving the source verbatim', () => {
    const rawContent = ':root { --brand: #FF6600; --accent: #ff6600; font-family: "Space Grotesk", sans-serif; }';
    const result = buildDesignSystemMarkdown({ name: 'Acme', category: 'Retail', sourceLabel: 'tokens.css', rawContent });

    assert.match(result, /^# Design System: Acme/);
    assert.match(result, /> Category: Retail/);
    assert.match(result, /> Imported from tokens\.css/);
    assert.match(result, /## Color Palette[\s\S]*- #ff6600/);
    assert.match(result, /## Typography[\s\S]*- Space Grotesk/);
    assert.match(result, /## Source Reference[\s\S]*--brand: #FF6600/, 'the original raw content must be preserved verbatim, not just its extracted summary');
  });

  it('notes when no colors/fonts were found automatically, without failing', () => {
    const result = buildDesignSystemMarkdown({ name: 'Acme', category: 'Retail', sourceLabel: 'notes.txt', rawContent: 'Just some plain prose, no tokens here.' });
    assert.match(result, /No colors were found automatically/);
    assert.match(result, /No font-family declarations were found automatically/);
  });
});
