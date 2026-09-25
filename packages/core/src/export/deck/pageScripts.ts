// In-page deck scripts, adapted from upstream Open Design's
// apps/desktop/src/main/deck-capture.ts (commit 1b47e60bd466, Apache-2.0 — see
// ../../vendored/SOURCE.md). Each function is serialized by puppeteer's
// page.evaluate(fn, ...args) and run inside the artifact's page, exactly as
// upstream serializes them with executeJavaScript(fn.toString()).
//
// Divergences from upstream, all deliberate:
// - SELF-CONTAINED: upstream composes siblings by name at call time
//   (`const restoreActiveSlideCapture = ${fn.toString()}; …`). Our VS Code
//   bundle is minified, which renames those siblings and would break that
//   composition, so helpers are nested inside the function that uses them.
//   pageScripts.test.ts enforces "no free identifiers beyond browser globals".
// - Presenter-clone and selector strings are passed in as arguments (from
//   ./selectors) instead of being inlined literals.
// - prepareDeckStage also forces `loading="lazy"` images eager.
// - restackActiveSlide falls back to insertBefore/appendChild where
//   `Element.moveBefore` (Chrome 133+) is unavailable, and reports it.
// - Types are `any`: core compiles without DOM lib types, and a triple-slash
//   `lib="dom"` reference would leak DOM globals into every core module.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const window: any;
declare const requestAnimationFrame: (cb: () => void) => number;

/** Non-mutating count of real slide surfaces (presenter clones excluded). */
export function countRealSlides(slideSelector: string, cloneSelector: string): number {
  return Array.prototype.slice.call(document.querySelectorAll(slideSelector)).filter((el: any) => !el.closest(cloneSelector)).length;
}

/**
 * Deck-only DOM prep: hide presenter chrome, capture <deck-stage> at its
 * authored size (`noscale`, no transform), freeze animations/transitions so
 * each slide is captured at its final state, and load lazy images now.
 */
export function prepareDeckStage(hideSelector: string, stageSelector: string): void {
  document.querySelectorAll(hideSelector).forEach((el: any) => {
    el.style.setProperty('display', 'none', 'important');
  });
  document.querySelectorAll(stageSelector).forEach((el: any) => {
    el.setAttribute('noscale', '');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('transform-origin', 'top left', 'important');
  });
  const s = document.createElement('style');
  s.textContent =
    '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}';
  (document.head || document.documentElement).appendChild(s);
  document.querySelectorAll('img[loading="lazy"]').forEach((img: any) => {
    img.loading = 'eager';
  });
}

/** Pins html/body and the stage to the measured W×H so every slide captures deterministically. */
export function pinDeckStage(w: number, h: number, stageSelector: string): void {
  const style = document.createElement('style');
  style.textContent =
    `html,body{margin:0!important;padding:0!important;width:${w}px!important;height:${h}px!important;overflow:hidden!important}` +
    `.deck,${stageSelector}{width:${w}px!important;height:${h}px!important}`;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Measures the authored, untransformed slide box: <deck-stage> design size,
 * then declared attributes / inline style / computed / offset size, then a
 * rendered rect; force-measures the first slide if every slide is display:none.
 */
export function measureSlide(slideSelector: string, stageSelector: string, cloneSelector: string): { w: number; h: number } | null {
  function positiveCssNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && value > 1 ? value : null;
    if (typeof value !== 'string') return null;
    const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(value.trim());
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 1 ? n : null;
  }
  function sizePair(w: unknown, h: unknown): { w: number; h: number } | null {
    const width = positiveCssNumber(w);
    const height = positiveCssNumber(h);
    return width != null && height != null ? { w: width, h: height } : null;
  }
  function deckStageAuthoredSize(stage: any): { w: number; h: number } | null {
    const byProp = sizePair(stage.designWidth, stage.designHeight);
    if (byProp) return byProp;
    const byAttr = sizePair(stage.getAttribute('width'), stage.getAttribute('height'));
    if (byAttr) return byAttr;
    const byStyle = sizePair(stage.style?.width, stage.style?.height);
    if (byStyle) return byStyle;
    const computed = window.getComputedStyle?.(stage);
    const byComputed = computed ? sizePair(computed.width, computed.height) : null;
    if (byComputed) return byComputed;
    return sizePair(stage.offsetWidth, stage.offsetHeight);
  }
  function measureAuthored(el: any): { w: number; h: number } | null {
    const stage = el.closest(stageSelector);
    const stageSize = stage ? deckStageAuthoredSize(stage) : null;
    if (stageSize) return stageSize;
    const attrSize = sizePair(el.getAttribute('width'), el.getAttribute('height'));
    if (attrSize) return attrSize;
    const styleSize = sizePair(el.style?.width, el.style?.height);
    if (styleSize) return styleSize;
    const computed = window.getComputedStyle?.(el);
    const computedSize = computed ? sizePair(computed.width, computed.height) : null;
    if (computedSize) return computedSize;
    return sizePair(el.offsetWidth, el.offsetHeight);
  }

  const slides = Array.prototype.slice.call(document.querySelectorAll(slideSelector)).filter((el: any) => !el.closest(cloneSelector));
  if (slides.length === 0) return null;
  for (const node of slides) {
    const authored = measureAuthored(node);
    if (authored) return authored;
    const r = node.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) return { w: r.width, h: r.height };
  }
  const el = slides[0];
  const prev = el.style.cssText;
  el.style.setProperty('display', 'block', 'important');
  el.style.setProperty('visibility', 'hidden', 'important');
  const authored = measureAuthored(el);
  if (authored) {
    el.style.cssText = prev;
    return authored;
  }
  const rect = el.getBoundingClientRect();
  el.style.cssText = prev;
  return rect.width > 1 && rect.height > 1 ? { w: rect.width, h: rect.height } : null;
}

/**
 * Shows exactly slide `index` (hiding every other) through the conventions real
 * decks use — inline !important overrides, active-state classes, and the
 * `data-od-deck-active` attribute the <deck-stage> fallback keys on — then
 * resolves, two animation frames later, with where the slide actually landed.
 */
export function showSlide(slideSelector: string, cloneSelector: string, index: number): Promise<{ x: number; y: number; w: number; h: number } | null> {
  // Nested copy of restoreActiveSlideCapture (see file header: self-contained).
  (function restoreActiveSlideCapture(): void {
    const layer = document.getElementById('__od_export_active_slide_capture');
    if (!layer) return;
    const placeholder = document.getElementById('__od_export_active_slide_placeholder');
    const liveSlide = layer.firstElementChild?.firstElementChild;
    if (placeholder?.parentNode && liveSlide) {
      if (typeof placeholder.parentNode.moveBefore === 'function') placeholder.parentNode.moveBefore(liveSlide, placeholder);
      else placeholder.parentNode.insertBefore(liveSlide, placeholder);
      placeholder.remove();
      for (const { name, priority, value } of layer.__odSourceStyles ?? []) {
        if (value) liveSlide.style.setProperty(name, value, priority);
        else liveSlide.style.removeProperty(name);
      }
    }
    layer.remove();
  })();

  const slides = Array.prototype.slice.call(document.querySelectorAll(slideSelector)).filter((el: any) => !el.closest(cloneSelector));
  const activeClasses = ['active', 'visible', 'is-active', 'current'];
  const activeAttributes = ['data-od-deck-active'];
  slides.forEach((el: any, k: number) => {
    const on = k === index;
    el.style.setProperty('transition', 'none', 'important');
    el.style.setProperty('animation', 'none', 'important');
    el.style.setProperty('opacity', on ? '1' : '0', 'important');
    el.style.setProperty('visibility', on ? 'visible' : 'hidden', 'important');
    el.style.setProperty('pointer-events', on ? 'auto' : 'none', 'important');
    el.style.setProperty('z-index', on ? '999' : '0', 'important');
    activeClasses.forEach((c) => el.classList.toggle(c, on));
    activeAttributes.forEach((a) => el.toggleAttribute(a, on));
  });
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = slides[index];
        if (!el) return resolve(null);
        const r = el.getBoundingClientRect();
        resolve({ x: r.x, y: r.y, w: r.width, h: r.height });
      }),
    );
  });
}

/**
 * For decks that keep the active slide off-screen (a translated carousel
 * strip): moves the live slide into a fixed, stage-sized capture layer aligned
 * to its own rect. Returns false when the move had to fall back from
 * `moveBefore` (live canvas/iframe state may reset), true otherwise; undefined
 * when there's no such slide. Undone by showSlide's restore step.
 */
export function restackActiveSlide(slideSelector: string, cloneSelector: string, index: number, w: number, h: number): boolean | undefined {
  function move(parent: any, node: any, before: any): boolean {
    if (typeof parent.moveBefore === 'function') {
      parent.moveBefore(node, before);
      return true;
    }
    if (before) parent.insertBefore(node, before);
    else parent.appendChild(node);
    return false;
  }
  // Nested copy of restoreActiveSlideCapture (see file header: self-contained).
  (function restoreActiveSlideCapture(): void {
    const layer = document.getElementById('__od_export_active_slide_capture');
    if (!layer) return;
    const placeholder = document.getElementById('__od_export_active_slide_placeholder');
    const liveSlide = layer.firstElementChild?.firstElementChild;
    if (placeholder?.parentNode && liveSlide) {
      move(placeholder.parentNode, liveSlide, placeholder);
      placeholder.remove();
      for (const { name, priority, value } of layer.__odSourceStyles ?? []) {
        if (value) liveSlide.style.setProperty(name, value, priority);
        else liveSlide.style.removeProperty(name);
      }
    }
    layer.remove();
  })();

  const slides = Array.prototype.slice.call(document.querySelectorAll(slideSelector)).filter((el: any) => !el.closest(cloneSelector));
  const el = slides[index];
  if (!el) return undefined;
  const layer = document.createElement('div');
  layer.id = '__od_export_active_slide_capture';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    ['position:fixed', 'left:0', 'top:0', `width:${w}px`, `height:${h}px`, 'margin:0', 'padding:0', 'overflow:hidden', 'z-index:2147483647', 'pointer-events:none'].join(
      '!important;',
    ) + '!important';
  const offset = document.createElement('div');
  offset.style.cssText =
    ['position:absolute', 'left:0', 'top:0', `width:${w}px`, `height:${h}px`, 'transform-origin:top left'].join('!important;') + '!important';

  layer.__odSourceStyles = ['opacity', 'visibility', 'pointer-events', 'z-index'].map((name) => ({
    name,
    priority: el.style.getPropertyPriority(name),
    value: el.style.getPropertyValue(name),
  }));
  const placeholder = document.createElement('template');
  placeholder.id = '__od_export_active_slide_placeholder';
  el.before(placeholder);
  layer.appendChild(offset);
  document.body.appendChild(layer);
  el.style.setProperty('opacity', '1', 'important');
  el.style.setProperty('visibility', 'visible', 'important');
  el.style.setProperty('pointer-events', 'none', 'important');
  el.style.setProperty('z-index', '2147483647', 'important');
  const moved = move(offset, el, null);
  const liveRect = el.getBoundingClientRect();
  offset.style.setProperty('transform', `translate(${-liveRect.x}px, ${-liveRect.y}px)`, 'important');
  return moved;
}

/** Lays out every real slide at once (for a future editable-PPTX pass, which measures all slides together). */
export function showAllSlides(slideSelector: string, cloneSelector: string): number {
  const slides = Array.prototype.slice.call(document.querySelectorAll(slideSelector)).filter((el: any) => !el.closest(cloneSelector));
  for (const el of slides) {
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('position', 'absolute', 'important');
    el.style.setProperty('left', '0', 'important');
    el.style.setProperty('top', '0', 'important');
    ['active', 'visible', 'is-active', 'current'].forEach((c) => el.classList.add(c));
  }
  return slides.length;
}
