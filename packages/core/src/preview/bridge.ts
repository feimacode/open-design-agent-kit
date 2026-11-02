/// <reference lib="dom" />
// The preview bridge (openspec add-preview-bridge): runs inside the previewed
// page, injected first in <head> as a preview-only script, and does for the
// artifact preview everything Comment, Edit and Figma capture need from the
// page — the preview itself never touches the page's DOM, because a served
// page has its own origin. Adapted from the same idea as open-design's
// apps/web/src/runtime/srcdoc.ts selection bridge; the DOM helpers are the
// ones the preview used directly before (dom/*.ts), unchanged.
import { captureFigmaIr } from '../figma/captureIr';
import { resolveCommentAnchor } from './dom/commentAnchors';
import { commentTextExcerpt } from '../workspace/artifactCommentTypes';
import { ensureDataOdId, htmlHintFor, selectorFor, sourceDataOdId } from './dom/elementTargeting';
import { applyPatch, PREVIEW_ONLY_ATTR, PREVIEW_SRC_ATTR, serializeDocument } from './dom/sourcePatches';
import { installStateSwitcher } from './stateSwitcher';
import { BRIDGE_TAG, isBridgeMessage, type BridgeMode, type BridgeRect, type ElementSnapshot, type FromBridge, type ToBridge, type Untagged } from './protocol';

declare global {
  interface Window {
    __odPreviewBridge?: boolean;
  }
}

const PICK_STYLE_ID = 'od-bridge-pick';

function install(): void {
  if (window.__odPreviewBridge || window.parent === window) return;
  window.__odPreviewBridge = true;

  let mode: BridgeMode = 'view';
  let hover: Element | null = null;
  let selected: Element | null = null;
  let comments: Extract<ToBridge, { type: 'set-comments' }>['comments'] = [];
  let frame = 0;
  // The states board (openspec add-states-board): restores the frames' own hidden flags before a save.
  let restoreStates: (() => void) | undefined;

  const post = (message: Untagged<FromBridge>): void => {
    window.parent.postMessage({ od: BRIDGE_TAG, ...message }, '*');
  };

  const rectOf = (el: Element): BridgeRect => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const highlightable = (el: Element | null): el is HTMLElement => {
    if (!el || !el.isConnected) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const reportRects = (): void => {
    frame = 0;
    if (mode === 'view') return;
    post({
      type: 'rects',
      hover: highlightable(hover) && hover !== selected ? rectOf(hover) : null,
      selection: highlightable(selected) ? rectOf(selected) : null,
      pins:
        mode === 'comment'
          ? comments
              .filter((c) => c.status !== 'resolved')
              .map((c) => {
                const el = resolveCommentAnchor(document, c);
                return { commentId: c.id, rect: el ? rectOf(el) : null };
              })
          : [],
    });
  };
  const scheduleRects = (): void => {
    if (!frame) frame = requestAnimationFrame(reportRects);
  };

  // Every element hit-testable while picking, with a pointer cursor: many
  // generated pages set pointer-events: none on most of the page during an
  // entrance animation, so otherwise only buttons would be pickable.
  const updatePickStyle = (): void => {
    const existing = document.getElementById(PICK_STYLE_ID);
    if (mode === 'view') {
      existing?.remove();
      return;
    }
    if (existing || !document.head) return;
    const style = document.createElement('style');
    style.id = PICK_STYLE_ID;
    style.setAttribute(PREVIEW_ONLY_ATTR, '');
    style.textContent = '* { pointer-events: auto !important; } body { cursor: pointer !important; }';
    document.head.appendChild(style);
  };

  const snapshot = (el: HTMLElement): ElementSnapshot => {
    // Read before ensureDataOdId, which may add an id only the live page has.
    const sourceElementId = sourceDataOdId(el);
    const selector = selectorFor(el);
    const htmlHint = htmlHintFor(el);
    const elementId = ensureDataOdId(el);
    const cs = getComputedStyle(el);
    const rect = rectOf(el);
    return {
      elementId,
      sourceElementId,
      selector,
      textExcerpt: commentTextExcerpt(el.textContent),
      docRect: { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      htmlHint,
      tag: el.tagName,
      childCount: el.children.length,
      text: el.textContent ?? '',
      outerHTML: el.outerHTML,
      attrs: { src: el.getAttribute(PREVIEW_SRC_ATTR) ?? el.getAttribute('src'), alt: el.getAttribute('alt'), href: el.getAttribute('href') },
      rect,
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textAlign: cs.textAlign,
        borderTopLeftRadius: cs.borderTopLeftRadius,
        opacity: cs.opacity,
        borderColor: cs.borderColor,
        borderTopWidth: cs.borderTopWidth,
        borderTopStyle: cs.borderTopStyle,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
      },
    };
  };

  // View mode: a relative link to a neighbouring file opens in its own editor
  // (the preview may be an embedded copy that can't navigate to it). An
  // embedded copy's <base> points at the design's folder, so `#hash` links
  // are scrolled here; a served page handles them natively.
  const followLink = (event: MouseEvent): void => {
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (!link) return;
    const href = (link.getAttribute('href') ?? '').trim();
    if (href.startsWith('#')) {
      if (location.href !== 'about:srcdoc') return;
      event.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      if (!id) window.scrollTo({ top: 0 });
      else (document.getElementById(id) ?? document.getElementsByName(id)[0])?.scrollIntoView();
      return;
    }
    if (!href || href.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    event.preventDefault();
    post({ type: 'open-local-link', href });
  };

  window.addEventListener(
    'click',
    (event) => {
      if (mode === 'view') {
        followLink(event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target = event.target as Element | null;
      if (!highlightable(target)) return;
      selected = target;
      hover = null;
      post({ type: 'select', element: snapshot(target) });
      scheduleRects();
    },
    true,
  );
  window.addEventListener(
    'mouseover',
    (event) => {
      if (mode === 'view') return;
      const target = event.target as Element | null;
      hover = highlightable(target) ? target : null;
      scheduleRects();
    },
    true,
  );
  document.addEventListener('mouseleave', () => {
    hover = null;
    scheduleRects();
  });
  window.addEventListener('scroll', scheduleRects, true);
  // The page's own scroll position, so a shell can restore it after reloading the page.
  let scrollTimer = 0;
  window.addEventListener('scroll', () => {
    if (scrollTimer) return;
    scrollTimer = window.setTimeout(() => {
      scrollTimer = 0;
      post({ type: 'scroll', x: window.scrollX, y: window.scrollY });
    }, 100);
  });
  window.addEventListener('resize', scheduleRects);
  const watchLayout = (): void => {
    new MutationObserver(scheduleRects).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    new ResizeObserver(scheduleRects).observe(document.documentElement);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLayout);
  else watchLayout();

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !isBridgeMessage(event.data)) return;
    const message = event.data as ToBridge;
    switch (message.type) {
      case 'hello':
        post({ type: 'ready', title: document.title });
        break;
      case 'set-mode':
        mode = message.mode;
        if (mode === 'view') {
          hover = null;
          selected = null;
        }
        updatePickStyle();
        scheduleRects();
        break;
      case 'clear-selection':
        selected = null;
        scheduleRects();
        break;
      case 'set-comments':
        comments = Array.isArray(message.comments) ? message.comments : [];
        scheduleRects();
        break;
      case 'apply-patches': {
        // Saved when any patch applied: the page's DOM already reflects it.
        let ok = false;
        try {
          for (const patch of message.patches) ok = applyPatch(document, patch) || ok;
        } catch {
          // A later patch threw; whatever already applied is still saved.
        }
        if (selected && !selected.isConnected) selected = null;
        restoreStates?.();
        post({ type: 'patched', requestId: message.requestId, ok, newSource: ok ? serializeDocument(document) : undefined });
        scheduleRects();
        break;
      }
      case 'scroll-to':
        if (Number.isFinite(message.x) && Number.isFinite(message.y)) window.scrollTo(message.x, message.y);
        break;
      case 'capture-figma': {
        const { capture, truncated } = captureFigmaIr(document, { title: document.title || 'Artifact' });
        post({ type: 'figma-capture', requestId: message.requestId, capture, truncated });
        break;
      }
    }
  });

  // Announce once the document is parsed, so `title` (and the head the pick
  // style goes into) exist; the preview also asks with `hello` on load.
  const announce = (): void => {
    updatePickStyle();
    restoreStates ??= installStateSwitcher(document);
    post({ type: 'ready', title: document.title });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce);
  else announce();
}

install();
