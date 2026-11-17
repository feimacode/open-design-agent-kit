/// <reference lib="dom" />
// Motion checks (openspec add-motion-checks-and-steering): play a design on
// the virtual clock through its load window and a few scroll steps, inventory
// what moves (document.getAnimations() for CSS transitions, CSS animations and
// the Web Animations API, which GSAP and Motion One can use; sampled transforms
// and opacity for script-driven motion, reported as inferred), and judge it
// against UI motion limits and the design system's motion vocabulary. Films
// are judged only on crowding and the vocabulary: a film's 1.2 s arrival is
// fine. Also picks the beats for the filmstrip.
import type { Page } from 'puppeteer-core';
import type { Finding } from '../poster/preflight';
import { MOTION_CORE_NAMES, MOTION_VOCABULARY_NAMES, motionDials, parseCssTimeMs, withMotionVocabulary } from '../generation/motionVocabulary';

/** The limits the rules use; one table so it can be tuned (sources: animation-discipline.md, upstream motion craft). */
export const MOTION_LIMITS = {
  /** UI transitions longer than this read as sluggish. */
  slowUiMs: 500,
  /** More than this many elements starting within `crowdWindowMs` (outside a stagger) is a crowd. */
  crowdCount: 6,
  crowdWindowMs: 100,
  /** A duration within this share of a vocabulary value counts as on-vocabulary. */
  vocabularyTolerance: 0.1,
  /** How long the load window plays, and the scroll steps after it. */
  loadWindowMs: 3000,
  scrollSteps: 4,
  scrollStepMs: 800,
} as const;

const LAYOUT_PROPERTIES = new Set(['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'max-height', 'max-width', 'min-height', 'min-width', 'font-size', 'line-height', 'border-width', 'inset']);
/** Motion that should be linear: spinners, progress, marquees, tickers. */
const CONSTANT_SPEED = /spin|load|progress|marquee|ticker|scroll|loop|rotate|clock|meter/i;

export interface InventoryTransition {
  selector: string;
  interactive: boolean;
  property: string;
  durationMs: number;
  easing: string;
}

export interface InventoryAnimation {
  selector: string;
  name: string;
  durationMs: number;
  /** Clock time the animation starts moving (start time plus delay). */
  startMs: number;
  easing: string;
  properties: string[];
  infinite: boolean;
  /** Pixels of translation between first and last keyframe, when it can be read. */
  travelPx: number;
  /** The target's position in the document, so siblings with the same selector stay apart. */
  element?: number;
}

export interface MotionInventory {
  transitions: InventoryTransition[];
  animations: InventoryAnimation[];
  /** Elements moved by script (inline style changes not seen in getAnimations), with the clock time they started. */
  inferred: Array<{ selector: string; startMs: number }>;
  /** The page's motion custom properties on :root. */
  rootTokens: Record<string, string>;
}

/** In the page: the computed transitions of every element (what hover, focus and state changes will run). */
export function collectTransitions(): InventoryTransition[] {
  const describe = (el: Element): string => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length > 0) s += '.' + el.classList[0];
    return s;
  };
  const out: InventoryTransition[] = [];
  const ms = (v: string): number => (v.trim().endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000) || 0;
  const all = Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, 4000);
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!cs.transitionDuration || cs.transitionDuration === '0s') continue;
    const durations = cs.transitionDuration.split(',');
    const props = cs.transitionProperty.split(',');
    const easings = cs.transitionTimingFunction.split(/,(?![^(]*\))/);
    const interactive = el.matches('a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [tabindex]');
    props.forEach((p, i) => {
      const d = ms(durations[i % durations.length]);
      if (d <= 0) return;
      out.push({ selector: describe(el), interactive, property: p.trim(), durationMs: d, easing: easings[i % easings.length].trim() });
    });
  }
  return out;
}

/** In the page: the running animations at the current clock time. */
export function collectAnimations(): InventoryAnimation[] {
  const describe = (el: Element): string => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length > 0) s += '.' + el.classList[0];
    return s;
  };
  const translate = (t: unknown): number => {
    const m = /translate(?:3d|X|Y)?\(\s*(-?[\d.]+)px(?:\s*,\s*(-?[\d.]+)px)?/.exec(String(t ?? ''));
    if (!m) return 0;
    const isY = /translateY/.test(String(t));
    const x = isY ? 0 : Number(m[1]);
    const y = isY ? Number(m[1]) : Number(m[2] ?? 0);
    return Math.hypot(x, y);
  };
  const out: InventoryAnimation[] = [];
  const order = Array.from(document.querySelectorAll('*'));
  for (const a of document.getAnimations ? document.getAnimations() : []) {
    const effect = a.effect as KeyframeEffect | null;
    if (!effect || !effect.target) continue;
    if (a instanceof CSSTransition) continue;
    const timing = effect.getComputedTiming();
    const frames = effect.getKeyframes();
    const properties = new Set<string>();
    for (const f of frames) for (const k of Object.keys(f)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(k)) properties.add(k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));
    const frameEasing = frames.map((f) => f.easing).find((e) => e && e !== 'linear');
    const travel = frames.length > 1 ? Math.abs(translate(frames[0].transform) - translate(frames[frames.length - 1].transform)) : 0;
    const name = a instanceof CSSAnimation ? a.animationName : a.id || 'animation';
    out.push({
      selector: describe(effect.target as Element),
      name,
      durationMs: Number(timing.duration) || 0,
      startMs: Number(a.startTime ?? 0) + Number(timing.delay ?? 0),
      easing: String(effect.getTiming().easing && effect.getTiming().easing !== 'linear' ? effect.getTiming().easing : (frameEasing ?? 'linear')),
      properties: [...properties],
      infinite: timing.iterations === Infinity,
      travelPx: Math.round(travel),
      element: order.indexOf(effect.target as Element),
    });
  }
  return out;
}

/** In the page: a cheap signature of each element's inline motion state, for script-driven motion. */
export function sampleInlineMotion(): Record<string, string> {
  const out: Record<string, string> = {};
  const all = Array.from(document.body ? document.body.querySelectorAll('*') : []).slice(0, 1500);
  all.forEach((el, i) => {
    const h = el as HTMLElement;
    if (!h.style || (!h.style.transform && !h.style.opacity && !h.style.translate)) return;
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length > 0) s += '.' + el.classList[0];
    out[`${i}|${s}`] = `${h.style.transform}|${h.style.opacity}|${h.style.translate}`;
  });
  return out;
}

export const MOTION_TOKEN_NAMES = [...MOTION_CORE_NAMES, ...MOTION_VOCABULARY_NAMES, '--motion-speed', '--motion-bounce'];

/** Plays the page on the virtual clock (already installed and loaded at time 0) and returns its motion inventory. */
export async function playMotionInventory(page: Page, viewportHeight: number): Promise<MotionInventory> {
  const rootTokens = (await page.evaluate((names: string[]) => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const n of names) {
      const v = cs.getPropertyValue(n).trim();
      if (v) out[n] = v;
    }
    return out;
  }, MOTION_TOKEN_NAMES)) as Record<string, string>;
  const transitions = (await page.evaluate(collectTransitions)) as InventoryTransition[];
  const seen = new Map<string, InventoryAnimation>();
  const inferred = new Map<string, number>();
  let last = (await page.evaluate(sampleInlineMotion)) as Record<string, string>;
  const take = async (t: number): Promise<void> => {
    for (const a of (await page.evaluate(collectAnimations)) as InventoryAnimation[]) {
      const key = `${a.element ?? a.selector}|${a.name}|${a.startMs}`;
      if (!seen.has(key)) seen.set(key, a);
    }
    const now = (await page.evaluate(sampleInlineMotion)) as Record<string, string>;
    for (const [k, v] of Object.entries(now)) if (last[k] !== undefined && last[k] !== v && !inferred.has(k)) inferred.set(k, t);
    last = now;
  };
  let t = 0;
  for (; t <= MOTION_LIMITS.loadWindowMs; t += 100) {
    await page.evaluate(`window.__odClock.advanceTo(${t})`);
    await take(t);
  }
  for (let i = 1; i <= MOTION_LIMITS.scrollSteps; i++) {
    await page.evaluate(`window.scrollTo(0, ${Math.round(viewportHeight * 0.8 * i)})`);
    const end = t + MOTION_LIMITS.scrollStepMs;
    for (; t <= end; t += 100) {
      await page.evaluate(`window.__odClock.advanceTo(${t})`);
      await take(t);
    }
  }
  await page.evaluate('window.scrollTo(0, 0)');
  const animatedSelectors = new Set([...seen.values()].map((a) => a.selector));
  return {
    transitions,
    animations: [...seen.values()],
    inferred: [...inferred.entries()].map(([k, startMs]) => ({ selector: k.split('|')[1], startMs })).filter((x) => !animatedSelectors.has(x.selector)),
    rootTokens,
  };
}

const norm = (easing: string): string =>
  easing
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/-?\d*\.?\d+/g, (n) => String(Number(Number(n).toFixed(2))));

const list = (items: string[]): string => {
  const unique = [...new Set(items)];
  return unique.slice(0, 3).join(', ') + (unique.length > 3 ? ` and ${unique.length - 3} more` : '');
};

/** The vocabulary the page declares, or undefined when it declares no motion tokens (nothing to compare against). */
export function pageVocabulary(rootTokens: Record<string, string>): { durations: number[]; easings: Set<string> } | undefined {
  if (!rootTokens['--motion-fast'] && !rootTokens['--motion-base']) return undefined;
  const tokens = new Map(Object.entries(rootTokens));
  const full = withMotionVocabulary(tokens);
  const { speed } = motionDials(tokens);
  const durations: number[] = [];
  for (const [name, value] of full) {
    const ms = parseCssTimeMs(value);
    if (ms === undefined || !name.startsWith('--motion-')) continue;
    // Declared durations are written `calc(<value> * var(--motion-speed))`; derived ones already include speed.
    durations.push(ms, ms * speed);
  }
  const easings = new Set<string>(['linear']);
  for (const [name, value] of full) if (name.startsWith('--ease-')) easings.add(norm(value));
  return { durations, easings };
}

/** The motion findings for an inventory. `film` applies only the crowding and vocabulary rules. */
export function motionFindings(inv: MotionInventory, options: { film: boolean }): Finding[] {
  const findings: Finding[] = [];
  const ui = !options.film;
  if (ui) {
    const slow = inv.transitions.filter((t) => t.durationMs > MOTION_LIMITS.slowUiMs);
    if (slow.length > 0) {
      const worst = slow.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
      findings.push({ check: 'motion-slow-ui', severity: 'warning', selector: worst.selector, message: `${list(slow.map((t) => t.selector))}: ${worst.property} transition${slow.length > 1 ? 's' : ''} up to ${Math.round(worst.durationMs)}ms; UI feedback over ${MOTION_LIMITS.slowUiMs}ms feels sluggish. Use --motion-fast or --motion-base.` });
    }
    const linear = inv.transitions.filter((t) => t.easing === 'linear' && !CONSTANT_SPEED.test(t.selector));
    if (linear.length > 0) findings.push({ check: 'motion-linear-ui', severity: 'warning', selector: linear[0].selector, message: `${list(linear.map((t) => t.selector))}: linear easing on a UI transition looks mechanical. Use --ease-standard (or --ease-enter for arrivals); linear is for spinners, progress and marquees.` });
    const layoutT = inv.transitions.filter((t) => LAYOUT_PROPERTIES.has(t.property));
    const layoutA = inv.animations.filter((a) => a.properties.some((p) => LAYOUT_PROPERTIES.has(p)));
    if (layoutT.length + layoutA.length > 0) {
      const what = [...layoutT.map((t) => `${t.selector} (${t.property})`), ...layoutA.map((a) => `${a.selector} (${a.properties.filter((p) => LAYOUT_PROPERTIES.has(p)).join(', ')})`)];
      findings.push({ check: 'motion-layout-property', severity: 'warning', selector: (layoutT[0] ?? layoutA[0]).selector, message: `${list(what)}: animating layout properties makes the page re-lay out every frame and stutter. Animate transform and opacity instead.` });
    }
  }
  // Crowding: more than N distinct elements starting within the window.
  const starts = [
    ...[...new Map(inv.animations.filter((a) => !a.infinite && a.durationMs > 0).map((a) => [a.element ?? a.selector, { selector: a.selector, startMs: a.startMs, inferred: false }])).values()],
    ...inv.inferred.map((i) => ({ selector: i.selector, startMs: i.startMs, inferred: true })),
  ].sort((a, b) => a.startMs - b.startMs);
  let crowd: typeof starts = [];
  for (let i = 0; i < starts.length; i++) {
    const group = starts.filter((s) => s.startMs >= starts[i].startMs && s.startMs < starts[i].startMs + MOTION_LIMITS.crowdWindowMs);
    if (group.length > crowd.length) crowd = group;
  }
  if (crowd.length > MOTION_LIMITS.crowdCount) {
    const inferredNote = crowd.some((c) => c.inferred) ? ' (some inferred from script-driven style changes)' : '';
    findings.push({ check: 'motion-crowded', severity: 'warning', selector: crowd[0].selector, message: `${crowd.length} elements start moving within ${MOTION_LIMITS.crowdWindowMs}ms at ${(crowd[0].startMs / 1000).toFixed(2)}s${inferredNote}: ${list(crowd.map((c) => c.selector))}. Lead with one and stagger the rest by --motion-stagger, or move fewer.` });
  }
  const vocab = pageVocabulary(inv.rootTokens);
  if (vocab) {
    const near = (ms: number): boolean => vocab.durations.some((v) => Math.abs(ms - v) <= v * MOTION_LIMITS.vocabularyTolerance);
    const offDur = [...inv.transitions.map((t) => ({ selector: t.selector, ms: t.durationMs })), ...inv.animations.filter((a) => !a.infinite).map((a) => ({ selector: a.selector, ms: a.durationMs }))].filter((d) => d.ms > 0 && !near(d.ms));
    const offEase = [...inv.transitions.map((t) => ({ selector: t.selector, easing: t.easing })), ...inv.animations.map((a) => ({ selector: a.selector, easing: a.easing }))].filter((e) => !vocab.easings.has(norm(e.easing)));
    if (offDur.length > 0) findings.push({ check: 'motion-off-vocabulary', severity: 'warning', selector: offDur[0].selector, message: `Durations outside the motion vocabulary: ${list(offDur.map((d) => `${Math.round(d.ms)}ms on ${d.selector}`))}. Use the --motion-* tokens.` });
    if (offEase.length > 0) findings.push({ check: 'motion-off-vocabulary', severity: 'warning', selector: offEase[0].selector, message: `Easings outside the motion vocabulary: ${list(offEase.map((e) => `${e.easing} on ${e.selector}`))}. Use the --ease-* tokens.` });
  }
  return findings;
}

/** True when the design is a film: a video-mode skill or a `data-duration` storyboard. */
export function isFilm(html: string, sourceSkillId?: string): boolean {
  if (sourceSkillId && /(^|:)video:|hyperframes|frame-|remotion|reel|showreel/i.test(sourceSkillId)) return true;
  return /<(section|div|article)\b[^>]*\bdata-duration\s*=/i.test(html);
}

/** True when the source has any motion worth playing. */
export function hasMotionSource(html: string): boolean {
  return /\b(transition|animation)\s*:|@keyframes|requestAnimationFrame|\.animate\(|gsap|anime\(|data-duration/i.test(html);
}

/**
 * Filmstrip beats: the starts of `data-duration` frames, else the start and end times of the animations found,
 * else evenly spaced moments; at most `max`, evenly thinned, in seconds.
 */
export function filmstripBeats(input: { frameDurationsMs: number[]; animations: Array<{ startMs: number; durationMs: number; infinite: boolean }>; fallbackMs?: number }, max = 12): number[] {
  let times: number[] = [];
  const frames = input.frameDurationsMs.filter((d) => d > 0);
  if (frames.length > 0) {
    let t = 0;
    for (const d of frames) {
      times.push(t);
      t += d;
    }
    times.push(Math.max(0, t - 50));
  } else {
    for (const a of input.animations) {
      times.push(Math.max(0, a.startMs));
      if (!a.infinite && a.durationMs > 0) times.push(a.startMs + a.durationMs);
    }
  }
  times = [...new Set(times.map((t) => Math.round(t / 10) * 10))].sort((a, b) => a - b);
  if (times.length < 2) {
    const span = input.fallbackMs ?? 3000;
    times = Array.from({ length: 6 }, (_, i) => Math.round((span * i) / 5));
  }
  if (times.length > max) {
    const step = (times.length - 1) / (max - 1);
    times = Array.from({ length: max }, (_, i) => times[Math.round(i * step)]);
  }
  return times.map((t) => t / 1000);
}
