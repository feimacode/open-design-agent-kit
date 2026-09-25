import * as assert from 'node:assert';
import type { DesignSystemDetail } from '../../content/contentIndex';
import {
  composeCustomDesignSystemInstructions,
  composeDesignSystemTokensInstructions,
  composeTokenContractSection,
  tokensPathFor,
} from '../../generation/customDesignSystemInstructions';
import { buildDesignSystemTokensCss } from '../../generation/designSystemImport';
import { TOKEN_SCHEMA } from '../../vendored/designTokenSchema';

const custom: DesignSystemDetail = {
  id: 'user:acme',
  name: 'Acme',
  summary: 'x',
  source: 'user',
  hasTokens: false,
  craftSuggested: [],
  body: '# Acme\n\n## Color Palette\n\n- Rocket Red #e11d48\n',
};

describe('composeTokenContractSection', () => {
  it('lists every required contract token, including the identity ones, generated from the vendored schema', () => {
    const section = composeTokenContractSection();
    for (const name of ['--bg', '--surface', '--fg', '--muted', '--border', '--accent', '--font-display', '--font-body']) {
      assert.ok(section.includes(`\`${name}\``), name);
    }
    for (const spec of TOKEN_SCHEMA) assert.ok(section.includes(`\`${spec.name}\``), spec.name);
    assert.match(section, /`--success` — Success state\. Default: `#16a34a`\./);
    assert.match(section, /`--fg-2` — .* Default: `var\(--fg\)`\./);
  });
});

describe('composeCustomDesignSystemInstructions', () => {
  it('asks for DESIGN.md and a sibling tokens.css following the contract', () => {
    const instructions = composeCustomDesignSystemInstructions({
      name: 'Acme',
      brief: 'Bold red.',
      suggestedEntryPath: '.open-design/design-systems/acme/DESIGN.md',
      id: 'user:acme',
    });
    assert.match(instructions, /## First file: DESIGN\.md/);
    assert.match(instructions, /## Second file: tokens\.css\n\nThen write `\.open-design\/design-systems\/acme\/tokens\.css`/);
    assert.ok(instructions.includes(composeTokenContractSection()));
    assert.match(instructions, /After writing both files/);
  });

  it('derives tokens.css beside DESIGN.md', () => {
    assert.strictEqual(tokensPathFor('out/design-systems/x/DESIGN.md'), 'out/design-systems/x/tokens.css');
  });
});

describe('composeDesignSystemTokensInstructions', () => {
  it('returns tokens-only instructions embedding the existing DESIGN.md as source of truth', () => {
    const result = composeDesignSystemTokensInstructions('user:acme', custom, '.open-design');
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.strictEqual(result.suggestedEntryPath, '.open-design/design-systems/acme/tokens.css');
    assert.match(result.instructions, /Write only its `tokens\.css`/);
    assert.match(result.instructions, /Do NOT change the DESIGN\.md/);
    assert.ok(result.instructions.includes(custom.body));
    assert.doesNotMatch(result.instructions, /replacing the existing one/);
  });

  it('mentions replacement when the custom system already has tokens', () => {
    const result = composeDesignSystemTokensInstructions('user:acme', { ...custom, hasTokens: true }, '.open-design');
    assert.ok(result.ok && /replacing the existing one/.test(result.instructions));
  });

  it('rejects a built-in or unknown id', () => {
    const builtIn = composeDesignSystemTokensInstructions('stripe', { ...custom, id: 'stripe', source: 'built-in' }, '.open-design');
    assert.ok(!builtIn.ok && /"stripe" is not an existing custom design system/.test(builtIn.error));
    const unknown = composeDesignSystemTokensInstructions('user:nope', undefined, '.open-design');
    assert.ok(!unknown.ok && /user:nope/.test(unknown.error));
  });
});

describe('buildDesignSystemTokensCss', () => {
  it('copies only contract-named declarations, values unchanged', () => {
    const css = buildDesignSystemTokensCss(':root {\n  --accent: #ff385c;\n  --bg: #ffffff;\n  --brand-rausch: #ff385c;\n  --font-body: "Cereal", sans-serif;\n}', 'tokens.css');
    assert.strictEqual(
      css,
      '/* Imported from tokens.css.\n * Only declarations using Open Design token-contract names were copied, values unchanged. */\n:root {\n  --accent: #ff385c;\n  --bg: #ffffff;\n  --font-body: "Cereal", sans-serif;\n}\n',
    );
  });

  it('writes nothing when the source has colors but no contract-named declarations', () => {
    assert.strictEqual(buildDesignSystemTokensCss(':root { --brand: #ff385c; } body { color: #111; }', 'x.css'), undefined);
    assert.strictEqual(buildDesignSystemTokensCss('module.exports = { colors: { primary: "#ff385c" } }', 'tailwind.config.js'), undefined);
  });

  it('writes nothing for a DESIGN.md source', () => {
    assert.strictEqual(buildDesignSystemTokensCss('# Brand\n\n--accent: #fff;', 'DESIGN.md'), undefined);
  });
});
