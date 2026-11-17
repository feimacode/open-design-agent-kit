// The motion vocabulary (openspec add-motion-vocabulary): the token schema is
// vendored and has three motion tokens (`--motion-fast`, `--motion-base`,
// `--ease-standard`). Everything else an agent needs to build a film or a page
// with entrances is derived from those three plus two dials, `--motion-speed`
// and `--motion-bounce`, at resolve time. Names a design system declares keep
// their declared value.

import type { BrandMotion } from './brandKit';

/** Every name the vocabulary can add, in the order a brief lists them. */
export const MOTION_VOCABULARY_NAMES = [
  '--motion-instant',
  '--motion-slow',
  '--motion-scene',
  '--ease-enter',
  '--ease-exit',
  '--ease-spring',
  '--motion-stagger',
  '--motion-distance',
] as const;

/** The core names the schema already requires, shown with the vocabulary in a brief. */
export const MOTION_CORE_NAMES = ['--motion-fast', '--motion-base', '--ease-standard'] as const;

export const DEFAULT_MOTION_SPEED = 1;
export const DEFAULT_MOTION_BOUNCE = 0.2;
const DEFAULT_FAST_MS = 150;
const DEFAULT_BASE_MS = 200;
const DEFAULT_DISTANCE_PX = 16;

/** The fallback for engines without `linear()` easing, used for `--ease-spring`. */
export const SPRING_FALLBACK = 'cubic-bezier(0.34, 1.2, 0.64, 1)';

export interface MotionDials {
  /** 0.5 to 2: multiplies every derived duration. */
  speed: number;
  /** 0 to 1: overshoot of `--ease-spring` and `--ease-enter`. */
  bounce: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round10 = (ms: number): number => Math.max(10, Math.round(ms / 10) * 10);
const fixed = (n: number, digits = 3): string => String(Number(n.toFixed(digits)));

/** A CSS time (`150ms`, `0.2s`) in milliseconds, or undefined when it isn't one. */
export function parseCssTimeMs(value: string | undefined): number | undefined {
  const m = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/i.exec(value ?? '');
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** The two dials from `--motion-speed` and `--motion-bounce`, clamped, else the defaults. */
export function motionDials(tokens: ReadonlyMap<string, string>): MotionDials {
  const speed = parseNumber(tokens.get('--motion-speed'));
  const bounce = parseNumber(tokens.get('--motion-bounce'));
  return {
    speed: speed === undefined ? DEFAULT_MOTION_SPEED : clamp(speed, 0.5, 2),
    bounce: bounce === undefined ? DEFAULT_MOTION_BOUNCE : clamp(bounce, 0, 1),
  };
}

/**
 * A damped spring from 0 to 1 sampled as a CSS `linear()` easing. bounce 0 is
 * critically damped (no overshoot); bounce 1 overshoots by about a third.
 */
export function springEasing(bounce: number, points = 24): string {
  const b = clamp(bounce, 0, 1);
  const zeta = 1 - 0.75 * b;
  const omega = 9;
  const at = (t: number): number => {
    if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
  };
  const stops: string[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    stops.push(i === 0 ? '0' : i === points ? '1' : fixed(at(t)));
  }
  return `linear(${stops.join(', ')})`;
}

/** An ease-out for arrivals; with bounce it overshoots slightly before settling. */
export function enterEasing(bounce: number): string {
  const b = clamp(bounce, 0, 1);
  return `cubic-bezier(0.34, ${fixed(1 + 0.6 * b, 2)}, 0.64, 1)`;
}

export const EXIT_EASING = 'cubic-bezier(0.7, 0, 0.84, 0)';

/**
 * The vocabulary names this token set doesn't declare, with derived values:
 * instant = fast × 0.5, slow = base × 2, scene = base × 4, stagger = base × 0.3,
 * each times speed and rounded to 10 ms.
 */
export function deriveMotionVocabulary(tokens: ReadonlyMap<string, string>): Map<string, string> {
  const { speed, bounce } = motionDials(tokens);
  const fast = parseCssTimeMs(tokens.get('--motion-fast')) ?? DEFAULT_FAST_MS;
  const base = parseCssTimeMs(tokens.get('--motion-base')) ?? DEFAULT_BASE_MS;
  const values: Record<(typeof MOTION_VOCABULARY_NAMES)[number], string> = {
    '--motion-instant': `${round10(fast * 0.5 * speed)}ms`,
    '--motion-slow': `${round10(base * 2 * speed)}ms`,
    '--motion-scene': `${round10(base * 4 * speed)}ms`,
    '--ease-enter': enterEasing(bounce),
    '--ease-exit': EXIT_EASING,
    '--ease-spring': springEasing(bounce),
    '--motion-stagger': `${round10(base * 0.3 * speed)}ms`,
    '--motion-distance': `${DEFAULT_DISTANCE_PX}px`,
  };
  const out = new Map<string, string>();
  for (const name of MOTION_VOCABULARY_NAMES) if (!tokens.has(name)) out.set(name, values[name]);
  return out;
}

/** The token set with the derived vocabulary added (declared names win). */
export function withMotionVocabulary(tokens: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(tokens);
  for (const [name, value] of deriveMotionVocabulary(tokens)) out.set(name, value);
  return out;
}

/**
 * The derived block as CSS for a design-system export or a Claude Design
 * build: a `:root` block, plus an `@supports` fallback for `--ease-spring` in
 * engines without `linear()` (a custom property can't fall back by itself).
 */
export function motionVocabularyCss(derived: ReadonlyMap<string, string>, comment = 'Motion vocabulary, derived from the motion tokens above (openspec add-motion-vocabulary).'): string {
  if (derived.size === 0) return '';
  const lines = [...derived].map(([k, v]) => `  ${k}: ${v};`).join('\n');
  let css = `/* ${comment} */\n:root {\n${lines}\n}\n`;
  if (derived.get('--ease-spring')?.startsWith('linear(')) {
    css += `@supports not (transition-timing-function: linear(0, 1)) {\n  :root { --ease-spring: ${SPRING_FALLBACK}; }\n}\n`;
  }
  return css;
}

/** One line for how sections and cards enter, from a measured brand, e.g. "sections fade and rise 24px over 600ms, 80ms apart". */
export function entranceRecipe(motion: BrandMotion | undefined): string | undefined {
  const e = motion?.entrance;
  if (!e || e === 'none') return undefined;
  const who = e.targets.length > 0 ? e.targets.slice(0, 3).join(' and ') : 'content';
  const how = e.kind === 'rise' ? `fade and rise${e.distance ? ` ${e.distance}px` : ''}` : e.kind === 'slide' ? `slide in${e.distance ? ` ${e.distance}px` : ''}` : e.kind === 'scale' ? 'fade and scale up' : 'fade in';
  return `${who} ${how} over ${e.duration}ms${e.stagger ? `, ${e.stagger}ms apart` : ''}${e.easing ? ` (${e.easing})` : ''}`;
}

const ANIMATED_ID = /(^|[:/_-])(motion|animat\w*|frame|frames|hyperframes|remotion|gif|kinetic|reel|video|lottie|gsap|sprite|vfx|outro|intro|showreel|scrolltrigger)([:/_-]|$)/i;

/** Whether a skill makes something that moves, so its brief gets the Motion section. */
export function skillAnimates(skill: { id: string; name?: string; mode?: string; category?: string; body?: string }): boolean {
  // Generated footage (Sora, Kling, fal…) isn't animated with tokens.
  if (/video-generation/i.test(skill.category ?? '')) return false;
  if (skill.mode === 'video') return true;
  if (/animation|motion|video/i.test(skill.category ?? '')) return true;
  if (ANIMATED_ID.test(skill.id) || ANIMATED_ID.test(skill.name ?? '')) return true;
  return /data-duration|ScrollTrigger|@keyframes|requestAnimationFrame/.test(skill.body ?? '');
}

/**
 * The brief's Motion section: the vocabulary with its values, the entrance
 * recipe when the brand has one, the reduced-motion rule, and "use these".
 */
export function composeMotionSection(input: { tokens: ReadonlyMap<string, string>; brandMotion?: BrandMotion; designSystemName?: string }): string {
  const full = withMotionVocabulary(input.tokens);
  const dials = motionDials(input.tokens);
  const value = (name: string): string => full.get(name) ?? '';
  const rows = [
    ['`--motion-instant`', value('--motion-instant'), 'press feedback, tiny state flips'],
    ['`--motion-fast`', value('--motion-fast'), 'hover and focus'],
    ['`--motion-base`', value('--motion-base'), 'state changes, small panels'],
    ['`--motion-slow`', value('--motion-slow'), 'an element arriving, larger panels'],
    ['`--motion-scene`', value('--motion-scene'), 'a scene change or shape transformation in a film'],
    ['`--motion-stagger`', value('--motion-stagger'), 'delay between siblings entering one after another'],
    ['`--motion-distance`', value('--motion-distance'), 'how far things travel as they enter'],
    ['`--ease-standard`', value('--ease-standard'), 'state changes'],
    ['`--ease-enter`', value('--ease-enter'), 'arrivals (ease-out)'],
    ['`--ease-exit`', value('--ease-exit'), 'departures (ease-in)'],
    ['`--ease-spring`', '`linear()` spring', 'playful arrivals; fall back to `--ease-enter` where `linear()` is unsupported'],
  ];
  const table = ['| Token | Value | Use for |', '| --- | --- | --- |', ...rows.map(([n, v, u]) => `| ${n} | ${v.startsWith('`') ? v : `\`${v}\``} | ${u} |`)].join('\n');
  const recipe = entranceRecipe(input.brandMotion);
  const still = input.brandMotion && input.brandMotion.entrance === 'none' && input.brandMotion.load === 'none' && input.brandMotion.hover === 'none';
  const lines = [
    `## Motion`,
    '',
    `${input.designSystemName ? `${input.designSystemName}'s` : 'The'} motion vocabulary (speed ${fixed(dials.speed, 2)}, bounce ${fixed(dials.bounce, 2)}). Declare these custom properties in the design's \`:root\` with the values below, and use them for every duration, delay and easing. Don't invent other durations or easings. Also declare \`--motion-speed: 1\` and \`--motion-bounce: ${fixed(dials.bounce, 2)}\`, write each duration as \`calc(<value> * var(--motion-speed))\` and \`--ease-enter\` as \`cubic-bezier(0.34, calc(1 + 0.6 * var(--motion-bounce)), 0.64, 1)\`, so the preview's speed and bounce dials work.`,
    '',
    table,
  ];
  if (recipe) lines.push('', `**Entrance recipe (measured on the brand's site):** ${recipe}. Use it for sections and cards entering.`);
  if (still) lines.push('', "**The brand's site doesn't animate.** Keep motion to hover and focus feedback unless the brief asks for a film.");
  lines.push(
    '',
    '**Reduced motion:** under `@media (prefers-reduced-motion: reduce)`, remove travel, scale and looping motion; keep at most a short opacity fade. Every entrance must still end in its final, readable state.',
  );
  return lines.join('\n');
}
