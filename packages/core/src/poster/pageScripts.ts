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
  /** Print: the radius the printer cuts the trim corners to, CSS px (0 or absent for square corners). */
  cornerRadiusPx?: number;
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
  // Only what renders as an emoji: ©, ®, ™ and arrows are Extended_Pictographic but draw as text unless followed by U+FE0F.
  const emoji = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;

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
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    // Chrome reports colours as written (oklch(), oklab(), lab(), lch(), hwb(), color(display-p3 …)): paint those on a 1×1 canvas to read them as sRGB.
    const modern = /(?:oklch|oklab|lab|lch|hwb|color)\([^()]*\)/i.exec(String(value || ''));
    if (!modern) return null;
    const g: any = window;
    if (!g.__odColorCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      g.__odColorCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = g.__odColorCtx;
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = modern[0];
    if (String(ctx.fillStyle) === '#010203') return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
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

  // Taste (openspec add-taste-checks): warnings only, each silenced by data-od-allow="<code> …" on the element or an ancestor.
  // Page-only detectors (card-row, uniform-surface, type-scale) skip cards and slides, whose layouts need their own thresholds.
  const TASTE_MAX_ELEMENTS = 2000;
  const GLOW_HUE_MIN = 235;
  const GLOW_HUE_MAX = 300;
  const GLOW_MIN_SATURATION = 0.45;
  // The other stops of a "trust" gradient: blue, cyan, pink. A stop outside this band (orange, green) makes it a brand gradient.
  const GLOW_COMPANION_HUE_MIN = 180;
  const GLOW_COMPANION_HUE_MAX = 340;
  const GLOW_MIN_COVERAGE = 0.25;
  const GLOW_MIN_BLUR_PX = 40;
  // anti-ai-slop.md's list (upstream AI_DEFAULT_INDIGO).
  const AI_DEFAULT_INDIGO = ['#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#8b5cf6', '#7c3aed', '#a855f7'];
  const CARD_ROW_MIN_WIDTH = 160;
  const CARD_ROW_WIDTH_TOLERANCE = 4;
  const CARD_ROW_MAX_ICON = 64;
  const UNIFORM_SURFACE_MIN = 6;
  // The "rounded card wall": a radius and a drop shadow on every box. Flat bordered boxes (docs callouts, memo tables) don't count.
  const UNIFORM_SURFACE_MIN_RADIUS_PX = 4;
  const TYPE_SCALE_TOLERANCE_PX = 1;
  const DANGER_HUE_MIN = 345;
  const DANGER_HUE_MAX = 20;
  const DANGER_MIN_SATURATION = 0.35;
  const DANGER_TOKENS = ['--danger', '--color-danger', '--destructive', '--error'];
  const DESTRUCTIVE_WORDS = /\b(delete|remove|discard|erase|revoke|reset)\b|\bcancel (my |your )?subscription\b|\bclose (my |your )?account\b/i;
  const pageMode = cardEls.length === 0;

  const allowed = (el: any, code: string): boolean => {
    for (let a = el; a && a.getAttribute; a = a.parentElement) {
      const v = a.getAttribute('data-od-allow');
      if (v && String(v).split(/\s+/).indexOf(code) >= 0) return true;
    }
    return false;
  };
  const hsl = (c: any): { h: number; s: number; l: number } => {
    const r = c.r / 255;
    const g = c.g / 255;
    const b = c.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return { h, s, l };
  };
  const hex = (c: any): string => '#' + [c.r, c.g, c.b].map((v: number) => ('0' + Math.round(v).toString(16)).slice(-2)).join('');
  const colorsIn = (value: string): any[] => (String(value || '').match(/(?:rgba?|oklch|oklab|lab|lch|hwb|color)\([^()]*\)/gi) || []).map(parseColor).filter(Boolean);
  const isRed = (c: any): boolean => {
    if (!c || c.a < 0.1) return false;
    const x = hsl(c);
    return x.s >= DANGER_MIN_SATURATION && x.l > 0.15 && x.l < 0.9 && (x.h >= DANGER_HUE_MIN || x.h <= DANGER_HUE_MAX);
  };
  // A purple-blue "trust" gradient: at least one stop in the purple-blue band, the other coloured stops blue, cyan or pink.
  const trustColors = (colors: any[]): boolean => {
    let inBand = 0;
    for (const c of colors) {
      if (c.a < 0.05) continue;
      const x = hsl(c);
      if (x.s < GLOW_MIN_SATURATION || x.l > 0.92 || x.l < 0.08) continue;
      if (x.h >= GLOW_HUE_MIN && x.h <= GLOW_HUE_MAX) inBand++;
      else if (x.h < GLOW_COMPANION_HUE_MIN || x.h > GLOW_COMPANION_HUE_MAX) return false;
    }
    return inBand > 0;
  };
  const ownText = (el: any): string =>
    Array.prototype.filter.call(el.childNodes, (n: any) => n.nodeType === 3).map((n: any) => String(n.nodeValue || '')).join('').trim();
  // The page's own custom properties (from its stylesheets and inline styles on <html>/<body>), for the token-aware checks.
  const declaredTokens = (): string[] => {
    const names = new Set<string>();
    const fromStyle = (style: any): void => {
      for (let i = 0; style && i < style.length; i++) if (String(style[i]).indexOf('--') === 0) names.add(String(style[i]));
    };
    const scan = (rules: any): void => {
      for (const rule of Array.prototype.slice.call(rules || [])) {
        if (rule.style) fromStyle(rule.style);
        if (rule.cssRules) scan(rule.cssRules);
      }
    };
    for (const sheet of Array.prototype.slice.call(document.styleSheets)) {
      try {
        scan(sheet.cssRules);
      } catch {
        // Cross-origin stylesheet: unreadable.
      }
    }
    fromStyle(document.documentElement.style);
    if (document.body) fromStyle(document.body.style);
    return Array.from(names);
  };

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
    // Rounded trim corners (cards): text near a corner is cut by the round, not just the straight edge.
    // The safe area of a rounded trim is itself rounded, with radius cornerRadius − safeInset.
    const cornerRadius = opts.print ? opts.cornerRadiusPx || 0 : 0;
    const innerRadius = Math.max(0, cornerRadius - opts.safeInsetPx);
    const cornerHit = (r: any): string => {
      if (cornerRadius <= 0) return '';
      const corners = [
        { name: 'top-left', x: r.left, y: r.top, cx: safe.left + innerRadius, cy: safe.top + innerRadius, sx: -1, sy: -1 },
        { name: 'top-right', x: r.right, y: r.top, cx: safe.right - innerRadius, cy: safe.top + innerRadius, sx: 1, sy: -1 },
        { name: 'bottom-left', x: r.left, y: r.bottom, cx: safe.left + innerRadius, cy: safe.bottom - innerRadius, sx: -1, sy: 1 },
        { name: 'bottom-right', x: r.right, y: r.bottom, cx: safe.right - innerRadius, cy: safe.bottom - innerRadius, sx: 1, sy: 1 },
      ];
      for (const c of corners) {
        // Past the inner circle's centre on both axes, the point must lie within the inner radius of it.
        const dx = (c.x - c.cx) * c.sx;
        const dy = (c.y - c.cy) * c.sy;
        if (dx > 0.5 && dy > 0.5 && Math.sqrt(dx * dx + dy * dy) > innerRadius + 0.5) return c.name;
      }
      return '';
    };

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
      // What can be seen: past a scroll container, only the container's own box (its content scrolls into view).
      let seen = r;
      for (let a = el; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        // Only hidden/clip cut text off; a scroll container (auto/scroll) lets it be scrolled into view.
        if (acs.overflowX === 'hidden' || acs.overflowX === 'clip' || acs.overflowY === 'hidden' || acs.overflowY === 'clip') {
          if (outside(seen, a.getBoundingClientRect(), 1)) {
            clipped = true;
            add({ check: 'overflow', severity: 'error', message: name + (a === card ? ' runs past the edge of the card and is cut off.' : ' is clipped by its container ' + describe(a).split(' "')[0] + ' — the text is longer than its box.'), selector: name });
            break;
          }
        }
        if (a === card) break;
        if (acs.overflowX === 'auto' || acs.overflowX === 'scroll' || acs.overflowY === 'auto' || acs.overflowY === 'scroll') {
          const sr = a.getBoundingClientRect();
          seen = { left: Math.max(seen.left, sr.left), top: Math.max(seen.top, sr.top), right: Math.min(seen.right, sr.right), bottom: Math.min(seen.bottom, sr.bottom) };
        }
      }
      if (!clipped && outside(seen, box, 1)) add({ check: 'overflow', severity: 'error', message: name + ' extends outside the card.', selector: name });

      // safe-area
      if (!clipped && !outside(seen, box, 1)) {
        if (opts.bleedPx > 0 && outside(seen, trim, 0.5)) {
          add({ check: 'safe-area', severity: 'error', message: name + ' is inside the bleed and will be cut off when the print is trimmed.', selector: name });
        } else if (cornerHit(seen)) {
          add({ check: 'corner-clearance', severity: 'warning', message: name + ' sits in the ' + cornerHit(seen) + ' corner, which the printer cuts round (' + Math.round(((opts.cornerRadiusPx || 0) * 25.4) / 9.6) / 10 + ' mm radius); move it further in.', selector: name });
        } else if (outside(seen, safe, 0.5)) {
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
        // A background this can't read is unknown, not the page's white behind it.
        if (!c || (c && c.a > 0.01 && c.a < 0.99)) {
          skipped = true;
          break;
        }
        if (c.a >= 0.99) {
          bg = c;
          break;
        }
      }
      const fg0 = skipped ? null : parseColor(cs.color);
      if (skipped || !fg0) contrastSkipped++;
      else {
        if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
        {
          const fg = { r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a) };
          const l1 = luminance(fg);
          const l2 = luminance(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
          const need = large ? 3 : 4.5;
          // Rounded down, so a ratio just under the bar never reads as meeting it (4.495 showed as 4.5).
          if (ratio < need) {
            add({ check: 'contrast', severity: 'warning', message: name + ' has a contrast ratio of ' + Math.floor(ratio * 100) / 100 + ':1 against its background (needs ' + need + ':1 for ' + (large ? 'large' : 'body') + ' text).', selector: name });
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

    // ---- Taste: one shared walk of the card's boxes ----
    const boxes: any[] = [];
    const candidates = (pageMode ? [document.documentElement, card] : [card]).concat(Array.prototype.slice.call(card.querySelectorAll('*')));
    for (const el of candidates) {
      if (boxes.length >= TASTE_MAX_ELEMENTS) break;
      const tag = String(el.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'head' || (tag !== 'svg' && el.closest('svg'))) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      boxes.push({ el, cs, r, tag });
    }
    const probe = document.createElement('div');
    probe.setAttribute('style', 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none');
    (document.body || document.documentElement).appendChild(probe);
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const tokenValue = (name: string): string => String(rootStyle.getPropertyValue(name) || '').trim();
      const tokenColor = (name: string): any => {
        if (!tokenValue(name)) return null;
        probe.style.color = '';
        probe.style.color = 'var(' + name + ')';
        return parseColor(getComputedStyle(probe).color);
      };
      const sameColor = (a: any, b: any): boolean => !!a && !!b && Math.abs(a.r - b.r) < 1.5 && Math.abs(a.g - b.g) < 1.5 && Math.abs(a.b - b.b) < 1.5;

      // slop-glow: a purple-blue gradient or blurred glow over a quarter of the first screen (the card, for cards and slides).
      const region = pageMode ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight } : box;
      const regionArea = area(region);
      // One finding per card: the outermost glow, not every layer of the same hero.
      for (const b of boxes) {
        if (regionArea <= 0) break;
        const inter = { left: Math.max(b.r.left, region.left), top: Math.max(b.r.top, region.top), right: Math.min(b.r.right, region.right), bottom: Math.min(b.r.bottom, region.bottom) };
        const coverage = area(inter) / regionArea;
        if (coverage < GLOW_MIN_COVERAGE || allowed(b.el, 'slop-glow')) continue;
        let hit = '';
        const styles = [b.cs, window.getComputedStyle(b.el, '::before'), window.getComputedStyle(b.el, '::after')];
        for (const s of styles) {
          if (!s) continue;
          const image = String(s.backgroundImage || '');
          const blur = /blur\(([\d.]+)px\)/.exec(String(s.filter || ''));
          if (image.indexOf('gradient(') >= 0 && trustColors(colorsIn(image))) hit = 'gradient';
          else if (blur && Number(blur[1]) >= GLOW_MIN_BLUR_PX && trustColors(colorsIn(image + ' ' + s.backgroundColor))) hit = 'blurred glow';
          if (hit) break;
        }
        if (!hit) continue;
        const name = b.tag === 'html' ? 'the page background' : describe(b.el).split(' "')[0];
        add({ check: 'slop-glow', severity: 'warning', message: name + ' has a purple-blue ' + hit + ' behind ' + Math.round(coverage * 100) + '% of the ' + (pageMode ? 'first screen' : 'card') + ', the most common "default AI" look. Use a flat surface from the design system (--bg, --surface) and let --accent carry the colour.', selector: name });
        break;
      }
      // ...and the default Tailwind indigo as the accent.
      const accent = tokenColor('--accent');
      if (accent && AI_DEFAULT_INDIGO.indexOf(hex(accent)) >= 0 && !allowed(document.documentElement, 'slop-glow')) {
        add({ check: 'slop-glow', severity: 'warning', message: 'The page\'s --accent is ' + hex(accent) + ', a default Tailwind indigo. Take the accent from the design system, or choose one for this brand.', selector: '--accent' });
      } else {
        for (const b of boxes) {
          if (!(b.tag === 'button' || b.tag === 'a' || b.el.getAttribute('role') === 'button')) continue;
          const bg = parseColor(b.cs.backgroundColor);
          if (!bg || bg.a < 0.99 || AI_DEFAULT_INDIGO.indexOf(hex(bg)) < 0 || allowed(b.el, 'slop-glow')) continue;
          add({ check: 'slop-glow', severity: 'warning', message: describe(b.el) + ' is filled with ' + hex(bg) + ', a default Tailwind indigo. Use --accent from the design system.', selector: describe(b.el) });
          break;
        }
      }

      // intent: a destructive action that doesn't look dangerous, and a primary action styled like the others.
      const danger = DANGER_TOKENS.map(tokenColor).filter(Boolean);
      const actions = boxes.filter((b: any) => {
        if (b.tag === 'button' || b.el.getAttribute('role') === 'button') return true;
        if (b.tag === 'input') return /^(submit|button|reset)$/i.test(String(b.el.getAttribute('type') || ''));
        if (b.tag !== 'a') return false;
        const bg = parseColor(b.cs.backgroundColor);
        // Links only when drawn as buttons (a fill or a border), or explicitly marked.
        return b.el.hasAttribute('data-intent') || (bg && bg.a > 0.1) || (parseFloat(b.cs.borderTopWidth) > 0 && b.cs.borderTopStyle !== 'none');
      });
      const label = (el: any): string => String(el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      for (const b of actions) {
        const declared = b.el.getAttribute('data-intent');
        const text = label(b.el);
        const destructive = declared ? declared === 'destructive' : text.length <= 60 && DESTRUCTIVE_WORDS.test(text);
        if (!destructive || allowed(b.el, 'intent')) continue;
        const border = parseFloat(b.cs.borderTopWidth) > 0 && b.cs.borderTopStyle !== 'none' ? parseColor(b.cs.borderTopColor) : null;
        const shown = [parseColor(b.cs.backgroundColor), parseColor(b.cs.color), border].filter((c: any) => c && c.a > 0.1);
        if (shown.some((c: any) => isRed(c) || danger.some((d: any) => sameColor(c, d)))) continue;
        add({ check: 'intent', severity: 'warning', message: describe(b.el) + ' destroys something but looks like any other action. Colour it with the design system\'s --danger (or a red), so it can\'t be clicked by mistake.', selector: describe(b.el) });
      }
      const groups = new Map();
      for (const b of actions) {
        const list = groups.get(b.el.parentElement) || [];
        list.push(b);
        groups.set(b.el.parentElement, list);
      }
      const look = (cs: any): string => [cs.backgroundColor, cs.color, cs.borderTopColor, cs.borderTopWidth, cs.fontWeight, cs.boxShadow, cs.textDecorationLine].join('|');
      groups.forEach((list: any[]) => {
        if (list.length < 2) return;
        for (const p of list) {
          const isPrimary = p.el.getAttribute('data-intent') === 'primary' || String(p.el.getAttribute('type') || '').toLowerCase() === 'submit';
          if (!isPrimary || allowed(p.el, 'intent')) continue;
          const twin = list.find((o: any) => o !== p && o.el.getAttribute('data-intent') !== 'primary' && String(o.el.getAttribute('type') || '').toLowerCase() !== 'submit' && look(o.cs) === look(p.cs));
          if (twin) add({ check: 'intent', severity: 'warning', message: describe(p.el) + ' is the primary action but is styled exactly like ' + describe(twin.el) + '. Make the primary one stand out (fill it with --accent) and keep the others quieter.', selector: describe(p.el) });
        }
      });

      if (pageMode) {
        // card-row: three or four identical cards in a row, each an icon, then a heading, then text.
        const startsWithIcon = (kid: any): boolean => {
          const heading = kid.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
          if (!heading) return false;
          for (const d of Array.prototype.slice.call(kid.querySelectorAll('*'))) {
            if (d === heading || heading.contains(d)) return false;
            const tag = String(d.tagName).toLowerCase();
            const r = d.getBoundingClientRect();
            const small = r.width >= 1 && r.height >= 1 && r.width <= CARD_ROW_MAX_ICON && r.height <= CARD_ROW_MAX_ICON;
            if (tag === 'svg' || tag === 'img') return small;
            const t = ownText(d);
            if (t) return t.length <= 4 && emoji.test(t);
            if (small && /icon/i.test(String(d.className && d.className.baseVal !== undefined ? d.className.baseVal : d.className || ''))) return true;
          }
          return false;
        };
        const rows: any[] = [];
        for (const b of boxes) {
          if (rows.some((r: any) => r.contains(b.el))) continue;
          const kids = Array.prototype.slice.call(b.el.children).filter((k: any) => {
            const r = k.getBoundingClientRect();
            return r.width >= 1 && r.height >= 1 && getComputedStyle(k).display !== 'none';
          });
          if (kids.length < 3 || kids.length > 4) continue;
          const widths = kids.map((k: any) => k.getBoundingClientRect().width);
          if (Math.min.apply(null, widths) < CARD_ROW_MIN_WIDTH || Math.max.apply(null, widths) - Math.min.apply(null, widths) > CARD_ROW_WIDTH_TOLERANCE) continue;
          const shape = (k: any): string => Array.prototype.map.call(k.children, (c: any) => c.tagName).join(',');
          if (!kids.every((k: any) => shape(k) === shape(kids[0]) && startsWithIcon(k)) || allowed(b.el, 'card-row')) continue;
          rows.push(b.el);
          const name = describe(b.el).split(' "')[0];
          add({ check: 'card-row', severity: 'warning', message: name + ' is a row of ' + kids.length + ' identical cards, each an icon, a heading and a line of text: the textbook AI feature section. Vary them (one large, the rest small), or use a list, a table or a single strong example.', selector: name });
        }

        // uniform-surface: every card-like box with the same radius and shadow.
        const backgroundOf = (el: any): any => {
          for (let a = el.parentElement; a; a = a.parentElement) {
            const c = parseColor(getComputedStyle(a).backgroundColor);
            if (c && c.a > 0.05) return c;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        };
        const surfaces = boxes.filter((b: any) => {
          if (/^(html|body|button|a|input|select|textarea|label|img|svg|video|canvas|iframe)$/.test(b.tag) || b.r.width < 100 || b.r.height < 60) return false;
          const edged = (parseFloat(b.cs.borderTopWidth) > 0 && b.cs.borderTopStyle !== 'none') || (b.cs.boxShadow && b.cs.boxShadow !== 'none');
          const bg = parseColor(b.cs.backgroundColor);
          return edged && bg && bg.a > 0.05 && !sameColor(bg, backgroundOf(b.el)) && !allowed(b.el, 'uniform-surface');
        });
        const surfaceLook = (b: any): string => b.cs.borderTopLeftRadius + ' | ' + b.cs.boxShadow;
        if (surfaces.length >= UNIFORM_SURFACE_MIN && surfaces.every((b: any) => surfaceLook(b) === surfaceLook(surfaces[0])) && parseFloat(surfaces[0].cs.borderTopLeftRadius) >= UNIFORM_SURFACE_MIN_RADIUS_PX && surfaces[0].cs.boxShadow !== 'none') {
          add({ check: 'uniform-surface', severity: 'warning', message: 'All ' + surfaces.length + ' card-like boxes share one radius (' + surfaces[0].cs.borderTopLeftRadius + ') and one shadow (' + surfaces[0].cs.boxShadow + '), so nothing stands out. Give the important ones more weight (size, fill, elevation) and flatten the rest.', selector: describe(surfaces[0].el).split(' "')[0] });
        }

        // type-scale: h1/h2 off the design system's display tokens, when the page declares them.
        const tokens = declaredTokens();
        const sizes = tokens
          .filter((n: string) => n.indexOf('--text-') === 0 && window.CSS && window.CSS.supports('font-size', tokenValue(n)))
          .map((n: string) => {
            probe.style.fontSize = '';
            probe.style.fontSize = 'var(' + n + ')';
            return { name: n, px: parseFloat(getComputedStyle(probe).fontSize) || 0 };
          })
          .filter((t: any) => t.px > 0);
        const family = (v: string): string => String(v || '').replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase();
        const families = ['--font-display', '--font-body'].filter((n: string) => tokenValue(n)).map((n: string) => {
          probe.style.fontFamily = '';
          probe.style.fontFamily = 'var(' + n + ')';
          return family(getComputedStyle(probe).fontFamily);
        });
        if (sizes.length > 0 || families.length > 0) {
          for (const b of boxes) {
            if ((b.tag !== 'h1' && b.tag !== 'h2') || !String(b.el.innerText || '').trim() || allowed(b.el, 'type-scale')) continue;
            const px = parseFloat(b.cs.fontSize) || 0;
            const name = describe(b.el);
            if (sizes.length > 0 && !sizes.some((t: any) => Math.abs(t.px - px) <= TYPE_SCALE_TOLERANCE_PX)) {
              const nearest = sizes.slice().sort((x: any, y: any) => Math.abs(x.px - px) - Math.abs(y.px - px))[0];
              add({ check: 'type-scale', severity: 'warning', message: name + ' is ' + Math.round(px * 10) / 10 + 'px, which isn\'t on the design system\'s type scale; the nearest step is ' + nearest.name + ' (' + Math.round(nearest.px * 10) / 10 + 'px). Use var(' + nearest.name + ') or another --text-* step.', selector: name });
            } else if (families.length > 0 && families.indexOf(family(b.cs.fontFamily)) < 0) {
              add({ check: 'type-scale', severity: 'warning', message: name + ' is set in ' + String(b.cs.fontFamily).split(',')[0].replace(/["']/g, '') + ', not the design system\'s display or body font. Use var(--font-display).', selector: name });
            }
          }
        }
      }
    } finally {
      probe.remove();
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

/**
 * Print with a card back (openspec add-print-house-images): shows the card at `index` among `cardSelector`
 * matches and hides the others, after isolateCardForPrint has stripped the page down to the cards.
 */
export function showCardForPrint(cardSelector: string, index: number): boolean {
  const cards = Array.prototype.slice.call(document.querySelectorAll(cardSelector));
  if (!cards[index]) return false;
  cards.forEach((card: any, i: number) => {
    if (i === index) {
      card.style.removeProperty('display');
      card.style.setProperty('margin', '0', 'important');
      card.style.setProperty('transform', 'none', 'important');
    } else card.style.setProperty('display', 'none', 'important');
  });
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

/**
 * States pass (openspec add-state-accessibility-checks): marks up to `cap` visible,
 * enabled interactive elements with data-od-state-target="<index>", in document
 * order, so Node can force :hover and :focus-visible on them through CDP. Returns
 * their descriptions.
 */
export function collectStateTargets(cap: number): string[] {
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  Array.prototype.slice.call(document.querySelectorAll('[data-od-state-target]')).forEach((el: any) => el.removeAttribute('data-od-state-target'));
  const out: string[] = [];
  const all = document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])');
  for (const el of Array.prototype.slice.call(all)) {
    if (out.length >= cap) break;
    if (el.disabled || el.closest('[inert], [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    el.setAttribute('data-od-state-target', String(out.length));
    out.push(describe(el));
  }
  return out;
}

export interface StateLook {
  /** Outline, shadow, border, background, text decoration and pseudo-element content: what a focus indicator changes. */
  look: string;
  color: string;
  /** Text contrast against the nearest solid background, or null when it can't be measured. */
  ratio: number | null;
}

/**
 * Reads every state target's styles in the state Node has forced. With `state`
 * "default" it only returns the looks (the baseline). Otherwise it reports
 * `state-contrast` where the forced state lowers the element's text contrast
 * below 4.5:1 (3:1 large), and, for "focus-visible", a
 * `focus-visible` error where nothing visible changed and no outline shows.
 */
export function compareStateStyles(state: string, baseline: StateLook[] | null): { looks: StateLook[]; findings: PageFinding[]; skipped: number } {
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const parseColor = (value: string): any => {
    const m = /rgba?\(([^)]+)\)/.exec(String(value || ''));
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    // Chrome reports colours as written (oklch(), oklab(), lab(), lch(), hwb(), color(display-p3 …)): paint those on a 1×1 canvas to read them as sRGB.
    const modern = /(?:oklch|oklab|lab|lch|hwb|color)\([^()]*\)/i.exec(String(value || ''));
    if (!modern) return null;
    const g: any = window;
    if (!g.__odColorCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      g.__odColorCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = g.__odColorCtx;
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = modern[0];
    if (String(ctx.fillStyle) === '#010203') return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const luminance = (c: any): number => {
    const ch = [c.r, c.g, c.b].map((v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const lookOf = (s: any): string =>
    s ? [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderTopWidth, s.borderBottomWidth, s.backgroundColor, s.textDecorationLine, s.content].join('|') : '';
  const outlined = (s: any): boolean => {
    if (!s || s.outlineStyle === 'none' || parseFloat(s.outlineWidth) < 1) return false;
    const c = parseColor(s.outlineColor);
    return !c || c.a > 0.1;
  };
  const label = state === 'focus-visible' ? 'keyboard focus' : state;
  const targets = Array.prototype.slice.call(document.querySelectorAll('[data-od-state-target]'));
  targets.sort((a: any, b: any) => Number(a.getAttribute('data-od-state-target')) - Number(b.getAttribute('data-od-state-target')));
  const looks: StateLook[] = [];
  const findings: PageFinding[] = [];
  let skipped = 0;
  targets.forEach((el: any, i: number) => {
    const cs = getComputedStyle(el);
    const before = window.getComputedStyle(el, '::before');
    const after = window.getComputedStyle(el, '::after');
    const look = [lookOf(cs), lookOf(before), lookOf(after)].join('#');
    const base = baseline ? baseline[i] : null;
    const name = describe(el);
    if (state === 'focus-visible' && base && look === base.look && !outlined(cs) && !outlined(before) && !outlined(after)) {
      findings.push({ check: 'focus-visible', severity: 'error', message: name + ' shows no change when focused from the keyboard (no outline, ring, border or background change), so keyboard users lose their place. Keep the browser\'s outline or style :focus-visible with --focus-ring.', selector: name });
    }
    const now: StateLook = { look, color: String(cs.color), ratio: null };
    looks.push(now);
    if (!String(el.innerText || el.value || '').trim()) return;
    let bg: any = null;
    for (let a = el; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.backgroundImage && acs.backgroundImage !== 'none') break;
      const c = parseColor(acs.backgroundColor);
      if (c && c.a >= 0.99) {
        bg = c;
        break;
      }
      if (c && c.a > 0.01) break;
      if (!a.parentElement) bg = { r: 255, g: 255, b: 255, a: 1 };
    }
    const fg0 = parseColor(cs.color);
    if (!bg || !fg0) {
      if (state !== 'default') skipped++;
      return;
    }
    const fg = { r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a) };
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(cs.fontSize) || 0;
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    now.ratio = ratio;
    // Only a drop the state causes: low contrast in the default state is the contrast check's.
    if (state !== 'default' && base && ratio < need && (base.ratio === null || ratio < base.ratio - 0.05)) {
      findings.push({ check: 'state-contrast', severity: 'warning', message: name + ' drops to ' + Math.floor(ratio * 100) / 100 + ':1 contrast on ' + label + ' (needs ' + need + ':1 for ' + (large ? 'large' : 'body') + ' text).', selector: name });
    }
  });
  return { looks, findings, skipped };
}

/**
 * tap-target (WCAG 2.2 SC 2.5.8), for the phone viewport: interactive elements
 * smaller than 24×24 CSS px whose 24px circle, centred on them, touches another
 * target or another small target's circle. Inline links in running text and
 * labelled checkboxes and radios are exempt. Error below 16px, else warning.
 */
export function collectTapTargets(): PageFinding[] {
  const MIN = 24;
  const ERROR_BELOW = 16;
  const MAX_TARGETS = 400;
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="menuitem"]';
  const targets: any[] = [];
  for (const el of Array.prototype.slice.call(document.querySelectorAll(sel))) {
    if (targets.length >= MAX_TARGETS) break;
    if (el.disabled || (el.parentElement && el.parentElement.closest(sel))) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const tag = String(el.tagName).toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const inlineInText = cs.display === 'inline' && el.parentElement && String(el.parentElement.innerText || '').trim().length > String(el.innerText || '').trim().length + 1;
    const labelled = tag === 'input' && (type === 'checkbox' || type === 'radio') && (!!el.closest('label') || (!!el.id && Array.prototype.some.call(document.querySelectorAll('label'), (l: any) => l.htmlFor === el.id)));
    targets.push({ el, r, exempt: inlineInText || labelled, small: r.width < MIN - 0.01 || r.height < MIN - 0.01 });
  }
  const centre = (r: any): any => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  const toRect = (p: any, r: any): number => {
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    return Math.sqrt(dx * dx + dy * dy);
  };
  const findings: PageFinding[] = [];
  for (const t of targets) {
    if (!t.small || t.exempt) continue;
    const c = centre(t.r);
    // Touching counts: half a pixel of tolerance on the SC's "do not intersect".
    const near = targets.find((o: any) => {
      if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) return false;
      if (toRect(c, o.r) < MIN / 2 + 0.5) return true;
      if (!o.small) return false;
      const d = centre(o.r);
      return Math.sqrt((c.x - d.x) * (c.x - d.x) + (c.y - d.y) * (c.y - d.y)) < MIN + 0.5;
    });
    if (!near) continue;
    const name = describe(t.el);
    const w = Math.round(t.r.width * 10) / 10;
    const h = Math.round(t.r.height * 10) / 10;
    findings.push({
      check: 'tap-target',
      severity: Math.min(t.r.width, t.r.height) < ERROR_BELOW ? 'error' : 'warning',
      message: name + ' is ' + w + '×' + h + 'px on a phone, too close to ' + describe(near.el) + ' to tap reliably. Make it at least 24×24px (padding, min-width/min-height) or leave more room around it.',
      selector: name,
    });
  }
  return findings;
}

/**
 * reduced-motion: with prefers-reduced-motion: reduce emulated, the CSS
 * animations and transitions longer than `minDurationMs` still running, and
 * elements with will-change: transform or an inline transform that move between
 * two samples 200 ms apart (a script loop). Canvases (three.js) are exempt.
 */
export async function collectRunningMotion(minDurationMs: number): Promise<PageFinding[]> {
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const fix = ' Add a @media (prefers-reduced-motion: reduce) rule that stops it or swaps it for a fade.';
  const findings: PageFinding[] = [];
  const reported = new Set();
  const anims = document.getAnimations ? document.getAnimations() : [];
  for (const a of anims) {
    if (a.playState !== 'running' || !a.effect || !a.effect.target) continue;
    const timing = a.effect.getComputedTiming();
    const duration = Number(timing.duration) || 0;
    const forever = timing.iterations === Infinity;
    if (duration <= minDurationMs || (!forever && !(Number(timing.endTime) - Number(timing.localTime || 0) > 0))) continue;
    const target = a.effect.target;
    if (String(target.tagName).toLowerCase() === 'canvas' || reported.has(target)) continue;
    reported.add(target);
    const what = a.animationName ? 'animation "' + a.animationName + '"' : a.transitionProperty ? 'transition of ' + a.transitionProperty : 'animation';
    const name = describe(target) + (a.effect.pseudoElement ? ' ' + a.effect.pseudoElement : '');
    findings.push({ check: 'reduced-motion', severity: 'warning', message: name + ' keeps its ' + what + ' (' + (forever ? 'looping' : Math.round(duration) + 'ms') + ') when the user asks for reduced motion.' + fix, selector: name });
  }
  const movers = Array.prototype.slice.call(document.body ? document.body.querySelectorAll('*') : [])
    .filter((el: any) => {
      if (reported.has(el) || String(el.tagName).toLowerCase() === 'canvas') return false;
      return String(getComputedStyle(el).willChange).indexOf('transform') >= 0 || !!(el.style && el.style.transform);
    })
    .slice(0, 200);
  const sample = (): string[] => movers.map((el: any) => {
    const r = el.getBoundingClientRect();
    return Math.round(r.left * 2) + ',' + Math.round(r.top * 2) + ',' + getComputedStyle(el).transform;
  });
  const first = sample();
  await new Promise((resolve) => window.setTimeout(resolve, 200));
  const second = sample();
  movers.forEach((el: any, i: number) => {
    if (first[i] === second[i]) return;
    const name = describe(el);
    findings.push({ check: 'reduced-motion', severity: 'warning', message: name + ' keeps moving (a script animation) when the user asks for reduced motion. Check matchMedia(\'(prefers-reduced-motion: reduce)\') before starting the loop.', selector: name });
  });
  return findings;
}
