import * as assert from 'node:assert';
import { designSystemDisplaySummary, renderDesignSystemPreviewTab } from '../../generation/designSystemPreview';
import { resolveDesignSystemTokens } from '../../generation/designSystemTokens';
import { primaryFontFamily, renderDesignSystemVisualize } from '../../generation/designSystemVisualize';
import { renderSourceView } from '../../generation/designSystemSource';

const TOKENS_CSS = ':root { --bg: #ffffff; --fg: #111111; --accent: #ff385c; --font-display: "Space Grotesk", sans-serif; --font-body: Inter, sans-serif; --text-base: 16px; }';

function visualize(designMd: string, tokensCss: string | undefined = TOKENS_CSS, name = 'Acme') {
  return renderDesignSystemVisualize({
    name,
    category: 'Test',
    summary: 'A test system.',
    designMd,
    resolved: resolveDesignSystemTokens({ designMd, tokensCss }),
  });
}

// Strips the embedded kit iframes' srcdoc so assertions about the outer page
// don't accidentally match text inside the (escaped) kit documents.
const outer = (html: string) => html.replace(/srcdoc="[^"]*"/g, 'srcdoc=""');

describe('renderDesignSystemVisualize', () => {
  it('renders identity, typography, palette, and a light/dark component kit from tokens', () => {
    const html = visualize('# Acme\n');
    assert.match(outer(html), /Identity/);
    assert.match(outer(html), /<strong>Space Grotesk<\/strong><span>Display<\/span>/);
    assert.match(outer(html), /<strong>--accent<\/strong><code>#ff385c<\/code>/);
    assert.match(html, /title="Component kit, light" srcdoc="[^"]*--od-accent: #ff385c;/);
    assert.match(html, /title="Component kit, dark" srcdoc="[^"]*--od-page-bg: #0f1115;/);
    assert.strictEqual((html.match(/sandbox=""/g) ?? []).length, 2);
  });

  it('omits modules with no data instead of rendering placeholders', () => {
    const html = outer(visualize('# Acme\n'));
    assert.doesNotMatch(html, />Voice</);
    assert.doesNotMatch(html, />Imagery</);
  });

  it('shows extra DESIGN.md colours not already among the tokens', () => {
    const html = outer(visualize('# Acme\n\n## Color Palette\n\n- **Rausch** (`#ff385c`): brand.\n- **Babu** (`#00a699`): secondary accent.\n'));
    assert.match(html, /Also named in DESIGN\.md/);
    assert.match(html, /<code>#00a699<\/code>/);
    assert.strictEqual((html.match(/<code>#ff385c<\/code>/g) ?? []).length, 1, 'a hex already shown as a token is not repeated');
  });

  it('escapes markup from DESIGN.md and identity text', () => {
    const html = visualize(
      '# Acme\n\n## Voice & Tone\n\n- Tone: <script>alert(1)</script>\n\n## Color Palette\n\n- **<img src=x onerror=alert(1)>** (`#123456`): x\n',
      TOKENS_CSS,
      '<b>Acme</b>',
    );
    assert.doesNotMatch(outer(html), /<script>|<img|<b>Acme/);
    assert.match(outer(html), /&lt;b&gt;Acme&lt;\/b&gt;/);
  });

  it('renders a custom and a built-in system with identical tokens to the same kit and palette', () => {
    const builtIn = visualize('# Airbnb\n');
    const custom = visualize('# My Airbnb clone\n');
    const kit = (html: string) => html.match(/srcdoc="[^"]*"/g)!.map((s) => s.replace(/Acme/g, ''));
    const palette = (html: string) => /Palette<\/h2>([\s\S]*?)<\/section>/.exec(html)![1];
    assert.deepStrictEqual(kit(builtIn), kit(custom));
    assert.strictEqual(palette(builtIn), palette(custom));
  });

  it('labels a font stack with its first family, unquoted', () => {
    assert.strictEqual(primaryFontFamily('"Haas Groot Disp", Haas, sans-serif'), 'Haas Groot Disp');
  });
});

describe('renderSourceView', () => {
  it('classifies and highlights Markdown like upstream DesignSpecView, escaping everything', () => {
    const html = renderSourceView('# Title\n> quote\n- **Primary:** `#9333EA` <script>x</script>', 'markdown');
    assert.match(html, /class="design-spec-line is-h1"># Title/);
    assert.match(html, /class="design-spec-line is-quote"/);
    assert.match(html, /<span class="md-tk-bold">Primary:<\/span>/);
    assert.match(html, /<span class="md-tk-code">#9333EA<\/span>/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  });

  it('highlights tokens.css declarations with colour swatches, escaping values', () => {
    const html = renderSourceView(':root {\n  --accent: #ff385c;\n  --x: "</style><img onerror=1>";\n}', 'css');
    assert.match(html, /class="design-spec-line is-selector">:root \{/);
    assert.match(html, /<span class="css-tk-name">--accent<\/span>: <span class="md-tk-color"><span class="md-tk-color-swatch" style="background-color: #ff385c"/);
    assert.doesNotMatch(html, /<img|<\/style>/);
  });
});

describe('renderDesignSystemPreviewTab', () => {
  const detail = {
    id: 'acme',
    name: 'Acme',
    summary: 'A test system.',
    category: 'Test',
    source: 'built-in' as const,
    hasTokens: true,
    craftSuggested: [],
    body: '# Acme\n\n## Color Palette\n\n- **Brand primary** (`#00ff00`): CTA.\n',
    tokensCss: ':root { --accent: #ff385c; --accent-on: #111111; --fg: var(--ink, #222222); --bg: #fafafa; }',
    tokensOverrideCss: ':root { --accent: #9333ea; }',
  };

  it('feeds the showcase concrete resolved tokens (override applied, var() resolved) instead of DESIGN.md guesses', () => {
    const html = renderDesignSystemPreviewTab(detail, 'showcase');
    assert.match(html, /--accent: #9333ea;/);
    assert.match(html, /--accent-fg: #111111;/);
    assert.match(html, /--fg: #222222;/);
    assert.match(html, /--bg: #fafafa;/);
  });

  it('renders the visualize tab for the same detail', () => {
    assert.match(renderDesignSystemPreviewTab(detail, 'visualize'), /<code>#9333ea<\/code>/);
  });
});

describe('designSystemDisplaySummary', () => {
  const base = { id: 'user:acme', name: 'Acme', source: 'user' as const, hasTokens: false, craftSuggested: [] };

  it('drops the > Category: line ContentIndex folds into DESIGN.md-only summaries', () => {
    const detail = { ...base, summary: 'Category: Custom Bold engineering brand.', body: '# Acme\n\n> Category: Custom\n> Bold engineering brand.\n' };
    assert.strictEqual(designSystemDisplaySummary(detail), 'Bold engineering brand.');
  });

  it('keeps a manifest summary unchanged', () => {
    const detail = { ...base, summary: 'A concise SaaS design system.', body: '# Acme\n' };
    assert.strictEqual(designSystemDisplaySummary(detail), 'A concise SaaS design system.');
  });
});
