import * as assert from 'node:assert';
import { resolveDesignSystemTokens } from '../../generation/designSystemTokens';
import {
  composeMotionSection,
  deriveMotionVocabulary,
  entranceRecipe,
  motionDials,
  motionVocabularyCss,
  parseCssTimeMs,
  skillAnimates,
  springEasing,
} from '../../generation/motionVocabulary';
import { evidenceToTokens } from '../../generation/evidenceToTokens';
import { toClaudeDesignSystem } from '../../generation/claudeDesignSystem';
import { discoverTweaks } from '../../generation/tweaks';
import type { BrandMotion } from '../../generation/brandKit';

const tokens = (o: Record<string, string>) => new Map(Object.entries(o));

describe('motion vocabulary', () => {
  it('derives the scale from the core tokens (spec: bundled system with only core tokens)', () => {
    const d = deriveMotionVocabulary(tokens({ '--motion-fast': '150ms', '--motion-base': '200ms', '--ease-standard': 'ease' }));
    assert.strictEqual(d.get('--motion-slow'), '400ms');
    assert.strictEqual(d.get('--motion-scene'), '800ms');
    assert.strictEqual(d.get('--motion-instant'), '80ms');
    assert.strictEqual(d.get('--motion-stagger'), '60ms');
    assert.strictEqual(d.get('--motion-distance'), '16px');
    assert.match(d.get('--ease-spring')!, /^linear\(0, .*, 1\)$/);
  });

  it('keeps a declared name (spec: system declares its own slow duration)', () => {
    const d = deriveMotionVocabulary(tokens({ '--motion-base': '200ms', '--motion-slow': '500ms' }));
    assert.strictEqual(d.has('--motion-slow'), false);
    const resolved = resolveDesignSystemTokens({ designMd: '# X', tokensCss: ':root { --motion-base: 200ms; --motion-slow: 500ms; }' });
    assert.strictEqual(resolved.tokens.get('--motion-slow'), '500ms');
    assert.ok(!resolved.derivedMotion.includes('--motion-slow'));
    assert.ok(resolved.derivedMotion.includes('--motion-scene'));
  });

  it('scales durations with speed and removes overshoot at bounce 0 (spec: calm brand)', () => {
    const d = deriveMotionVocabulary(tokens({ '--motion-base': '200ms', '--motion-speed': '1.5', '--motion-bounce': '0' }));
    assert.strictEqual(d.get('--motion-slow'), '600ms');
    assert.strictEqual(d.get('--ease-enter'), 'cubic-bezier(0.34, 1, 0.64, 1)');
    const stops = /linear\((.*)\)/.exec(d.get('--ease-spring')!)![1].split(',').map(Number);
    assert.ok(Math.max(...stops) <= 1, 'no overshoot at bounce 0');
  });

  it('clamps the dials and reads seconds', () => {
    assert.deepStrictEqual(motionDials(tokens({ '--motion-speed': '9', '--motion-bounce': '-1' })), { speed: 2, bounce: 0 });
    assert.deepStrictEqual(motionDials(tokens({})), { speed: 1, bounce: 0.2 });
    assert.strictEqual(parseCssTimeMs('0.25s'), 250);
    assert.strictEqual(parseCssTimeMs('var(--x)'), undefined);
  });

  it('overshoots with bounce', () => {
    const stops = /linear\((.*)\)/.exec(springEasing(1))![1].split(',').map(Number);
    assert.ok(Math.max(...stops) > 1.1);
    assert.strictEqual(stops[stops.length - 1], 1);
  });

  it('writes CSS with an @supports fallback for the spring', () => {
    const css = motionVocabularyCss(deriveMotionVocabulary(tokens({})));
    assert.match(css, /:root \{[\s\S]*--motion-scene: 800ms;/);
    assert.match(css, /@supports not \(transition-timing-function: linear\(0, 1\)\)/);
  });
});

describe('motion brief section', () => {
  const brandMotion: BrandMotion = { hover: 'none', focus: 'none', load: 'none', entrance: { kind: 'rise', distance: 24, duration: 600, stagger: 80, targets: ['cards'] } };

  it('states the measured entrance recipe (spec: launch film for an extracted brand)', () => {
    assert.strictEqual(entranceRecipe(brandMotion), 'cards fade and rise 24px over 600ms, 80ms apart');
    const section = composeMotionSection({ tokens: tokens({ '--motion-fast': '150ms', '--motion-base': '200ms' }), brandMotion, designSystemName: 'Pennyflow' });
    assert.match(section, /^## Motion/);
    assert.match(section, /Pennyflow's motion vocabulary/);
    assert.match(section, /cards fade and rise 24px over 600ms, 80ms apart/);
    assert.match(section, /prefers-reduced-motion/);
    assert.match(section, /--motion-speed: 1/);
  });

  it('says a still brand stays still', () => {
    const section = composeMotionSection({ tokens: tokens({}), brandMotion: { hover: 'none', focus: 'none', load: 'none', entrance: 'none' } });
    assert.match(section, /doesn't animate/);
  });

  it('only animated skills get the section (spec: poster without animation)', () => {
    assert.strictEqual(skillAnimates({ id: 'od:video:video-hyperframes', mode: 'video' }), true);
    assert.strictEqual(skillAnimates({ id: 'od:prototype:frame-logo-outro', mode: 'prototype' }), true);
    assert.strictEqual(skillAnimates({ id: 'od:prototype:gsap-scrolltrigger', mode: 'prototype', category: 'animation-motion' }), true);
    assert.strictEqual(skillAnimates({ id: 'od:image:poster-minimal', mode: 'image', body: 'A static A3 poster.' }), false);
    assert.strictEqual(skillAnimates({ id: 'od:video:sora', mode: 'video', category: 'video-generation' }), false);
  });
});

describe('measured motion fills the vocabulary', () => {
  const page = (motion: unknown) => ({ url: 'https://example.com/', motion }) as never;

  it('sets distance, slow and stagger from an observed entrance (spec: staggered card reveal)', () => {
    const anim = (delay: number) => ({ trigger: 'scroll', role: 'card', selector: '.card', props: ['opacity', 'transform'], from: { opacity: '0', transform: 'translateY(24px)' }, to: { opacity: '1', transform: 'none' }, duration: 600, delay, easing: 'ease-out', at: 0 });
    const draft = draftWith(page({ animations: [anim(0), anim(80), anim(160)] }));
    assert.strictEqual(draft.tokens['--motion-distance'], '24px');
    assert.strictEqual(draft.tokens['--motion-slow'], '600ms');
    assert.strictEqual(draft.tokens['--motion-stagger'], '80ms');
    assert.strictEqual(draft.sources['--motion-stagger'].basis, 'observed');
  });

  it('gives a still site no bounce (spec: still site)', () => {
    const draft = draftWith(page({ animations: [] }));
    assert.strictEqual(draft.tokens['--motion-bounce'], '0');
    assert.ok(draft.notes.some((n) => /site is still/.test(n)));
  });
});

describe('motion outside the kit', () => {
  it('lists the vocabulary in the Claude Design README', () => {
    const { files } = toClaudeDesignSystem({ name: 'Acme', id: 'acme', designMd: '# Acme', tokensCss: ':root { --bg: #fff; --fg: #111; --accent: #e11d48; --motion-fast: 120ms; --motion-base: 240ms; --ease-standard: ease-out; }', now: '2026-11-18T00:00:00Z' });
    const readme = files['project/README.md'];
    assert.match(readme, /## Motion/);
    assert.match(readme, /`--motion-scene` \| `960ms`/);
    assert.doesNotMatch(readme, /no motion family\.$/m);
  });

  it('offers the speed and bounce dials as preview tweaks', () => {
    const html = '<style>:root { --accent: #e11d48; --motion-speed: 1; --motion-bounce: 0.2; }</style>';
    const knobs = discoverTweaks(html).knobs.filter((k) => k.group === 'Motion');
    assert.deepStrictEqual(knobs.map((k) => [k.name, k.min, k.max]), [['--motion-speed', 0.5, 2], ['--motion-bounce', 0, 1]]);
  });
});

/** One page of evidence (as siteExtraction.test.ts builds it) carrying a motion observation. */
function draftWith(motionPage: { url: string; motion: unknown }) {
  const page = {
    roles: {
      bg: { value: 'rgb(255, 255, 255)', selector: 'body', count: 1 },
      fg: { value: 'rgb(60, 60, 60)', selector: 'main > p', count: 4 },
      accent: { value: 'rgb(88, 204, 2)', selector: 'button.btn-primary', count: 1 },
    },
    textRoles: [{ role: 'body', selector: 'main > p', fontFamily: 'Inter, sans-serif', fontSize: 16, lineHeight: 24, fontWeight: 400 }],
    fonts: [],
    customProperties: { root: {}, themes: {} },
    radii: [],
    spacing: [],
    transitions: { durations: [], easings: [] },
    ...motionPage,
  };
  return evidenceToTokens({ pages: [page] } as never);
}
