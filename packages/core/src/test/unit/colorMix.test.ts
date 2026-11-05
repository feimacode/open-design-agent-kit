import * as assert from 'node:assert';
import { contrastRatio, outOfSrgb, parseColor, resolveColorValue, resolveColorsIn } from '../../generation/colorMix';

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('resolveColorValue', () => {
  // Pixels Chromium painted for these expressions (headless, sRGB profile).
  const browser: Array<[string, string]> = [
    ['color-mix(in oklab, #58cc02, black 8%)', '#4eb602'],
    ['color-mix(in oklab, #1b365d, black 14%)', '#142a4b'],
    ['color-mix(in oklab, #d5232f, white 20%)', '#e35e5a'],
    ['color-mix(in oklab, #6d4aff, #ffffff 90%)', '#eeefff'],
    ['color-mix(in oklch, oklch(0.5772 0.2324 260), black 10%)', '#045ede'],
    ['color-mix(in oklch, #d5232f, #1b365d)', '#773384'],
  ];
  for (const [expr, expected] of browser) {
    it(`matches the browser within 1/255 for ${expr}`, () => {
      const got = resolveColorValue(expr, () => undefined);
      assert.ok(got?.startsWith('#'), `got ${got}`);
      const diff = channels(got!).map((c, i) => Math.abs(c - channels(expected)[i]));
      assert.ok(Math.max(...diff) <= 1, `${got} vs ${expected}`);
    });
  }

  it('follows var() through the lookup, and a mix with transparent keeps the colour at reduced alpha', () => {
    const lookup = (n: string): string | undefined => ({ accent: '#d5232f', ring: 'var(--accent)' })[n];
    assert.strictEqual(resolveColorValue('color-mix(in oklab, var(--ring), transparent 85%)', lookup), 'rgba(213, 35, 47, 0.15)');
    assert.strictEqual(resolveColorValue('var(--accent)', lookup), '#d5232f');
  });

  it('scales alpha when percentages sum under 100, and refuses what it cannot resolve', () => {
    assert.strictEqual(resolveColorValue('color-mix(in srgb, #ff0000 25%, #0000ff 25%)', () => undefined), 'rgba(128, 0, 128, 0.5)');
    assert.strictEqual(resolveColorValue('color-mix(in oklab, var(--missing), black 8%)', () => undefined), undefined);
    assert.strictEqual(resolveColorValue('color-mix(in hwb, red, blue)', () => undefined), undefined);
  });
});

describe('resolveColorsIn', () => {
  it('resolves colours and lengths inside a box-shadow', () => {
    const lookup = (n: string): string | undefined => ({ accent: '#1b365d', border: '#e8e6dc', w: '1px' })[n];
    assert.strictEqual(resolveColorsIn('0 0 0 var(--w) var(--border)', lookup), '0 0 0 1px #e8e6dc');
    assert.match(resolveColorsIn('0 0 0 3px color-mix(in oklab, var(--accent), transparent 75%)', lookup)!, /^0 0 0 3px rgba\(27, 54, 93, 0\.25\)$/);
  });
});

describe('contrastRatio', () => {
  it('gives the WCAG ratio, and parses the colour forms tokens use', () => {
    assert.strictEqual(Math.round(contrastRatio('#ffffff', '#000000')! * 10) / 10, 21);
    assert.ok(Math.abs(contrastRatio('#6f6f6f', '#ffffff')! - 5.0) < 0.1);
    for (const v of ['#abc', 'rgb(1 2 3)', 'rgba(1, 2, 3, 0.5)', 'hsl(210 40% 50%)', 'oklch(55% 0 0)', 'oklab(0.5 0.1 -0.1)', 'transparent']) assert.ok(parseColor(v), v);
  });
});

describe('parseColor: modern syntaxes Chrome returns from getComputedStyle', () => {
  // Pixels Chromium painted for these colours through a 1×1 canvas.
  const browser: Array<[string, string]> = [
    ['lab(52.2 40.1 59.9)', '#c65d07'],
    ['lch(52.2 72.2 56.2)', '#c65d06'],
    ['lab(40% 20% -30%)', '#6d509c'],
    ['color(display-p3 0.2 0.5 0.8)', '#0082d2'],
    ['color(srgb 0.2 0.4 0.6)', '#336699'],
    ['color(rec2020 0.3 0.5 0.4)', '#199071'],
    ['color(xyz-d65 0.2 0.3 0.4)', '#00a7a4'],
    ['hwb(200 10% 20%)', '#1a91cc'],
    ['oklch(0.6 0.15 30)', '#ca5747'],
    ['oklch(0.5 0.1 0.5turn)', '#007565'],
  ];
  const toHex = (c: { r: number; g: number; b: number }): string =>
    '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  for (const [expr, expected] of browser) {
    it(`matches the browser within 1/255 for ${expr}`, () => {
      const got = parseColor(expr);
      assert.ok(got, expr);
      const diff = channels(toHex(got!)).map((c, i) => Math.abs(c - channels(expected)[i]));
      assert.ok(Math.max(...diff) <= 1, `${toHex(got!)} vs ${expected}`);
    });
  }

  it('reads alpha and tells a colour wider than sRGB from one inside it', () => {
    assert.strictEqual(parseColor('oklch(0.6 0.15 30 / 0.4)')?.a, 0.4);
    assert.ok(outOfSrgb(parseColor('color(display-p3 1 0 0)')!));
    assert.ok(!outOfSrgb(parseColor('color(display-p3 0.4 0.5 0.7)')!));
    assert.ok(!outOfSrgb(parseColor('oklch(1 0 0)')!));
  });
});
