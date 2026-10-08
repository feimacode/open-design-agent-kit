// In-page scripts for posters: preflight measurement, per-row data binding
// and print isolation. Serialized by puppeteer's page.evaluate(fn, ...args),
// so each function is SELF-CONTAINED: helpers are nested, and only browser
// globals are referenced (pageScripts.test.ts enforces it, including after
// esbuild minification, as for ../export/deck/pageScripts.ts). Types are
// `any` because core compiles without DOM lib types.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const window: any;
declare const getComputedStyle: (el: any) => any;
declare const Image: any;

export interface PagePreflightOptions {
  cardSelector: string;
  print: boolean;
  /** Card-edge bleed in CSS px (0 for screen). */
  bleedPx: number;
  /** Safe margin inside the trim, CSS px. */
  safeInsetPx: number;
  /** Print: minimum readable size in pt. */
  minTypePt?: number;
  /** Screen: minimum text size in CSS px. */
  minTypePx?: number;
}

export interface PageFinding {
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  selector?: string;
  card?: number;
}

/** Measures every card on the page and returns raw findings (QR decoding and bleed-box size are checked in Node). */
export async function collectPreflight(opts: PagePreflightOptions): Promise<PageFinding[]> {
  const findings: PageFinding[] = [];
  const cardEls = Array.prototype.slice.call(document.querySelectorAll(opts.cardSelector));
  const cards = cardEls.length > 0 ? cardEls : [document.body];
  const multi = cards.length > 1;
  const emoji = /\p{Extended_Pictographic}/u;

  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const field = el.getAttribute && el.getAttribute('data-od-field');
    if (field) s += '[data-od-field="' + field + '"]';
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const parseColor = (value: string): any => {
    const m = /rgba?\(([^)]+)\)/.exec(String(value || ''));
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const luminance = (c: any): number => {
    const ch = [c.r, c.g, c.b].map((v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const outside = (r: any, box: any, tol: number): boolean =>
    r.left < box.left - tol || r.top < box.top - tol || r.right > box.right + tol || r.bottom > box.bottom + tol;
  const inset = (box: any, d: number): any => ({ left: box.left + d, top: box.top + d, right: box.right - d, bottom: box.bottom - d });
  const area = (r: any): number => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    const cardNo = multi ? ci + 1 : undefined;
    const add = (f: PageFinding): void => {
      if (cardNo !== undefined) f.card = cardNo;
      findings.push(f);
    };
    const box = card.getBoundingClientRect();
    const trim = inset(box, opts.bleedPx);
    const safe = inset(box, opts.bleedPx + opts.safeInsetPx);

    // ---- Text, grouped by its parent element ----
    const byElement = new Map();
    const walker = document.createTreeWalker(card, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = String(node.nodeValue || '');
      if (!text.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest('script,style,noscript,template')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      const lines = Array.prototype.slice.call(range.getClientRects()).filter((lr: any) => lr.width > 0.5 && lr.height > 0.5);
      const prev = byElement.get(el);
      if (prev) {
        prev.rect = { left: Math.min(prev.rect.left, r.left), top: Math.min(prev.rect.top, r.top), right: Math.max(prev.rect.right, r.right), bottom: Math.max(prev.rect.bottom, r.bottom) };
        prev.text += text;
        prev.lines = prev.lines.concat(lines);
      } else byElement.set(el, { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, text, lines });
    }

    let contrastSkipped = 0;
    byElement.forEach((entry: any, el: any) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
      const r = entry.rect;
      const name = describe(el);

      // overflow: clipped by an ancestor (up to and including the card), or outside the card.
      let clipped = false;
      for (let a = el; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        // Only hidden/clip cut text off; a scroll container (auto/scroll) lets it be scrolled into view.
        if (acs.overflowX === 'hidden' || acs.overflowX === 'clip' || acs.overflowY === 'hidden' || acs.overflowY === 'clip') {
          if (outside(r, a.getBoundingClientRect(), 1)) {
            clipped = true;
            add({ check: 'overflow', severity: 'error', message: name + (a === card ? ' runs past the edge of the card and is cut off.' : ' is clipped by its container ' + describe(a).split(' "')[0] + ' — the text is longer than its box.'), selector: name });
            break;
          }
        }
        if (a === card) break;
      }
      if (!clipped && outside(r, box, 1)) add({ check: 'overflow', severity: 'error', message: name + ' extends outside the card.', selector: name });

      // safe-area
      if (!clipped && !outside(r, box, 1)) {
        if (opts.bleedPx > 0 && outside(r, trim, 0.5)) {
          add({ check: 'safe-area', severity: 'error', message: name + ' is inside the bleed and will be cut off when the print is trimmed.', selector: name });
        } else if (outside(r, safe, 0.5)) {
          add({ check: 'safe-area', severity: 'warning', message: name + ' is outside the safe area (keep text ' + Math.round(opts.safeInsetPx) + 'px' + (opts.bleedPx > 0 ? ' inside the trim' : ' from the edge') + ').', selector: name });
        }
      }

      // min-type
      const px = parseFloat(cs.fontSize) || 0;
      if (opts.print && opts.minTypePt !== undefined && px * 0.75 < opts.minTypePt - 0.05) {
        add({ check: 'min-type', severity: 'warning', message: name + ' is ' + Math.round(px * 0.75 * 10) / 10 + 'pt; text on this size should be at least ' + opts.minTypePt + 'pt to be read.', selector: name });
      } else if (!opts.print && opts.minTypePx !== undefined && px < opts.minTypePx - 0.05) {
        add({ check: 'min-type', severity: 'warning', message: name + ' is ' + Math.round(px * 10) / 10 + 'px; at this canvas size text under ' + Math.round(opts.minTypePx) + 'px is hard to read in a feed.', selector: name });
      }

      // contrast against the nearest solid background
      let bg: any = null;
      let skipped = false;
      for (let a = el; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.backgroundImage && acs.backgroundImage !== 'none') {
          skipped = true;
          break;
        }
        const c = parseColor(acs.backgroundColor);
        if (c && c.a >= 0.99) {
          bg = c;
          break;
        }
        if (c && c.a > 0.01) {
          skipped = true;
          break;
        }
      }
      if (skipped) contrastSkipped++;
      else {
        if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
        const fg0 = parseColor(cs.color);
        if (fg0) {
          const fg = { r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a) };
          const l1 = luminance(fg);
          const l2 = luminance(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
          const need = large ? 3 : 4.5;
          if (ratio < need) {
            add({ check: 'contrast', severity: 'warning', message: name + ' has a contrast ratio of ' + Math.round(ratio * 100) / 100 + ':1 against its background (needs ' + need + ':1 for ' + (large ? 'large' : 'body') + ' text).', selector: name });
          }
        }
      }

      if (emoji.test(entry.text)) {
        add({ check: 'emoji', severity: 'warning', message: name + ' contains emoji, which render from the exporting machine\'s fonts and can come out as empty boxes. Use inline SVG instead.', selector: name });
      }
    });
    // overlap: lines of text from two unrelated elements drawn on top of each other (long bound values are the usual cause).
    const entries: any[] = [];
    byElement.forEach((entry: any, el: any) => entries.push({ el, lines: entry.lines }));
    const reported = new Set();
    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        const A = entries[a];
        const B = entries[b];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        let hit = false;
        for (const ra of A.lines) {
          for (const rb of B.lines) {
            // A line's rect spans the font's full ascent and descent; compare the middle band, where glyphs actually sit,
            // so tightly set lines (line-height < 1) don't count as overlapping.
            const ia = ra.height * 0.2;
            const ib = rb.height * 0.2;
            const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const h = Math.min(ra.bottom - ia, rb.bottom - ib) - Math.max(ra.top + ia, rb.top + ib);
            if (w > 2 && h > 1) hit = true;
            if (hit) break;
          }
          if (hit) break;
        }
        const key = describe(A.el) + '|' + describe(B.el);
        if (hit && !reported.has(key)) {
          reported.add(key);
          add({ check: 'overlap', severity: 'warning', message: describe(A.el) + ' overlaps ' + describe(B.el) + '.', selector: describe(A.el) });
        }
      }
    }

    if (contrastSkipped > 0) {
      add({ check: 'contrast', severity: 'info', message: 'Contrast not checked for ' + contrastSkipped + ' text element(s) on gradient, image or translucent backgrounds — check those by eye.' });
    }

    // ---- Images, SVG graphics and QR codes ----
    const cardArea = area(box);
    const graphics = Array.prototype.slice.call(card.querySelectorAll('img, svg, [data-od-qr]')).filter((el: any) => {
      if (el.tagName && String(el.tagName).toLowerCase() === 'svg' && el.parentElement && el.parentElement.closest('svg')) return false;
      return !(el.tagName && String(el.tagName).toLowerCase() === 'svg' && el.closest('[data-od-qr]') && !el.hasAttribute('data-od-qr'));
    });
    const seenQr = new Set();
    for (const el of graphics) {
      const isQr = el.hasAttribute('data-od-qr') || !!el.closest('[data-od-qr]');
      const host = isQr ? el.closest('[data-od-qr]') || el : el;
      if (isQr) {
        if (seenQr.has(host)) continue;
        seenQr.add(host);
      }
      const r = host.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const bleeds = outside(r, box, 0.5);
      const decorative = !isQr && (bleeds || area(r) >= 0.5 * cardArea);
      if (decorative) continue;
      const name = isQr ? 'QR code' + (host.getAttribute('data-od-qr') ? ' (' + host.getAttribute('data-od-qr') + ')' : '') : describe(host);
      if (opts.bleedPx > 0 && outside(r, trim, 0.5)) {
        add({ check: 'safe-area', severity: 'error', message: name + ' reaches into the bleed and will be cut when the print is trimmed.', selector: name });
      } else if (outside(r, safe, 0.5)) {
        add({ check: 'safe-area', severity: isQr ? 'error' : 'warning', message: name + ' is outside the safe area' + (isQr ? ' — a QR code that is cut or too close to the edge may not scan.' : '.'), selector: name });
      }
    }

    // ---- Effective resolution of raster images (print) ----
    if (opts.print) {
      const ppiFinding = (name: string, ppi: number): void => {
        if (ppi < 100) add({ check: 'image-ppi', severity: 'error', message: name + ' prints at about ' + Math.round(ppi) + ' ppi and will look blurry; use an image at least ' + Math.ceil(150 / ppi * 100) / 100 + '× larger (150 ppi minimum, 300 ideal).', selector: name });
        else if (ppi < 150) add({ check: 'image-ppi', severity: 'warning', message: name + ' prints at about ' + Math.round(ppi) + ' ppi; 150 ppi is the minimum for print, 300 ideal.', selector: name });
      };
      for (const img of Array.prototype.slice.call(card.querySelectorAll('img'))) {
        const r = img.getBoundingClientRect();
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh || r.width < 1 || r.height < 1 || /\.svg(\?|#|$)/i.test(String(img.currentSrc || img.src || ''))) continue;
        const fit = getComputedStyle(img).objectFit;
        const sx = nw / r.width;
        const sy = nh / r.height;
        ppiFinding(describe(img), 96 * (fit === 'contain' || fit === 'scale-down' ? Math.max(sx, sy) : Math.min(sx, sy)));
      }
      const withBg = [card].concat(Array.prototype.slice.call(card.querySelectorAll('*')));
      for (const el of withBg) {
        const bgImage = getComputedStyle(el).backgroundImage;
        const m = /url\(["']?([^"')]+)["']?\)/.exec(String(bgImage || ''));
        if (!m || /\.svg(\?|#|$)/i.test(m[1]) || /^data:image\/svg/i.test(m[1])) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const probe = new Image();
        probe.src = m[1];
        try {
          await probe.decode();
        } catch (e) {
          continue;
        }
        const nw = probe.naturalWidth;
        const nh = probe.naturalHeight;
        if (!nw || !nh) continue;
        const size = String(getComputedStyle(el).backgroundSize || 'auto');
        const sx = nw / r.width;
        const sy = nh / r.height;
        const ppi = size === 'cover' ? 96 * Math.min(sx, sy) : size === 'contain' ? 96 * Math.max(sx, sy) : 96;
        ppiFinding('background image of ' + describe(el).split(' "')[0], ppi);
      }
    }
  }
  return findings;
}

/**
 * Fills `[data-od-field]` (text, or `src` on img / `href` on a) and
 * `[data-od-qr-field]` (QR SVG markup) from one row, then waits for images
 * and fonts. Returns the number of elements bound.
 */
export async function bindRow(values: Record<string, string>, qrSvgs: Record<string, string>): Promise<number> {
  let bound = 0;
  const pending: any[] = [];
  Array.prototype.slice.call(document.querySelectorAll('[data-od-field]')).forEach((el: any) => {
    const key = el.getAttribute('data-od-field');
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    const value = values[key];
    const tag = String(el.tagName).toLowerCase();
    if (tag === 'img') {
      el.setAttribute('src', value);
      el.removeAttribute('srcset');
      el.setAttribute('loading', 'eager');
      if (el.decode) pending.push(el.decode().catch(() => undefined));
    } else if (tag === 'a') el.setAttribute('href', value);
    else {
      // Line breaks in a cell become <br>, as a designer would set them.
      el.textContent = '';
      String(value).split(/\r?\n/).forEach((line: string, i: number) => {
        if (i > 0) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(line));
      });
    }
    bound++;
  });
  Array.prototype.slice.call(document.querySelectorAll('[data-od-qr-field]')).forEach((el: any) => {
    const key = el.getAttribute('data-od-qr-field');
    if (!Object.prototype.hasOwnProperty.call(qrSvgs, key)) return;
    el.innerHTML = qrSvgs[key];
    el.setAttribute('data-od-qr', values[key] || '');
    bound++;
  });
  if (document.fonts && document.fonts.ready) pending.push(document.fonts.ready);
  await Promise.all(pending);
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  return bound;
}

/**
 * Print isolation: leaves only the first card on the page, at the top-left
 * corner, with nothing around it, and sets the @page size. Hides the card's
 * siblings along its ancestor chain instead of moving it, so selectors that
 * depend on its ancestors keep matching. Returns false when there's no card.
 */
export function isolateCardForPrint(cardSelector: string, pageWidthMm: number, pageHeightMm: number): boolean {
  const card = document.querySelector(cardSelector);
  if (!card) return false;
  for (let node = card; node && node !== document.documentElement; node = node.parentElement) {
    const parent = node.parentElement;
    if (parent) {
      Array.prototype.slice.call(parent.children).forEach((sib: any) => {
        if (sib !== node && String(sib.tagName).toLowerCase() !== 'style' && String(sib.tagName).toLowerCase() !== 'script') {
          sib.style.setProperty('display', 'none', 'important');
        }
      });
    }
    if (node !== card) {
      const s = node.style;
      ['margin', 'padding', 'border', 'gap'].forEach((p) => s.setProperty(p, '0', 'important'));
      s.setProperty('display', 'block', 'important');
      s.setProperty('transform', 'none', 'important');
      s.setProperty('min-height', '0', 'important');
      s.setProperty('width', 'auto', 'important');
      s.setProperty('height', 'auto', 'important');
      s.setProperty('background', 'none', 'important');
      s.setProperty('overflow', 'visible', 'important');
    }
  }
  card.style.setProperty('margin', '0', 'important');
  card.style.setProperty('transform', 'none', 'important');
  const html = document.documentElement.style;
  html.setProperty('margin', '0', 'important');
  html.setProperty('padding', '0', 'important');
  html.setProperty('background', 'none', 'important');
  const style = document.createElement('style');
  style.textContent = '@page { size: ' + pageWidthMm + 'mm ' + pageHeightMm + 'mm; margin: 0; }';
  document.head.appendChild(style);
  return true;
}

export interface ShapeCss {
  widthCss: string;
  heightCss: string;
  bleedCss: string;
}

/**
 * Fluid designs: sets `--od-w`/`--od-h`/`--od-bleed` on every fluid card (or,
 * with no shape, changes nothing) and waits for layout. Returns whether the
 * first card is fluid and its box in CSS px.
 */
export async function applyShape(cardSelector: string, shape: ShapeCss | null): Promise<{ fluid: boolean; width: number; height: number }> {
  const cards = Array.prototype.slice.call(document.querySelectorAll(cardSelector));
  const fluidCards = cards.filter((c: any) => c.hasAttribute('data-od-fluid'));
  if (shape) {
    fluidCards.forEach((c: any) => {
      c.style.setProperty('--od-w', shape.widthCss);
      c.style.setProperty('--od-h', shape.heightCss);
      c.style.setProperty('--od-bleed', shape.bleedCss);
      // Size the card from the variables ourselves: a card the author sized some other way
      // (width: 100%, a fixed size) would otherwise ignore them and never change shape.
      c.style.setProperty('width', 'calc(' + shape.widthCss + ' + 2 * ' + shape.bleedCss + ')', 'important');
      c.style.setProperty('height', 'calc(' + shape.heightCss + ' + 2 * ' + shape.bleedCss + ')', 'important');
      ['max-width', 'max-height', 'min-width', 'min-height'].forEach((p) => c.style.setProperty(p, 'none', 'important'));
      c.style.setProperty('min-width', '0', 'important');
      c.style.setProperty('min-height', '0', 'important');
      c.style.setProperty('flex-shrink', '0', 'important');
    });
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  }
  const first = cards[0];
  const r = first ? first.getBoundingClientRect() : { width: 0, height: 0 };
  return { fluid: fluidCards.length > 0 && fluidCards[0] === first, width: r.width, height: r.height };
}

/**
 * For the fixed-size check: font size and box width of every text-bearing
 * element, `img` and `svg` in the first card, in document order, each with a
 * short description.
 */
export function measureScalables(cardSelector: string): Array<{ name: string; font: number; width: number; text: boolean }> {
  const card = document.querySelector(cardSelector);
  if (!card) return [];
  const out: Array<{ name: string; font: number; width: number; text: boolean }> = [];
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  Array.prototype.slice.call(card.querySelectorAll('*')).forEach((el: any) => {
    const tag = String(el.tagName).toLowerCase();
    if (tag === 'script' || tag === 'style' || el.closest('svg') !== null && tag !== 'svg') return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const ownText = Array.prototype.some.call(el.childNodes, (n: any) => n.nodeType === 3 && String(n.nodeValue || '').trim() !== '');
    const graphic = tag === 'img' || tag === 'svg';
    if (!ownText && !graphic) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1) return;
    out.push({ name: describe(el), font: parseFloat(cs.fontSize) || 0, width: r.width, text: ownText });
  });
  return out;
}

/**
 * horizontal-scroll (artifact-visual-check): a page wider than the viewport
 * scrolls sideways, which on a phone usually means a fixed-width element.
 * Names the element reaching furthest right, skipping content inside a
 * horizontally clipping or scrolling container (an intentional carousel) and
 * fixed-position elements (an off-canvas drawer), which don't widen the page.
 */
export function collectHorizontalScroll(maxErrorWidth: number): PageFinding[] {
  const vw = window.innerWidth;
  const root = document.scrollingElement || document.documentElement;
  const pageWidth = root.scrollWidth;
  if (pageWidth <= vw + 1) return [];
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  let worst: any = null;
  let worstRight = vw + 1;
  Array.prototype.slice.call(document.body ? document.body.querySelectorAll('*') : []).forEach((el: any) => {
    const tag = String(el.tagName).toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const right = r.right + (window.scrollX || 0);
    if (right <= worstRight) return;
    for (let a = el; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'fixed') return;
      if (a !== el && cs.overflowX !== 'visible') return;
    }
    worst = el;
    worstRight = right;
  });
  const fix = 'Constrain it (max-width: 100%, min-width: 0 on flex/grid children, flex-wrap) or put it in an overflow-x: auto container.';
  return [
    {
      check: 'horizontal-scroll',
      severity: vw <= maxErrorWidth ? 'error' : 'warning',
      message:
        'The page is ' + Math.round(pageWidth) + 'px wide in a ' + vw + 'px viewport, so it scrolls sideways' +
        (worst ? '; ' + describe(worst) + ' reaches ' + Math.round(worstRight) + 'px. ' + fix : '.'),
      selector: worst ? describe(worst) : undefined,
    },
  ];
}

/**
 * data-od-fit (openspec add-campaign-kit, "Fit Bound Text"): shrinks each
 * marked element's font in 5% steps, down to 70% of its authored size, until
 * its text fits its own box, its clipping ancestors and the card. Runs after
 * a row is bound and the shape applied, so it first restores the authored size
 * (fluid designs size text in container units, which must never be frozen into
 * px across shapes). Returns what it changed; text still overflowing at 70% is
 * left for preflight's overflow check.
 */
export function fitBoundText(cardSelector: string): Array<{ name: string; percent: number; fits: boolean }> {
  const out: Array<{ name: string; percent: number; fits: boolean }> = [];
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    const field = el.getAttribute('data-od-field');
    if (field) s += '[data-od-field="' + field + '"]';
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const inside = (r: any, b: any): boolean => r.left >= b.left - 1 && r.top >= b.top - 1 && r.right <= b.right + 1 && r.bottom <= b.bottom + 1;
  // Glyphs routinely extend past a tight line box (line-height 1), so vertical fit is judged against
  // clipping ancestors and the card, like preflight's overflow check, not the element's own scrollHeight.
  const fits = (el: any): boolean => {
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) return false;
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) return true;
    const card = el.closest(cardSelector);
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = window.getComputedStyle(a);
      if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && !inside(r, a.getBoundingClientRect())) return false;
      if (a === card) break;
    }
    return !card || inside(r, card.getBoundingClientRect());
  };
  // The authored font-size expression (e.g. "min(12cqw, 22cqh)"), so a fitted size stays relative to the
  // card on every shape instead of being frozen into px. Last matching rule wins (specificity ignored).
  const authoredSize = (el: any): string => {
    let found = '';
    const scan = (rules: any): void => {
      for (const rule of Array.prototype.slice.call(rules || [])) {
        if (rule.type === 4 && rule.media && window.matchMedia(rule.media.mediaText).matches) scan(rule.cssRules);
        else if (rule.type === 12) scan(rule.cssRules);
        else if (rule.type === 1 && rule.style && rule.style.getPropertyValue('font-size')) {
          let hit = false;
          try {
            hit = el.matches(rule.selectorText);
          } catch {
            hit = false;
          }
          if (hit) found = rule.style.getPropertyValue('font-size');
        }
      }
    };
    for (const sheet of Array.prototype.slice.call(document.styleSheets)) {
      try {
        scan(sheet.cssRules);
      } catch {
        // Cross-origin stylesheet: unreadable; fall back to the computed size.
      }
    }
    return found;
  };
  for (const el of Array.prototype.slice.call(document.querySelectorAll('[data-od-fit]'))) {
    if (!el.hasAttribute('data-od-fit-inline')) el.setAttribute('data-od-fit-inline', el.style.fontSize || '');
    const inline = el.getAttribute('data-od-fit-inline');
    el.style.fontSize = inline;
    if (fits(el)) continue;
    const expr = inline || authoredSize(el) || window.getComputedStyle(el).fontSize;
    let percent = 100;
    let ok = false;
    while (!ok && percent > 70) {
      percent -= 5;
      el.style.fontSize = 'calc((' + expr + ') * ' + percent / 100 + ')';
      ok = fits(el);
    }
    // Still too long at 70%: back to the authored size, so preflight reports the overflow as it would have.
    if (!ok) el.style.fontSize = inline;
    out.push({ name: describe(el), percent, fits: ok });
  }
  return out;
}
