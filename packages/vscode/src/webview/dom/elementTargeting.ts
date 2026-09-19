// Adapted (not ported verbatim — see openspec design notes) from
// open-design's apps/web/src/edit-mode/bridge.ts. Upstream needs a
// postMessage bridge because its preview iframe is genuinely cross-origin
// in the deployed app; here the preview iframe is `srcdoc`-rendered with
// `allow-same-origin`, so `iframe.contentDocument` is directly queryable
// from this outer script — no injected in-iframe bridge script needed.

export function findElementByDataOdId(doc: Document, id: string): Element | null {
  return doc.querySelector(`[data-od-id="${cssEscape(id)}"]`);
}

export function ensureDataOdId(el: Element): string {
  let id = el.getAttribute('data-od-id');
  if (!id) {
    id = `auto-${Math.random().toString(36).slice(2, 10)}`;
    el.setAttribute('data-od-id', id);
  }
  return id;
}

export function cssSelectorFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeName.toLowerCase() !== 'html') {
    let selector = node.nodeName.toLowerCase();
    if (node.id) {
      parts.unshift(`${selector}#${node.id}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.nodeName === node!.nodeName);
      const idx = siblings.indexOf(node) + 1;
      selector += `:nth-of-type(${idx})`;
    }
    parts.unshift(selector);
    node = parent;
  }
  return parts.join(' > ');
}

export function findElementBySelector(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

export function htmlHintFor(el: Element): string {
  const clone = el.cloneNode(false) as Element;
  const opening = clone.outerHTML.split('>')[0] + '>';
  return opening.length > 200 ? `${opening.slice(0, 200)}…` : opening;
}
