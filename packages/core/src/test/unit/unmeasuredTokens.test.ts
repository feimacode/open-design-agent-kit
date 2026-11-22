// openspec keep-hosted-extraction-honest: no estimates, flagged when they happen, listed in DESIGN.md.
import * as assert from 'node:assert';
import { rootTokenValues, unmeasuredTokenFindings } from '../../export/brandReview';
import { composeCustomDesignSystemInstructions, notMeasuredDefaults } from '../../generation/customDesignSystemInstructions';

describe('unmeasured tokens (keep-hosted-extraction-honest)', () => {
  const css = `/* draft */
:root {
  --accent: #635bff;
  --radius-lg: 24px;
  --accent-hover: color-mix(in oklch, var(--accent), black 12%);
  --success: var(--accent);
  --text-2xl: calc(var(--text-base) * 1.5);
}
[data-theme="dark"] { --radius-lg: 8px; }`;

  it('reads the light :root set only', () => {
    const values = rootTokenValues(css);
    assert.strictEqual(values.get('--radius-lg'), '24px');
    assert.strictEqual(values.size, 5);
  });

  it('flags a literal value on a token the draft did not measure, not a derived one', () => {
    const findings = unmeasuredTokenFindings(css, { unmeasured: ['--radius-lg', '--accent-hover', '--success', '--text-2xl', '--warning'] });
    assert.deepStrictEqual(findings.map((f) => f.selector), ['--radius-lg']);
    assert.strictEqual(findings[0].check, 'brand-unmeasured');
    assert.strictEqual(findings[0].severity, 'info');
    assert.match(findings[0].message, /`--radius-lg: 24px` wasn't measured/);
    assert.deepStrictEqual(unmeasuredTokenFindings(css, { unmeasured: ['--radius-lg'], sources: { '--radius-lg': { confidence: 'stated' } } }), []);
    assert.deepStrictEqual(unmeasuredTokenFindings(css, undefined), []);
  });

  it('tells the agent not to estimate and to list what was not measured, with defaults', () => {
    const defaults = notMeasuredDefaults(['--success', '--not-a-contract-token']);
    assert.strictEqual(defaults.length, 1);
    assert.strictEqual(defaults[0].name, '--success');
    const text = composeCustomDesignSystemInstructions({ name: 'Acme', brief: 'b', suggestedEntryPath: '.open-design/design-systems/acme/DESIGN.md', id: 'user:acme', unmeasured: ['--success', '--radius-lg'] });
    assert.match(text, /Never estimate a value/);
    assert.match(text, /"Not measured:"/);
    assert.match(text, new RegExp(`\`--success\` \\(default \`${defaults[0].fallback.replace(/[()#]/g, '\\$&')}\`\\)`));
    assert.match(composeCustomDesignSystemInstructions({ name: 'Acme', brief: 'b', suggestedEntryPath: 'x/DESIGN.md', id: 'user:acme' }), /Never estimate a value/);
  });
});
