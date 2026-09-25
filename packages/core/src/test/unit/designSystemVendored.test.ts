import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseDesignMd } from '../../vendored/designMdParse';
import { renderKitHtml } from '../../vendored/designSystemKit';
import { renderDesignSystemShowcase } from '../../vendored/designSystemShowcase';

// Real vendored DESIGN.md files: one per upstream dialect the parser handles.
const DESIGN_SYSTEMS_DIR = path.resolve(__dirname, '../../../../content/assets/open-design/design-systems');
const designMd = (id: string) => readFileSync(path.join(DESIGN_SYSTEMS_DIR, id, 'DESIGN.md'), 'utf8');

describe('vendored parseDesignMd', () => {
  it('reads the curated-template dialect (numbered sections, **Primary:** bullets, Families line)', () => {
    const parsed = parseDesignMd(designMd('application'));
    assert.strictEqual(parsed.category, 'Professional & Corporate');
    assert.ok(parsed.colors.some((c) => c.hex === '#9333ea'));
    assert.strictEqual(parsed.typography.display?.family, 'Inter');
    assert.strictEqual(parsed.typography.mono?.family, 'JetBrains Mono');
  });

  it('reads the prose-preset dialect (named colours with long usage text)', () => {
    const parsed = parseDesignMd(designMd('stripe'));
    const purple = parsed.colors.find((c) => c.hex === '#533afd');
    assert.ok(purple);
    assert.match(purple.usage, /Primary brand color/);
  });

  it('reads the brand-generated table dialect', () => {
    const parsed = parseDesignMd(
      '# Acme\n\n## Color Palette\n\n| Role | Name | Hex | Usage |\n|---|---|---|---|\n| primary | Rocket Red | #E11D48 | CTAs |\n| background | Paper | #FFFFFF | page |\n',
    );
    assert.strictEqual(parsed.name, 'Acme');
    assert.deepStrictEqual(
      parsed.colors.map((c) => [c.role, c.hex]),
      [
        ['primary', '#e11d48'],
        ['background', '#ffffff'],
      ],
    );
  });
});

describe('vendored renderKitHtml', () => {
  const tokens = new Map([
    ['--bg', '#fafafa'],
    ['--accent', '#ff385c'],
    ['--font-display', 'Georgia, serif'],
  ]);

  it('renders the light kit from the given tokens and escapes identity text', () => {
    const html = renderKitHtml({ name: 'A<b>', category: 'Test', description: 'desc' }, tokens, 'light');
    assert.match(html, /--od-accent: #ff385c;/);
    assert.match(html, /--od-page-bg: #fafafa;/);
    assert.match(html, /--od-font-display: Georgia, serif;/);
    assert.match(html, /A&lt;b&gt; component kit/);
    assert.doesNotMatch(html, /A<b>/);
  });

  it('keeps the accent but swaps neutrals in dark mode', () => {
    const html = renderKitHtml({ name: 'Acme', category: 'Test' }, tokens, 'dark');
    assert.match(html, /--od-accent: #ff385c;/);
    assert.match(html, /--od-page-bg: #0f1115;/);
  });
});

describe('vendored renderDesignSystemShowcase', () => {
  const md = designMd('stripe');

  it('keeps upstream heuristic picks when no resolved tokens are given', () => {
    const html = renderDesignSystemShowcase('stripe', md);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /--accent: #[0-9a-f]{6};/);
  });

  it('uses resolved tokens in place of the heuristic picks (local deviation)', () => {
    const html = renderDesignSystemShowcase('stripe', md, {
      bg: '#101010',
      fg: '#fefefe',
      accent: '#123456',
      accentFg: '#abcdef',
      body: 'Inter, sans-serif',
    });
    assert.match(html, /--bg: #101010;/);
    assert.match(html, /--fg: #fefefe;/);
    assert.match(html, /--accent: #123456;/);
    assert.match(html, /--accent-fg: #abcdef;/);
    assert.match(html, /--body: Inter, sans-serif;/);
  });
});
