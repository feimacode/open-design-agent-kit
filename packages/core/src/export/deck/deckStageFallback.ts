// Open Design's <deck-stage> fallback custom element, ported verbatim from
// upstream packages/contracts/src/runtime/deck-stage-fallback.ts (commit
// 1b47e60bd466, Apache-2.0 — see ../../vendored/SOURCE.md). Decks authored
// against <deck-stage> but served without its runtime script get this minimal
// element (slot, show-one-slide via data-od-deck-active, noscale), so export can
// address their slides. Injected only into the served entry document, never
// written to disk.
//
// Divergences: the protocol constants from upstream's deck-protocol.ts are
// inlined below; upstream's ~900-line html-injection-points scanner (which finds
// the document's real </body> even when "</body>" appears inside a script
// string) is replaced by "before the last </body>", which is the document's own
// closing tag in any realistic artifact; and injection is skipped when the page
// already loads a deck-stage runtime (see shouldInjectDeckStageFallback).

const DECK_STAGE_OPEN_TAG_RE = /<deck-stage\b/i;
const DECK_STAGE_FALLBACK_MARKER = 'data-od-deck-stage-fallback';
const DECK_STAGE_RUNTIME_RE = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*deck-stage[^"']*\.m?js["']/i;

const DECK_PROTOCOL_VERSION = 1;
const DECK_STATE_MESSAGE_TYPE = 'od:slide-state';
const DECK_READY_MESSAGE_TYPE = 'od:deck-ready';
const DECK_PROTOCOL_V1_CAPABILITIES = ['absolute-navigation', 'state-events'];
const DECK_SLIDE_SELECTOR = ['.slide', '[data-screen-label]', '.deck-slide', '.ppt-slide', '.slide-frame'].join(', ');

const DECK_STAGE_FALLBACK_SCRIPT = `<script data-od-deck-stage-fallback>(function(){
  if (window.__odDeckStageFallbackInstalled) return;
  window.__odDeckStageFallbackInstalled = true;
  if (!window.customElements || window.customElements.get('deck-stage')) return;

  var ACTIVE_ATTR = 'data-od-deck-active';
  var SLIDE_SELECTOR = ${JSON.stringify(DECK_SLIDE_SELECTOR)};

  function numeric(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function isEditableTarget(target) {
    while (target && target !== document.body && target !== document.documentElement) {
      var tag = String(target.tagName || '').toUpperCase();
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        tag === 'A' ||
        target.isContentEditable
      ) {
        return true;
      }
      target = target.parentElement;
    }
    return false;
  }

  function postSlideState(active, count) {
    try {
      window.parent.postMessage({
        type: ${JSON.stringify(DECK_STATE_MESSAGE_TYPE)},
        protocolVersion: ${DECK_PROTOCOL_VERSION},
        active: active,
        count: count
      }, '*');
    } catch (_) {}
  }

  function postDeckReady() {
    try {
      window.parent.postMessage({
        type: ${JSON.stringify(DECK_READY_MESSAGE_TYPE)},
        protocolVersion: ${DECK_PROTOCOL_VERSION},
        capabilities: ${JSON.stringify(DECK_PROTOCOL_V1_CAPABILITIES)}
      }, '*');
    } catch (_) {}
  }

  class OdDeckStageFallback extends HTMLElement {
    constructor() {
      super();
      this._index = 0;
      this._slides = [];
      this._onMessage = this._onMessage.bind(this);
      this._onKeydown = this._onKeydown.bind(this);
      this._onResize = this.fit.bind(this);
      this._onSlotChange = this._refresh.bind(this);
      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
        ':host{position:fixed;inset:0;display:block;overflow:hidden;background:#0a0a0a;}' +
        '.stage{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;}' +
        '.canvas{position:relative;flex:none;width:var(--od-deck-stage-width,1920px);height:var(--od-deck-stage-height,1080px);transform-origin:center center;}' +
        ':host([noscale]) .canvas{transform:none!important;}' +
        '::slotted(*){visibility:hidden!important;pointer-events:none!important;}' +
        '::slotted([' + ACTIVE_ATTR + ']){visibility:visible!important;pointer-events:auto!important;}' +
        '</style><div class="stage"><div class="canvas"><slot></slot></div></div>';
      this._slot = root.querySelector('slot');
      this._canvas = root.querySelector('.canvas');
    }

    connectedCallback() {
      this._syncSize();
      postDeckReady();
      this._refresh();
      window.addEventListener('message', this._onMessage);
      window.addEventListener('resize', this._onResize);
      document.addEventListener('keydown', this._onKeydown, true);
      if (this._slot) this._slot.addEventListener('slotchange', this._onSlotChange);
      this.fit();
      setTimeout(this._onResize, 50);
      setTimeout(this._onResize, 250);
    }

    disconnectedCallback() {
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('keydown', this._onKeydown, true);
      if (this._slot) this._slot.removeEventListener('slotchange', this._onSlotChange);
    }

    attributeChangedCallback() {
      this._syncSize();
      this.fit();
    }

    static get observedAttributes() {
      return ['width', 'height', 'noscale'];
    }

    get designWidth() {
      return numeric(this.getAttribute('width'), 1920);
    }

    get designHeight() {
      return numeric(this.getAttribute('height'), 1080);
    }

    get index() {
      return this._index;
    }

    get length() {
      return this._slides.length;
    }

    _syncSize() {
      this.style.setProperty('--od-deck-stage-width', this.designWidth + 'px');
      this.style.setProperty('--od-deck-stage-height', this.designHeight + 'px');
    }

    _collectSlides() {
      var direct = [];
      var nested = Array.prototype.slice.call(this.querySelectorAll(SLIDE_SELECTOR));
      for (var i = 0; i < nested.length; i++) {
        if (nested[i].parentElement === this) direct.push(nested[i]);
      }
      this._slides = direct.length ? direct : nested;
      return this._slides;
    }

    _initialIndex(slides) {
      for (var i = 0; i < slides.length; i++) {
        var cl = slides[i].classList;
        if (cl && (cl.contains('active') || cl.contains('is-active') || cl.contains('current'))) return i;
        if (slides[i].hasAttribute(ACTIVE_ATTR)) return i;
      }
      return 0;
    }

    _refresh() {
      var slides = this._collectSlides();
      this._index = Math.max(0, Math.min(slides.length - 1, this._initialIndex(slides)));
      this._apply();
      this.fit();
    }

    _apply() {
      var slides = this._collectSlides();
      if (!slides.length) {
        postSlideState(0, 0);
        return;
      }
      this._index = Math.max(0, Math.min(slides.length - 1, this._index));
      for (var i = 0; i < slides.length; i++) {
        var on = i === this._index;
        var slide = slides[i];
        slide.toggleAttribute(ACTIVE_ATTR, on);
        slide.toggleAttribute('hidden', false);
        slide.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (slide.classList) {
          slide.classList.toggle('active', on);
          slide.classList.toggle('is-active', on);
          slide.classList.toggle('current', on);
          slide.classList.toggle('visible', on);
        }
      }
      postSlideState(this._index, slides.length);
      try {
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail: { active: this._index, count: slides.length },
          bubbles: true,
        }));
      } catch (_) {}
    }

    fit() {
      if (!this._canvas) return;
      this._syncSize();
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = '';
        return;
      }
      var width = this.designWidth;
      var height = this.designHeight;
      var rect = this.getBoundingClientRect();
      var scale = Math.min(rect.width / width, rect.height / height);
      if (!Number.isFinite(scale) || scale <= 0) return;
      this._canvas.style.transform = 'scale(' + scale + ')';
    }

    go(action, index) {
      var slides = this._collectSlides();
      if (!slides.length) return;
      if (action === 'go' && typeof index === 'number') {
        this._index = index;
      } else if (action === 'next') {
        this._index += 1;
      } else if (action === 'prev') {
        this._index -= 1;
      } else if (action === 'first') {
        this._index = 0;
      } else if (action === 'last') {
        this._index = slides.length - 1;
      }
      this._apply();
    }

    goTo(index) {
      this.go('go', index);
    }

    next() {
      this.go('next');
    }

    prev() {
      this.go('prev');
    }

    reset() {
      this.go('first');
    }

    _onMessage(ev) {
      var data = ev && ev.data;
      if (!data || data.type !== 'od:slide') return;
      if (data.protocolVersion != null && data.protocolVersion !== ${DECK_PROTOCOL_VERSION}) return;
      this.go(data.action, data.index);
    }

    _onKeydown(ev) {
      if (!ev || isEditableTarget(ev.target)) return;
      var key = ev.key;
      if (key === 'Escape') {
        try { window.parent.postMessage({ type: 'od:present-escape' }, '*'); } catch (_) {}
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
      var action = '';
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') action = 'next';
      else if (key === 'ArrowLeft' || key === 'PageUp') action = 'prev';
      else if (key === 'Home') action = 'first';
      else if (key === 'End') action = 'last';
      else if (String(key).toLowerCase() === 'r') action = 'first';
      if (!action) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.go(action);
    }
  }

  try {
    window.customElements.define('deck-stage', OdDeckStageFallback);
  } catch (_) {}
})();</script>`;

export function htmlUsesDeckStageElement(html: string): boolean {
  return DECK_STAGE_OPEN_TAG_RE.test(html);
}

/** True when the HTML uses <deck-stage>, isn't already patched, and doesn't load its own deck-stage runtime. */
export function shouldInjectDeckStageFallback(html: string): boolean {
  return htmlUsesDeckStageElement(html) && !html.includes(DECK_STAGE_FALLBACK_MARKER) && !DECK_STAGE_RUNTIME_RE.test(html);
}

export function injectDeckStageFallback(html: string): string {
  if (!shouldInjectDeckStageFallback(html)) return html;
  const at = html.toLowerCase().lastIndexOf('</body');
  if (at < 0) return html + DECK_STAGE_FALLBACK_SCRIPT;
  return html.slice(0, at) + DECK_STAGE_FALLBACK_SCRIPT + html.slice(at);
}
