// In-page scripts for email and paste exports (openspec
// add-email-and-paste-export): the computed-style inliner and the email
// preflight. Serialized by puppeteer's page.evaluate(fn, ...args), so each
// function is SELF-CONTAINED (see ../poster/pageScripts.ts); types are `any`
// because core compiles without DOM lib types.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const window: any;

export interface InlineOptions {
  /** Email: repeat inherited text styles on every element that holds text (clients don't inherit reliably through tables). */
  repeatInherited: boolean;
  /** Notion: keep `class="language-…"` on <code> so code blocks keep their language. */
  keepCodeLanguage: boolean;
  /** Inline only this element (itself, not just its content), e.g. "[data-od-email]"; default the body's content. */
  rootSelector?: string;
  /** Email: keep comments, which carry Outlook's conditional comments and VML buttons. */
  keepComments?: boolean;
}

export interface InlineResult {
  /** The root's content with styles inlined: no class, style blocks, scripts or data-od-* attributes. */
  html: string;
  /** Inlined styles of the root itself (background, base text), for the wrapper. */
  rootStyle: string;
  /** Visible text, for the plain-text alternative. */
  text: string;
  links: Array<{ text: string; href: string }>;
  /** Whether rootSelector matched (false falls back to the body). */
  rootFound: boolean;
  /** Text of a [data-od-preheader] element (usually hidden), if any. */
  preheader?: string;
  warnings: string[];
}

export function inlineComputedStyles(opts: InlineOptions): InlineResult {
  const BOX = [
    'display', 'float', 'vertical-align', 'list-style-type',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-top-style', 'border-top-color',
    'border-right-width', 'border-right-style', 'border-right-color',
    'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
    'border-left-width', 'border-left-style', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'background-color', 'background-image', 'text-decoration-line', 'border-collapse', 'border-spacing',
    'position', 'transform',
  ];
  const TEXT = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'white-space'];
  const SIZES = ['width', 'height', 'max-width', 'min-width'];
  // Authored `auto` margins (centring) must stay `auto`: their computed px only fit the export's viewport.
  const AUTO_MARGINS = ['margin-left', 'margin-right'];
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'title', 'head', 'base', 'iframe', 'object', 'embed']);
  const VOID = new Set(['img', 'br', 'hr', 'input', 'col', 'wbr', 'source']);
  const TEXT_TAGS = new Set(['a', 'td', 'th', 'p', 'li', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'small', 'blockquote', 'button', 'label', 'code', 'pre']);
  const warnings: string[] = [];

  // Defaults: the same tag in a blank document.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;border:0;visibility:hidden';
  document.documentElement.appendChild(frame);
  const blank = frame.contentDocument;
  blank.open();
  blank.write('<!doctype html><html><head></head><body></body></html>');
  blank.close();
  const baseCache: Record<string, any> = {};
  const base = (tag: string): any => {
    if (baseCache[tag]) return baseCache[tag];
    const probe = blank.createElement(tag);
    // Links get their UA styles (underline, color) only with an href, like the real ones being compared.
    if (tag === 'a') probe.setAttribute('href', '#');
    blank.body.appendChild(probe);
    const cs = frame.contentWindow.getComputedStyle(probe);
    const out: Record<string, string> = {};
    for (const p of BOX.concat(TEXT)) out[p] = cs.getPropertyValue(p);
    blank.body.removeChild(probe);
    baseCache[tag] = out;
    return out;
  };

  // Authored sizes from the CSSOM (computed sizes are always resolved px, which would freeze layouts).
  const sizeRules: Array<{ selector: string; style: any }> = [];
  const collect = (rules: any): void => {
    for (const rule of Array.prototype.slice.call(rules || [])) {
      if (rule.type === 1 && rule.style && SIZES.concat(AUTO_MARGINS).some((p) => rule.style.getPropertyValue(p))) sizeRules.push({ selector: rule.selectorText, style: rule.style });
      else if (rule.type === 4 && rule.media && window.matchMedia(rule.media.mediaText).matches) collect(rule.cssRules);
    }
  };
  for (const sheet of Array.prototype.slice.call(document.styleSheets)) {
    try {
      collect(sheet.cssRules);
    } catch {
      // Cross-origin stylesheet: its rules can't be read; computed styles still apply.
    }
  }
  const authoredAutoMargins = (el: any): Record<string, boolean> => {
    const auto: Record<string, boolean> = {};
    for (const r of sizeRules) {
      let hit = false;
      try {
        hit = el.matches(r.selector);
      } catch {
        hit = false;
      }
      if (hit) for (const p of AUTO_MARGINS) if (r.style.getPropertyValue(p)) auto[p] = r.style.getPropertyValue(p) === 'auto';
    }
    for (const p of AUTO_MARGINS) if (el.style.getPropertyValue(p)) auto[p] = el.style.getPropertyValue(p) === 'auto';
    return auto;
  };
  const authoredSizes = (el: any): string[] => {
    const found: Record<string, string> = {};
    for (const r of sizeRules) {
      let hit = false;
      try {
        hit = el.matches(r.selector);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      for (const p of SIZES) {
        const v = r.style.getPropertyValue(p);
        if (v && v !== 'auto' && !/var\(/.test(v)) found[p] = v;
      }
    }
    for (const p of SIZES) {
      const v = el.style.getPropertyValue(p);
      if (v && v !== 'auto' && !/var\(/.test(v)) found[p] = v;
    }
    return Object.keys(found).map((p) => p + ':' + found[p]);
  };

  const escText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s: string): string => escText(s).replace(/"/g, '&quot;');
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    return s;
  };
  const hasOwnText = (el: any): boolean => Array.prototype.some.call(el.childNodes, (n: any) => n.nodeType === 3 && String(n.nodeValue || '').trim() !== '');

  const declarations = (el: any, cs: any, parent: any, tag: string): string[] => {
    const b = base(tag);
    const out: string[] = [];
    const autoMargins = authoredAutoMargins(el);
    for (const p of BOX) {
      if (autoMargins[p]) {
        out.push(p + ':auto');
        continue;
      }
      const v = cs.getPropertyValue(p);
      if (v === b[p]) continue;
      if (/-color$/.test(p) && p.indexOf('border') === 0) {
        const side = p.split('-')[1];
        if (Number.parseFloat(cs.getPropertyValue('border-' + side + '-width')) === 0) continue;
      }
      if (/^border-.*-style$/.test(p) && v === 'none') continue;
      if (p === 'background-image' && v === 'none') continue;
      if (p === 'position' && v === 'static') continue;
      if (p === 'text-decoration-line') {
        out.push('text-decoration:' + v);
        continue;
      }
      out.push(p + ':' + v);
    }
    const repeat = opts.repeatInherited && (hasOwnText(el) || TEXT_TAGS.has(tag));
    for (const p of TEXT) {
      const v = cs.getPropertyValue(p);
      const inherited = parent ? parent.getPropertyValue(p) : b[p];
      if (repeat ? v !== b[p] || p === 'font-family' || p === 'color' || p === 'font-size' : v !== inherited) out.push(p + ':' + v.replace(/"/g, "'"));
    }
    return out.concat(authoredSizes(el));
  };

  let pseudoWarnings = 0;
  const emit = (el: any, parent: any): string => {
    const tag = String(el.tagName || '').toLowerCase();
    if (SKIP.has(tag)) return '';
    if (tag === 'svg') return el.outerHTML;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none') return '';
    for (const pseudo of ['::before', '::after']) {
      const content = window.getComputedStyle(el, pseudo).content;
      if (content && content !== 'none' && content !== 'normal' && content !== '""' && pseudoWarnings++ < 5) {
        warnings.push(describe(el) + ' shows ' + pseudo + ' content (' + content.slice(0, 30) + '), which pasted and emailed HTML drops. Put it in the markup instead.');
      }
    }
    let attrs = '';
    for (const a of Array.prototype.slice.call(el.attributes)) {
      const name = String(a.name).toLowerCase();
      if (name === 'style' || name.indexOf('data-od-') === 0 || name.indexOf('on') === 0) continue;
      if (name === 'class') {
        if (opts.keepCodeLanguage && tag === 'code') {
          const lang = String(a.value).split(/\s+/).filter((c: string) => c.indexOf('language-') === 0);
          if (lang.length > 0) attrs += ' class="' + escAttr(lang.join(' ')) + '"';
        }
        continue;
      }
      attrs += ' ' + name + '="' + escAttr(String(a.value)) + '"';
    }
    if (tag === 'img') {
      const r = el.getBoundingClientRect();
      if (!el.hasAttribute('width') && r.width > 0) attrs += ' width="' + Math.round(r.width) + '"';
      if (!el.hasAttribute('height') && r.height > 0) attrs += ' height="' + Math.round(r.height) + '"';
    }
    const style = declarations(el, cs, parent, tag).join(';');
    const open = '<' + tag + attrs + (style ? ' style="' + escAttr(style) + '"' : '') + '>';
    if (VOID.has(tag)) return open;
    let inner = '';
    for (const child of Array.prototype.slice.call(el.childNodes)) {
      if (child.nodeType === 3) inner += escText(String(child.nodeValue || ''));
      else if (child.nodeType === 1) inner += emit(child, cs);
      else if (child.nodeType === 8 && opts.keepComments) inner += '<!--' + String(child.nodeValue || '') + '-->';
    }
    return open + inner + '</' + tag + '>';
  };

  const chosen = opts.rootSelector ? document.querySelector(opts.rootSelector) : null;
  const body = document.body;
  const bodyCs = window.getComputedStyle(body);
  let html = '';
  if (chosen) {
    html = emit(chosen, bodyCs);
  } else {
    for (const child of Array.prototype.slice.call(body.childNodes)) {
      if (child.nodeType === 3) html += escText(String(child.nodeValue || ''));
      else if (child.nodeType === 1) html += emit(child, bodyCs);
      else if (child.nodeType === 8 && opts.keepComments) html += '<!--' + String(child.nodeValue || '') + '-->';
    }
  }
  const root = chosen || body;
  // The body's own background and base text, for the wrapper around the content.
  const rootStyle = declarations(body, bodyCs, null, 'body')
    .filter((d: string) => !/^(margin|padding|display|width|height|max-width|min-width)/.test(d))
    .join(';');
  const links = Array.prototype.slice
    .call(root.querySelectorAll('a[href]'))
    .map((a: any) => ({ text: String(a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim(), href: String(a.getAttribute('href')) }));
  const pre = document.querySelector('[data-od-preheader]');
  const preheader = pre ? String(pre.textContent || '').replace(/\s+/g, ' ').trim() || undefined : undefined;
  frame.remove();
  return { html, rootStyle, text: String(root.innerText || ''), links, rootFound: !!chosen, preheader, warnings };
}

export interface EmailPageFinding {
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  selector?: string;
}

/**
 * Email preflight on the rendered page: layout that email clients drop
 * (flex, grid, absolute or fixed positioning), unsupported CSS (transforms,
 * gradients without a solid fallback), SVG, local or data: images, missing
 * alt text, and content wider than `maxWidth`.
 */
export function collectEmailFindings(opts: { maxWidth: number; hasBaseUrl: boolean; checkOnly: boolean }): EmailPageFinding[] {
  const findings: EmailPageFinding[] = [];
  const count: Record<string, number> = {};
  const add = (f: EmailPageFinding): void => {
    count[f.check] = (count[f.check] || 0) + 1;
    if (count[f.check] <= 6) findings.push(f);
    else if (count[f.check] === 7) findings.push({ check: f.check, severity: f.severity, message: '…and more ' + f.check + ' findings like the above.' });
  };
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 30 ? text.slice(0, 29) + '…' : text) + '"';
    return s;
  };
  const all = Array.prototype.slice.call(document.body ? document.body.querySelectorAll('*') : []);
  const vw = window.innerWidth;
  let widest: any = null;
  let widestWidth = 0;
  for (const el of all) {
    const tag = String(el.tagName).toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') continue;
    if (el.closest('svg') && tag !== 'svg') continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none') continue;
    const name = describe(el);
    if (/^(inline-)?(flex|grid)$/.test(cs.display) && el.children.length > 1) {
      add({ check: 'email-layout', severity: 'error', message: name + ' is laid out with ' + cs.display + ', which Outlook and many clients ignore. Use a table with role="presentation".', selector: name });
    }
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      add({ check: 'email-layout', severity: 'error', message: name + ' uses position: ' + cs.position + ', which email clients strip. Place it in the table flow.', selector: name });
    }
    if (cs.transform && cs.transform !== 'none') {
      add({ check: 'email-unsupported-css', severity: 'warning', message: name + ' uses a CSS transform, which most email clients ignore.', selector: name });
    }
    if (/gradient\(/.test(cs.backgroundImage) && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) {
      add({ check: 'email-unsupported-css', severity: 'warning', message: name + ' has a gradient background with no solid background-color fallback; Outlook shows nothing behind it.', selector: name });
    }
    if (tag === 'svg' && !el.parentElement.closest('svg')) {
      add({ check: 'email-svg', severity: 'error', message: name + ' is inline SVG, which Gmail and Outlook remove. Use a PNG image instead.', selector: name });
    }
    if (tag === 'img') {
      const src = String(el.getAttribute('src') || '');
      if (/\.svg(\?|#|$)/i.test(src)) add({ check: 'email-svg', severity: 'error', message: name + ' is an SVG image, which many clients block. Use PNG or JPEG.', selector: name });
      if (/^data:/i.test(src)) add({ check: 'email-local-image', severity: 'warning', message: name + ' is a data: image, which Gmail blocks. Host it and use a URL.', selector: name });
      else if (src && !/^(https?:|cid:)/i.test(src) && !opts.hasBaseUrl) {
        add({
          check: 'email-local-image',
          severity: opts.checkOnly ? 'info' : 'error',
          message: name + ' (' + src + ') is a local file. Recipients can\'t load it: host the images and export with baseUrl so they become absolute URLs.',
          selector: name,
        });
      }
      if (!el.hasAttribute('alt')) add({ check: 'email-missing-alt', severity: 'warning', message: name + ' (' + src + ') has no alt text, shown when images are blocked. Add alt="" if it is decorative.', selector: name });
    }
    // Wider than an email column: skip full-bleed wrappers (as wide as the viewport) unless they hold text themselves.
    const w = el.getBoundingClientRect().width;
    const ownText = Array.prototype.some.call(el.childNodes, (n: any) => n.nodeType === 3 && String(n.nodeValue || '').trim() !== '');
    if (w > opts.maxWidth + 1 && (w < vw - 2 || ownText) && w > widestWidth) {
      widestWidth = w;
      widest = el;
    }
  }
  if (widest) {
    add({ check: 'email-width', severity: 'warning', message: describe(widest) + ' is ' + Math.round(widestWidth) + 'px wide; keep email content within ' + opts.maxWidth + 'px so it fits reading panes and phones.', selector: describe(widest) });
  }
  return findings;
}
