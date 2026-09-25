import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { isSafeCssValue, parseTokensCss, resolveDesignSystemTokens, resolveTokenValue } from '../../generation/designSystemTokens';

const DESIGN_SYSTEMS_DIR = path.resolve(__dirname, '../../../../content/assets/open-design/design-systems');
const read = (id: string, file: string) => readFileSync(path.join(DESIGN_SYSTEMS_DIR, id, file), 'utf8');

const DESIGN_MD = '# Acme\n\n## Color Palette\n\n- **Brand primary** (`#e11d48`): primary CTA.\n- **Background** (`#fafafa`): page canvas.\n';

describe('parseTokensCss', () => {
  it('reads only top-level :root blocks, ignoring dark-mode, lang, and @media variants', () => {
    const tokens = parseTokensCss(
      [
        '/* --accent: #000000; in a comment */',
        ':root {\n  --accent: #111111;\n  --font-body:\n    "Inter", sans-serif;\n}',
        '[data-mode="dark"] { --accent: #222222; }',
        ':root[lang="zh"] { --font-body: "Noto Sans SC"; }',
        '@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; } }',
      ].join('\n'),
    );
    assert.deepStrictEqual([...tokens], [
      ['--accent', '#111111'],
      ['--font-body', '"Inter", sans-serif'],
    ]);
  });

  it('parses the real multi-block cloudflare-kumo tokens.css to its base (light) values', () => {
    const tokens = parseTokensCss(read('cloudflare-kumo', 'tokens.css'));
    assert.ok(tokens.has('--accent'));
    assert.ok(!tokens.has('--motion-fast') || tokens.get('--motion-fast') !== '0ms');
  });

  it('drops values that could escape a <style> block or fetch a resource', () => {
    const tokens = parseTokensCss(':root { --a: red</style><script>x</script>; --b: url(https://x.test/a.png); --c: #fff; }');
    assert.deepStrictEqual([...tokens.keys()], ['--c']);
    assert.strictEqual(isSafeCssValue('"SF Mono", ui-monospace'), true);
    assert.strictEqual(isSafeCssValue('"unbalanced, serif'), false);
    assert.strictEqual(isSafeCssValue('a /* b'), false);
  });
});

describe('resolveDesignSystemTokens', () => {
  it('prefers tokens.css over DESIGN.md', () => {
    const resolved = resolveDesignSystemTokens({ designMd: DESIGN_MD, tokensCss: ':root { --accent: #533afd; --bg: #ffffff; }' });
    assert.strictEqual(resolved.tokens.get('--accent'), '#533afd');
    assert.strictEqual(resolved.tokens.get('--bg'), '#ffffff');
    assert.strictEqual(resolved.approximated, false);
  });

  it('applies the local override on top of tokens.css', () => {
    const resolved = resolveDesignSystemTokens({
      designMd: DESIGN_MD,
      tokensCss: ':root { --accent: #2563eb; --bg: #ffffff; }',
      overrideCss: ':root { --accent: #9333ea; }',
    });
    assert.strictEqual(resolved.tokens.get('--accent'), '#9333ea');
    assert.strictEqual(resolved.tokens.get('--bg'), '#ffffff');
  });

  it('fills identity gaps from DESIGN.md only for tokens tokens.css omits', () => {
    const resolved = resolveDesignSystemTokens({ designMd: DESIGN_MD, tokensCss: ':root { --bg: #000000; }' });
    assert.strictEqual(resolved.tokens.get('--bg'), '#000000');
    assert.ok(resolved.fromDesignMd.includes('--accent'));
    assert.ok(!resolved.fromDesignMd.includes('--bg'));
  });

  it('fills A2 fallbacks and B-slot aliases from the contract', () => {
    const resolved = resolveDesignSystemTokens({ designMd: DESIGN_MD, tokensCss: ':root { --accent: #533afd; --surface: #f6f9fc; }' });
    assert.strictEqual(resolved.tokens.get('--success'), '#16a34a');
    assert.strictEqual(resolved.tokens.get('--surface-warm'), 'var(--surface)');
    assert.strictEqual(resolveTokenValue(resolved.tokens, '--surface-warm'), '#f6f9fc');
    assert.ok(resolved.fromDefaults.includes('--success'));
    assert.ok(resolved.missing.includes('--text-base'), 'A1-structure tokens have no contract default');
  });

  it('flags a DESIGN.md-only design system as approximated and derives its identity tokens', () => {
    const resolved = resolveDesignSystemTokens({ designMd: DESIGN_MD });
    assert.strictEqual(resolved.approximated, true);
    assert.strictEqual(resolved.tokens.get('--accent'), '#e11d48');
    assert.strictEqual(resolved.tokens.get('--bg'), '#fafafa');
  });

  it('resolves the bundled Application design system to its DESIGN.md primary via its override', () => {
    const resolved = resolveDesignSystemTokens({
      designMd: read('application', 'DESIGN.md'),
      tokensCss: read('application', 'tokens.css'),
      overrideCss: read('application', 'tokens.override.css'),
    });
    assert.strictEqual(resolved.tokens.get('--accent'), '#9333ea');
    assert.strictEqual(resolved.tokens.get('--accent-on'), '#ffffff');
  });
});

describe('resolveTokenValue', () => {
  it('substitutes nested var() references, keeps fallbacks, and survives cycles', () => {
    const tokens = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'color-mix(in oklab, var(--c), black 8%)'],
      ['--c', '#123456'],
      ['--d', 'var(--nope, #abcdef)'],
      ['--x', 'var(--y)'],
      ['--y', 'var(--x)'],
    ]);
    assert.strictEqual(resolveTokenValue(tokens, '--a'), 'color-mix(in oklab, #123456, black 8%)');
    assert.strictEqual(resolveTokenValue(tokens, '--d'), '#abcdef');
    assert.ok(resolveTokenValue(tokens, '--x') !== undefined);
  });
});
