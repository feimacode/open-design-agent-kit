import * as assert from 'node:assert';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import { fromClaudeDesignSystem, toClaudeDesignSystem, type ClaudeTokensJson } from '../../generation/claudeDesignSystem';
import { validateClaudeDesignSystem } from '../../generation/claudeDesignSystemFormat';
import { resolveDesignSystemTokens } from '../../generation/designSystemTokens';

const DESIGN_MD = '# Paper\n\n> Category: Editorial\n> Warm paper, ink-blue accent. Built for print.\n\n## Color\n\nUse the accent sparingly.\n';
const TOKENS_CSS = `:root {
  --bg: #F5F4ED;
  --surface: #faf9f5;
  --fg: #141413;
  --muted: oklch(55% 0 0);
  --border: #e8e6dc;
  --accent: #1b365d;
  --accent-hover: color-mix(in oklab, var(--accent), black 8%);
  --accent-active: var(--accent);
  --font-display: Charter, Georgia, serif;
  --font-body: Inter, system-ui, sans-serif;
  --text-base: 15px;
  --text-3xl: 48px;
  --leading-body: 1.55;
  --leading-tight: 1.1;
  --tracking-display: -0.02em;
  --space-4: 16px;
  --radius-md: 8px;
  --elev-ring: 0 0 0 1px var(--border);
  --motion-fast: 150ms;
}
[data-theme="dark"] {
  --bg: #111111;
  --fg: #f5f5f5;
}
`;

const CLAUDE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

describe('toClaudeDesignSystem', () => {
  const result = toClaudeDesignSystem({ name: 'Paper', id: 'paper', designMd: DESIGN_MD, tokensCss: TOKENS_CSS, by: 'Iven', now: '2026-10-21T00:00:00.000Z' });
  const tokens = JSON.parse(result.files['project/tokens.json']) as ClaudeTokensJson;

  it('writes the four files a new Design System artifact needs', () => {
    assert.deepStrictEqual(Object.keys(result.files).sort(), [
      'project/README.md',
      'project/components/Cover/preview.html',
      'project/design-system.json',
      'project/tokens.json',
    ]);
    const index = JSON.parse(result.files['project/design-system.json']);
    assert.strictEqual(index.layout, 'files');
    assert.deepStrictEqual(index.createdOnFiles, { v: 1, at: '2026-10-21T00:00:00.000Z' });
    assert.strictEqual(index.title, 'Paper');
    assert.strictEqual(index.lastChange.by, 'Iven');
    assert.match(result.files['project/components/Cover/preview.html'], /^<!-- @dsCard height=288 -->/);
  });

  it('produces list-shaped tokens Claude can read: valid unique names, plain colours or aliases, light then dark', () => {
    assert.deepStrictEqual(tokens.color?.themes?.map((t) => t.id), ['light', 'dark']);
    const names = Object.entries(tokens)
      .filter(([k, v]) => k !== 'type' && typeof v === 'object' && v !== null && 'tokens' in v)
      .flatMap(([, v]) => (v as { tokens: Array<{ name: string }> }).tokens.map((t) => t.name));
    assert.strictEqual(new Set(names).size, names.length, 'names are unique across families');
    for (const n of names) assert.match(n, CLAUDE_NAME);
    const bg = tokens.color!.tokens!.find((t) => t.name === 'bg');
    assert.deepStrictEqual(bg?.value, { light: '#f5f4ed', dark: '#111111' });
    assert.strictEqual(tokens.color!.tokens!.find((t) => t.name === 'accent-active')?.value, '{accent}', 'colour var() becomes an alias');
    assert.strictEqual(tokens.color!.tokens!.find((t) => t.name === 'accent-hover')?.value, '#172f52', 'color-mix() is computed to a literal');
    assert.ok(!JSON.stringify(tokens).includes('color-mix('), 'no color-mix() anywhere');
    assert.ok(!JSON.stringify(tokens).includes('var('), 'no var() anywhere');
  });

  it('resolves non-colour references to literals and moves type metrics alongside the scale', () => {
    const shadow = (tokens.shadow as { tokens: Array<{ name: string; value: unknown }> }).tokens;
    assert.strictEqual(shadow.find((t) => t.name === 'elev-ring')?.value, '0 0 0 1px #e8e6dc');
    assert.deepStrictEqual(tokens.type?.families, { display: 'Charter, Georgia, serif', body: 'Inter, system-ui, sans-serif' });
    const display = tokens.type?.groups?.find((g) => g.name === 'Display');
    assert.deepStrictEqual(display?.styles?.[0], { name: 'text-3xl', fontSize: '48px', lineHeight: 1.1, letterSpacing: '-0.02em', usage: 'Type scale step — H1.' });
  });

  it('reports what did not carry across, in notes and the README', () => {
    assert.ok(result.notes.some((n) => n.startsWith('Written as literal colours computed from color-mix(): --accent-hover')));
    // Motion has no Claude token family: it is listed in the README's Motion section instead (openspec add-motion-vocabulary).
    assert.ok(result.notes.some((n) => /^Motion tokens are not Claude tokens/.test(n)));
    assert.match(result.files['project/README.md'], /^> Warm paper, ink-blue accent\.[\s\S]*## Motion[\s\S]*`--motion-fast` \| `150ms`/);
    assert.match(result.files['project/README.md'], /## Not synced from Open Design/);
  });

  it('writes a brand book with no title or provenance, and passes the format validator', () => {
    const readme = result.files['project/README.md'];
    assert.doesNotMatch(readme, /^#\s|> Category:/m);
    assert.match(readme, /## Color/);
    assert.deepStrictEqual(validateClaudeDesignSystem(result.files).errors, []);
  });
});

describe('fromClaudeDesignSystem', () => {
  it('round-trips an exported system back to the same contract tokens', () => {
    const exported = toClaudeDesignSystem({ name: 'Paper', id: 'paper', designMd: DESIGN_MD, tokensCss: TOKENS_CSS });
    const back = fromClaudeDesignSystem({
      title: 'Paper',
      tokensJson: JSON.parse(exported.files['project/tokens.json']),
      readme: `${exported.files['project/README.md']}\n---\n\n## Consuming this system\n\nGenerated by the page.\n`,
    });
    for (const line of ['--bg: #f5f4ed;', '--accent: #1b365d;', '--accent-active: var(--accent);', '--text-3xl: 48px;', '--leading-tight: 1.1;', '--radius-md: 8px;']) {
      assert.ok(back.tokensCss.includes(line), `missing ${line}`);
    }
    assert.match(back.tokensCss, /\[data-theme="dark"\] \{\n {2}--bg: #111111;/);
    assert.match(back.designMd, /^# Paper\n\n> Category: Imported from Claude Design\n> Warm paper/);
    assert.doesNotMatch(back.designMd, /Not synced from Open Design|Consuming this system/);
  });

  it('binds brand-named Claude tokens onto the contract slots', () => {
    const tokensJson: ClaudeTokensJson = {
      color: {
        themes: [{ id: 'light' }, { id: 'dark' }],
        tokens: [
          { name: 'surface', value: { light: '#fbf7f1', dark: '#1d1a17' } },
          { name: 'line', value: '#e4dbcf' },
          { name: 'ink', value: '#2b2118' },
          { name: 'ink-muted', value: '#6f6254' },
          { name: 'ember', value: '#c2410c' },
          { name: 'ember-soft', value: '#ffedd5' },
          { name: 'on-ember', value: '#ffffff' },
        ],
      },
      type: { families: { sans: 'ui-sans-serif, system-ui, sans-serif' }, groups: [{ name: 'Text', family: 'sans', styles: [
        { name: 'caption', fontSize: '12px', lineHeight: '16px' },
        { name: 'body', fontSize: '15px', lineHeight: '22px' },
        { name: 'title', fontSize: '32px', lineHeight: '36px' },
      ] }] },
      spacing: { tokens: [{ name: 'gap-s', value: '8px' }, { name: 'gap-l', value: '24px' }] },
    };
    const out = fromClaudeDesignSystem({ title: 'Ember', tokensJson, readme: 'Ember is a coffee roaster. Warm and direct.' });
    for (const line of ['--bg: var(--surface);', '--fg: var(--ink);', '--muted: var(--ink-muted);', '--border: var(--line);', '--accent: var(--ember);', '--accent-on: var(--on-ember);', '--font-body: var(--font-sans);', '--text-base: 15px;', '--text-4xl: 32px;', '--space-2: var(--gap-s);']) {
      assert.ok(out.tokensCss.includes(line), `missing ${line}`);
    }
    assert.match(out.designMd, /^# Ember\n\n> Category: Imported from Claude Design\n> Ember is a coffee roaster\./);
    const resolved = resolveDesignSystemTokens({ designMd: out.designMd, tokensCss: out.tokensCss });
    assert.deepStrictEqual(resolved.missing, []);
    assert.deepStrictEqual(resolved.fromDesignMd, ['--font-mono'], 'only the mono stack (absent in Claude) is guessed');
  });
});

describe('exporting a reconciled bundled design system', () => {
  const assetsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');

  it('names the same primary colour and body font in README.md and tokens.json (lingo)', async () => {
    const lingo = await new ContentIndex(assetsRoot).getDesignSystem('lingo');
    assert.ok(lingo?.tokensCss);
    const out = toClaudeDesignSystem({
      name: lingo.name,
      id: 'lingo',
      designMd: lingo.body,
      tokensCss: lingo.tokensOverrideCss ? `${lingo.tokensCss}\n${lingo.tokensOverrideCss}` : lingo.tokensCss,
      now: '2026-10-22T00:00:00.000Z',
    });
    const readme = out.files['project/README.md'];
    const tokens = JSON.parse(out.files['project/tokens.json']) as ClaudeTokensJson & { type: { families: Record<string, string> } };
    const primary = /\*\*Primary:\*\* `(#[0-9a-fA-F]{6})`/.exec(readme)?.[1].toLowerCase();
    const family = /\*\*Families:\*\* primary=([^,]+)/.exec(readme)?.[1].trim().toLowerCase();
    const accent = tokens.color?.tokens?.find((t) => t.name === 'accent')?.value;
    assert.strictEqual(typeof accent === 'string' ? accent.toLowerCase() : accent, primary);
    assert.strictEqual(tokens.type.families.body.split(',')[0].replace(/"/g, '').trim().toLowerCase(), family);
  });
});
