// Motion as the visitor sees it (openspec add-runtime-motion): before the
// extraction freezes animations to measure, it records what
// document.getAnimations() reports during load, a real pointer hover and a
// keyboard focus on the primary control and the first card, and the scroll
// pass. Script-driven motion (Web Animations from GSAP, Framer Motion) shows
// up there too, where declared transitions don't.

import type { Page } from 'puppeteer-core';
import type { BrandMotion, MotionChange } from './brandKit';

/** One animation seen in the page. */
export interface ObservedAnimation {
  trigger: 'load' | 'hover' | 'focus' | 'scroll';
  /** button, card, link, input, hero, section or other. */
  role: string;
  selector: string;
  props: string[];
  /** Start and end values of the animated properties, where the keyframes give them. */
  from: Record<string, string>;
  to: Record<string, string>;
  /** ms */
  duration: number;
  delay: number;
  easing: string;
  /** ms since navigation, when first seen. */
  at: number;
}

export interface MotionObservation {
  animations: ObservedAnimation[];
  library?: string;
  reducedMotion?: boolean;
}

/**
 * Installed before the page's own scripts (evaluateOnNewDocument): polls
 * document.getAnimations() every 40 ms and keeps each animation once, tagged
 * with the current trigger (window.__odMotion.trigger, set from Node).
 */
export const MOTION_RECORDER = `(() => {
  if (window.__odMotion) return;
  const rec = (window.__odMotion = { trigger: 'load', list: [] });
  const seen = new WeakSet();
  const roleOf = (el) => {
    for (let e = el, depth = 0; e && e !== document.body && depth < 4; e = e.parentElement, depth++) {
      const tag = e.tagName.toLowerCase();
      const cls = (typeof e.className === 'string' ? e.className : '') + ' ' + (e.getAttribute('role') || '');
      if (tag === 'button' || /\\bbtn|button|cta\\b/i.test(cls) || (tag === 'input' && /submit|button/.test(e.type))) return 'button';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
      if (/card|tile|panel/i.test(cls) || tag === 'article') return 'card';
      if (/hero/i.test(cls)) return 'hero';
      if (tag === 'a') return 'link';
      if (tag === 'section') return 'section';
    }
    return 'other';
  };
  const sel = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id;
    const cls = Array.from(el.classList || []).filter((c) => /^[A-Za-z_][\\w-]*$/.test(c) && c.length < 40).slice(0, 2);
    return tag + cls.map((c) => '.' + c).join('');
  };
  const SKIP = ['offset', 'easing', 'composite', 'computedOffset'];
  const tick = () => {
    let list;
    try { list = document.getAnimations(); } catch (e) { return; }
    for (const a of list) {
      if (seen.has(a)) continue;
      seen.add(a);
      try {
        const eff = a.effect;
        const target = eff && eff.target;
        if (!target || !target.tagName) continue;
        const timing = eff.getComputedTiming ? eff.getComputedTiming() : {};
        const declared = eff.getTiming ? eff.getTiming() : {};
        let frames = [];
        try { frames = eff.getKeyframes(); } catch (e) {}
        const props = a.transitionProperty ? [a.transitionProperty] : Array.from(new Set(frames.flatMap((f) => Object.keys(f).filter((k) => SKIP.indexOf(k) < 0))));
        const from = {}, to = {};
        const firstFrame = frames[0] || {}, lastFrame = frames[frames.length - 1] || {};
        for (const p of props) {
          const k = p.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
          if (firstFrame[k] !== undefined) from[p] = String(firstFrame[k]);
          if (lastFrame[k] !== undefined) to[p] = String(lastFrame[k]);
        }
        const easing = (declared.easing && declared.easing !== 'linear' ? declared.easing : (firstFrame.easing && firstFrame.easing !== 'linear' ? firstFrame.easing : declared.easing)) || 'linear';
        rec.list.push({ trigger: rec.trigger, role: roleOf(target), selector: sel(target), props, from, to, duration: Number(timing.duration) || 0, delay: Number(declared.delay) || 0, easing, at: Math.round(performance.now()) });
      } catch (e) {}
    }
  };
  setInterval(tick, 40);
  document.addEventListener('transitionrun', tick, true);
  document.addEventListener('animationstart', tick, true);
})();`;

/** In-page, as source: marks the primary control and the first card to hover and focus. */
const MARK_TARGETS = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 8 && r.height > 8 && r.top >= 0 && r.bottom <= innerHeight && s.visibility !== 'hidden' && s.display !== 'none'; };
  const filled = (el) => { const c = getComputedStyle(el).backgroundColor; return c && c !== 'transparent' && !/rgba\\([^)]*,\\s*0\\)$/.test(c); };
  const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [class*="btn" i], [class*="button" i], input[type="submit"]')).filter((el) => visible(el) && (filled(el) || getComputedStyle(el).backgroundImage !== 'none'));
  const primary = buttons.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (primary) primary.setAttribute('data-od-motion', 'primary');
  const card = Array.from(document.querySelectorAll('[class*="card" i], article, [class*="tile" i]')).find((el) => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 80 && r.top >= 0 && r.bottom <= innerHeight; });
  if (card) card.setAttribute('data-od-motion', 'card');
  return { primary: !!primary, card: !!card };
})()`;

const LIBRARY = `(() => {
  const w = window;
  if (w.gsap || w.TweenMax || w.ScrollTrigger) return 'gsap';
  if (document.querySelector('[data-framer-name], [data-framer-component-type], [data-projection-id]') || w.Framer) return 'framer-motion';
  if (w.Motion || w.motion) return 'motion';
  if (w.AOS || document.querySelector('[data-aos]')) return 'aos';
  if (w.ScrollReveal || w.sr) return 'scrollreveal';
  if (w.Lenis || w.lenis || document.documentElement.classList.contains('lenis')) return 'lenis';
  if (w.anime) return 'anime.js';
  if (w.lottie || w.bodymovin || document.querySelector('lottie-player, dotlottie-player')) return 'lottie';
  if (w.LocomotiveScroll || document.querySelector('[data-scroll-container]')) return 'locomotive-scroll';
  return undefined;
})()`;

const setTrigger = (page: Page, trigger: ObservedAnimation['trigger']) => page.evaluate(`window.__odMotion && (window.__odMotion.trigger = ${JSON.stringify(trigger)})`).catch(() => undefined);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hover and focus the primary control and the first card with a real pointer and keyboard focus. Leaves the trigger at scroll. */
export async function observeInteractions(page: Page): Promise<void> {
  const marked = (await page.evaluate(MARK_TARGETS).catch(() => ({ primary: false, card: false }))) as { primary: boolean; card: boolean };
  await setTrigger(page, 'hover');
  for (const which of ['primary', 'card'] as const) {
    if (!marked[which]) continue;
    await page.hover(`[data-od-motion="${which}"]`).catch(() => undefined);
    await wait(450);
    await page.mouse.move(2, 2).catch(() => undefined);
    await wait(250);
  }
  if (marked.primary) {
    await setTrigger(page, 'focus');
    // Keyboard focus, so :focus-visible styles apply: focus the element before it, then Tab.
    await page
      .evaluate(() => {
        const el = document.querySelector('[data-od-motion="primary"]') as HTMLElement | null;
        el?.setAttribute('tabindex', el.getAttribute('tabindex') ?? '0');
        el?.blur();
      })
      .catch(() => undefined);
    await page.focus('[data-od-motion="primary"]').catch(() => undefined);
    await page.keyboard.press('Shift').catch(() => undefined);
    await wait(400);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => undefined);
    await wait(150);
  }
  // Hovering scrolls a target into view if it had to; start the scroll pass from the top.
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  await wait(100);
  await setTrigger(page, 'scroll');
}

/** The animations recorded so far, and the motion library. */
export async function readObservedMotion(page: Page): Promise<MotionObservation> {
  const list = ((await page.evaluate('window.__odMotion ? window.__odMotion.list : []').catch(() => [])) as ObservedAnimation[]).filter((a) => a.duration > 0);
  const library = (await page.evaluate(LIBRARY).catch(() => undefined)) as string | undefined;
  return { animations: list.slice(0, 400), library: library || undefined };
}

/** Whether something animated on load or on scroll, so reduced motion is worth testing. */
export const movesOnLoadOrScroll = (o: MotionObservation): boolean => o.animations.some((a) => (a.trigger === 'load' || a.trigger === 'scroll') && a.duration >= 50);

/** Reloads with prefers-reduced-motion: reduce and counts load and scroll animations; true when at most a third still run. Leaves the page reloaded with motion back on. */
export async function honoursReducedMotion(page: Page, url: string, before: MotionObservation, goto: (page: Page, url: string) => Promise<void>, scroll: (page: Page) => Promise<void>): Promise<boolean | undefined> {
  const count = (list: ObservedAnimation[]) => list.filter((a) => (a.trigger === 'load' || a.trigger === 'scroll') && a.duration >= 50).length;
  const had = count(before.animations);
  if (had === 0) return undefined;
  try {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await goto(page, url);
    await wait(800);
    await setTrigger(page, 'scroll');
    await scroll(page);
    const after = (await readObservedMotion(page)).animations;
    return count(after) <= had / 3;
  } catch {
    return undefined;
  } finally {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]).catch(() => undefined);
  }
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor((s.length - 1) / 2)];
};

/** translateY / translateX / scale out of a transform value (translate(), matrix()). */
function transformParts(v: string | undefined): { x: number; y: number; scale: number } {
  if (!v || v === 'none') return { x: 0, y: 0, scale: 1 };
  const m = /matrix\(([^)]+)\)/.exec(v);
  if (m) {
    const p = m[1].split(',').map(Number);
    return { x: p[4] || 0, y: p[5] || 0, scale: Math.hypot(p[0], p[1]) || 1 };
  }
  const ty = /translateY\(\s*(-?[\d.]+)px/.exec(v) ?? /translate3d\(\s*-?[\d.]+px\s*,\s*(-?[\d.]+)px/.exec(v) ?? /translate\(\s*-?[\d.]+px\s*,\s*(-?[\d.]+)px/.exec(v);
  const tx = /translateX\(\s*(-?[\d.]+)px/.exec(v) ?? /translate(?:3d)?\(\s*(-?[\d.]+)px/.exec(v);
  const sc = /scale\(\s*([\d.]+)/.exec(v);
  return { x: tx ? Number(tx[1]) : 0, y: ty ? Number(ty[1]) : 0, scale: sc ? Number(sc[1]) : 1 };
}

function changesOf(list: ObservedAnimation[]): MotionChange[] {
  const byTarget = new Map<string, ObservedAnimation[]>();
  for (const a of list) byTarget.set(a.role, [...(byTarget.get(a.role) ?? []), a]);
  return [...byTarget].map(([target, anims]) => {
    const changes = [...new Set(anims.flatMap((a) => a.props.map((p) => (a.from[p] !== undefined && a.to[p] !== undefined && a.from[p] !== a.to[p] ? `${p}: ${a.from[p]} → ${a.to[p]}` : p))))].slice(0, 6);
    return { target, changes, duration: Math.round(median(anims.map((a) => a.duration))), easing: mostCommon(anims.map((a) => a.easing)) };
  });
}

function mostCommon(xs: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** The brand kit's motion entry from the observations. */
export function summariseMotion(o: MotionObservation): BrandMotion {
  const of = (t: ObservedAnimation['trigger']) => o.animations.filter((a) => a.trigger === t && a.duration >= 30);
  const hover = changesOf(of('hover'));
  const focus = changesOf(of('focus'));
  const load = of('load');
  // Entrance: opacity or transform animations that run as content scrolls in (or on load below the hero).
  const entering = of('scroll').filter((a) => a.props.some((p) => /opacity|transform|translate|scale/.test(p)));
  let entrance: BrandMotion['entrance'] = 'none';
  if (entering.length > 0) {
    const moving = entering.filter((a) => a.from.transform !== undefined || a.from.translate !== undefined || a.from.scale !== undefined);
    const fromT = (moving.length > 0 ? moving : entering).map((a) => transformParts(a.from.transform ?? a.from.translate ?? (a.from.scale ? `scale(${a.from.scale})` : undefined)));
    const dy = median(fromT.map((t) => Math.abs(t.y)));
    const dx = median(fromT.map((t) => Math.abs(t.x)));
    const scaled = fromT.some((t) => Math.abs(t.scale - 1) > 0.02);
    const fades = entering.some((a) => a.from.opacity !== undefined && Number(a.from.opacity) < 0.95);
    const kind = dy >= 4 ? 'rise' : dx >= 4 ? 'slide' : scaled ? 'scale' : fades ? 'fade' : 'fade';
    // Stagger: siblings with the same duration that start at even offsets (their delays, else when they were first seen).
    const delays = [...new Set(entering.map((a) => a.delay))].sort((a, b) => a - b);
    const steps = delays.slice(1).map((d, i) => d - delays[i]).filter((d) => d > 0);
    const stagger = steps.length > 0 ? Math.round(median(steps)) : undefined;
    entrance = {
      kind,
      distance: kind === 'rise' ? Math.round(dy) : kind === 'slide' ? Math.round(dx) : undefined,
      duration: Math.round(median(entering.map((a) => a.duration))),
      stagger,
      easing: mostCommon(entering.map((a) => a.easing)),
      targets: [...new Set(entering.map((a) => a.role))],
    };
  }
  return {
    hover: hover.length > 0 ? hover : 'none',
    focus: focus.length > 0 ? focus : 'none',
    entrance,
    load: load.length > 0 ? { duration: Math.round(Math.max(...load.map((a) => a.duration + a.delay))), targets: [...new Set(load.map((a) => a.role))] } : 'none',
    library: o.library,
    reducedMotion: o.reducedMotion,
  };
}

/** Motion tokens from what moved: fast from hover and focus, base from other state changes, easing the most common observed. Undefined when nothing moved. */
export function observedMotionTokens(o: MotionObservation | undefined): { fast?: string; base?: string; ease?: string; fastFrom?: string; baseFrom?: string } | undefined {
  const list = (o?.animations ?? []).filter((a) => a.duration >= 30);
  if (list.length === 0) return undefined;
  const interactive = list.filter((a) => a.trigger === 'hover' || a.trigger === 'focus');
  const other = list.filter((a) => a.trigger !== 'hover' && a.trigger !== 'focus');
  const fast = interactive.length > 0 ? Math.round(median(interactive.map((a) => a.duration))) : undefined;
  const otherDurations = other.map((a) => Math.round(a.duration)).filter((d) => d !== fast);
  const base = otherDurations.length > 0 ? Math.round(median(otherDurations)) : undefined;
  const ease = mostCommon(list.map((a) => a.easing).filter((e) => e && e !== 'linear')) ?? mostCommon(list.map((a) => a.easing));
  const where = (xs: ObservedAnimation[]) => (xs[0] ? `${xs[0].trigger} on ${xs[0].selector}` : undefined);
  return { fast: fast !== undefined ? `${fast}ms` : undefined, base: base !== undefined ? `${base}ms` : undefined, ease, fastFrom: where(interactive), baseFrom: where(other) };
}
