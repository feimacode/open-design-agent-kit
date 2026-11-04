// In-page scripts for editable PPTX export (openspec add-editable-pptx-export).
// The kit's own code, not ported from upstream (upstream's editable mode
// vendors dom-to-pptx, which we didn't adopt). It started as the DOM walk of a
// python-pptx script written in a user test on 2026-11-04.
//
// Like ./pageScripts, every function here is serialized by puppeteer's
// page.evaluate(fn, ...args), so each one is self-contained: helpers are
// nested inside it, and it uses only browser globals (pageScripts.test.ts
// checks this). Types are `any` for the same reason as there.
//
// The protocol, per slide, after showSlide has shown it at the stage origin:
//   readSlideScene   → returns the SlideScene and remembers what it made native;
//   hideSceneObjects → hides exactly that (text, box fills and borders, pictures),
//                      so a screenshot shows only what PowerPoint can't express;
//   restoreSceneObjects → puts the page back.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const window: any;

/**
 * Reads the shown slide `index` into a SlideScene (./slideScene). Positions are
 * client px, which is the stage's own space once the slide is shown at the
 * origin. `scale` is the device scale used for pictures drawn here.
 */
export async function readSlideScene(
  slideSelector: string,
  cloneSelector: string,
  notesSelector: string,
  index: number,
  stageW: number,
  stageH: number,
  scale: number,
): Promise<any> {
  const win = window;
  const state: any = { textNodes: [], decorated: [], hide: [] };
  win.__odPptScene = state;

  const slides = Array.prototype.slice.call(document.querySelectorAll(slideSelector)).filter((el: any) => !el.closest(cloneSelector));
  // A re-stacked slide (restackActiveSlide) sits in the capture layer, out of document order.
  const layer = document.getElementById('__od_export_active_slide_capture');
  const slide = (layer && layer.firstElementChild && layer.firstElementChild.firstElementChild) || slides[index];
  const out: any = { background: { hex: 'FFFFFF', alpha: 1 }, boxes: [], pictures: [], texts: [], flattened: [], uncovered: [], fonts: [] };
  if (!slide) return out;

  // ---- colours: any CSS colour (rgb, oklch, color-mix…) through a 1×1 canvas
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  function color(value: string): any {
    if (!value || value === 'transparent') return { hex: '000000', alpha: 0 };
    if (colorCache.has(value)) return colorCache.get(value);
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = '#000';
    pctx.fillStyle = value;
    pctx.fillRect(0, 0, 1, 1);
    const d = pctx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    // getImageData is premultiplied-free but rounded; undo nothing, just format.
    const hex = [d[0], d[1], d[2]].map((n: number) => (n < 16 ? '0' : '') + n.toString(16)).join('').toUpperCase();
    const c = { hex, alpha: Math.round(a * 1000) / 1000 };
    colorCache.set(value, c);
    return c;
  }

  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const fade = (c: any, alpha: number): any => (alpha >= 0.999 ? c : { hex: c.hex, alpha: Math.round(c.alpha * alpha * 1000) / 1000 });
  const opacityOf = (cs: any): number => {
    const o = Number.parseFloat(cs.opacity);
    return Number.isFinite(o) ? o : 1;
  };
  const rectOf = (r: any): any => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const onStage = (r: any): boolean => r.w > 0.5 && r.h > 0.5 && r.x < stageW && r.y < stageH && r.x + r.w > 0 && r.y + r.h > 0;
  const label = (el: any): string => {
    const t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    return '<' + el.localName + '>' + (t ? ' "' + (t.length > 40 ? t.slice(0, 40) + '…' : t) + '"' : '');
  };

  // ---- fonts
  const GENERIC: any = { 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Consolas', cursive: 'Comic Sans MS', fantasy: 'Impact' };
  const SKIP_FAMILIES = new Set([
    'system-ui', '-apple-system', 'blinkmacsystemfont', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
    'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji', 'emoji', 'math', 'fangsong',
  ]);
  function fontName(stack: string): string {
    const families = String(stack || '').split(',').map((f: string) => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    for (const f of families) {
      const lower = f.toLowerCase();
      if (SKIP_FAMILIES.has(lower)) continue;
      if (GENERIC[lower]) return GENERIC[lower];
      return f;
    }
    return 'Arial';
  }
  const webFamilies = new Set();
  try {
    document.fonts.forEach((face: any) => {
      if (face.status === 'loaded') webFamilies.add(String(face.family).replace(/^["']|["']$/g, '').toLowerCase());
    });
  } catch {
    // no FontFaceSet: report no web fonts
  }
  const fontsUsed = new Map();

  // ---- what can't be made native
  const REPLACED = new Set(['img', 'svg', 'canvas', 'video', 'iframe', 'object', 'embed', 'picture', 'input', 'textarea', 'select', 'math']);
  function flattenReason(el: any, cs: any): string | null {
    const tag = el.localName;
    if (tag === 'svg' || tag === 'math') return 'svg';
    if (tag === 'canvas') return 'canvas';
    if (tag === 'video' || tag === 'iframe' || tag === 'object' || tag === 'embed') return 'other';
    if (cs.transform && cs.transform !== 'none') {
      const m = /^matrix\(([^)]+)\)$/.exec(cs.transform);
      const v = m ? m[1].split(',').map((s: string) => Number.parseFloat(s)) : null;
      // A pure translation moves the element (already in its rect); anything else distorts it.
      if (!v || Math.abs(v[0] - 1) > 0.001 || Math.abs(v[1]) > 0.001 || Math.abs(v[2]) > 0.001 || Math.abs(v[3] - 1) > 0.001) return 'transformed';
    }
    if ((cs.rotate && cs.rotate !== 'none') || (cs.scale && cs.scale !== 'none')) return 'transformed';
    if (cs.writingMode && !/^horizontal/.test(cs.writingMode)) return 'transformed';
    if (cs.filter && cs.filter !== 'none') return 'filter';
    if ((cs.clipPath && cs.clipPath !== 'none') || (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) return 'clipped';
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return 'blend';
    const clip = cs.webkitBackgroundClip || cs.backgroundClip;
    if (clip === 'text' || color(cs.webkitTextFillColor || '').alpha === 0) return 'gradient-text';
    return null;
  }

  // ---- pictures, drawn here so cropping, object-fit and rounded corners match
  function loadImage(src: string): Promise<any> {
    return new Promise((resolve) => {
      const img = new win.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  // CSS position value against free space: "50%" or "10px".
  function place(value: string, free: number): number {
    const v = String(value || '50%').trim();
    if (v.endsWith('%')) return (free * Number.parseFloat(v)) / 100;
    return px(v);
  }
  function fitBox(mode: string, nw: number, nh: number, bw: number, bh: number): { w: number; h: number } {
    if (mode === 'cover' || mode === 'contain') {
      const s = mode === 'cover' ? Math.max(bw / nw, bh / nh) : Math.min(bw / nw, bh / nh);
      return { w: nw * s, h: nh * s };
    }
    if (mode === 'none') return { w: nw, h: nh };
    if (mode === 'scale-down') {
      const s = Math.min(1, Math.min(bw / nw, bh / nh));
      return { w: nw * s, h: nh * s };
    }
    return { w: bw, h: bh }; // fill / stretch
  }
  /**
   * Draws `img` into a canvas covering `clip` (client px), with the image placed
   * at `dest` (client px) and corners rounded by `radius`; null when the
   * canvas is tainted (a cross-origin image without CORS) or the image is empty.
   */
  function draw(img: any, dest: any, clip: any, radius: number, jpeg: boolean, alpha: number): string | null {
    if (!img || !(img.naturalWidth || img.width) || clip.w < 1 || clip.h < 1) return null;
    const k = Math.min(scale, 4096 / Math.max(clip.w, clip.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(clip.w * k));
    c.height = Math.max(1, Math.round(clip.h * k));
    const g = c.getContext('2d');
    g.scale(k, k);
    if (radius > 0 && typeof g.roundRect === 'function') {
      g.beginPath();
      g.roundRect(0, 0, clip.w, clip.h, radius);
      g.clip();
    }
    g.globalAlpha = alpha;
    g.drawImage(img, dest.x - clip.x, dest.y - clip.y, dest.w, dest.h);
    try {
      return jpeg && radius === 0 && alpha >= 0.999 ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
    } catch {
      return null;
    }
  }
  const looksJpeg = (src: string): boolean => /^data:image\/jpe?g|\.jpe?g(\?|#|$)/i.test(src);
  /** The visible part of `r` after overflow-clipping ancestors, and the clipping radius when one rounds it exactly. */
  function visibleClip(el: any, r: any): any {
    let clip = { x: r.x, y: r.y, w: r.w, h: r.h };
    let radius = 0;
    for (let a = el.parentElement; a && a !== slide.parentElement; a = a.parentElement) {
      const acs = win.getComputedStyle(a);
      if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
      const ar = rectOf(a.getBoundingClientRect());
      const x = Math.max(clip.x, ar.x);
      const y = Math.max(clip.y, ar.y);
      const x2 = Math.min(clip.x + clip.w, ar.x + ar.w);
      const y2 = Math.min(clip.y + clip.h, ar.y + ar.h);
      clip = { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
      const ar0 = px(acs.borderTopLeftRadius);
      if (ar0 > 0) {
        const fills = Math.abs(clip.x - ar.x) < 1 && Math.abs(clip.y - ar.y) < 1 && Math.abs(clip.w - ar.w) < 1 && Math.abs(clip.h - ar.h) < 1;
        if (!fills) return null; // a rounded window onto part of the image: leave it to the background picture
        radius = Math.max(radius, String(acs.borderTopLeftRadius).endsWith('%') ? (Math.min(ar.w, ar.h) * Number.parseFloat(acs.borderTopLeftRadius)) / 100 : ar0);
      }
    }
    return { clip, radius };
  }
  const pending: Array<Promise<void>> = [];

  // ---- text
  const isInlineDisplay = (d: string): boolean => d === 'inline' || d === 'contents';
  function transform(text: string, tt: string): string {
    if (tt === 'uppercase') return text.toUpperCase();
    if (tt === 'lowercase') return text.toLowerCase();
    if (tt === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_m: string, s: string, ch: string) => s + ch.toUpperCase());
    return text;
  }
  // Faded text over a solid colour is written as the solid colour it looks like: easier to edit, and some
  // renderers clip transparent text to its box. Over a picture or gradient it keeps its transparency.
  const backdropCache = new Map();
  function backdrop(el: any): any {
    if (backdropCache.has(el)) return backdropCache.get(el);
    let found: any = null;
    for (let a = el; a; a = a.parentElement) {
      const acs = win.getComputedStyle(a);
      if (acs.backgroundImage && acs.backgroundImage !== 'none') break;
      const c = color(acs.backgroundColor);
      if (c.alpha >= 0.999) {
        found = c;
        break;
      }
      if (c.alpha > 0) break;
    }
    backdropCache.set(el, found);
    return found;
  }
  function solidOver(c: any, under: any): any {
    if (c.alpha >= 0.999 || !under) return c;
    const mix = (i: number): number => Math.round(Number.parseInt(c.hex.slice(i, i + 2), 16) * c.alpha + Number.parseInt(under.hex.slice(i, i + 2), 16) * (1 - c.alpha));
    const hex = [0, 2, 4].map((i) => {
      const n = mix(i);
      return (n < 16 ? '0' : '') + n.toString(16);
    });
    return { hex: hex.join('').toUpperCase(), alpha: 1 };
  }
  function runStyle(cs: any, alpha: number, el: any): any {
    const deco = String(cs.textDecorationLine || cs.textDecoration || '');
    const family = fontName(cs.fontFamily);
    const lower = family.toLowerCase();
    if (!fontsUsed.has(lower)) fontsUsed.set(lower, { name: family, webFont: webFamilies.has(lower) });
    return {
      font: family,
      size: px(cs.fontSize),
      weight: Number.parseInt(cs.fontWeight, 10) || 400,
      italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
      underline: deco.indexOf('underline') >= 0,
      strike: deco.indexOf('line-through') >= 0,
      color: solidOver(fade(color(cs.color), alpha), backdrop(el)),
      letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
    };
  }
  /** Collects the inline runs of a text block; text nodes go to `nodes`, inline elements to `inlines`. */
  function collectRuns(el: any, acc: any[], nodes: any[], inlines: any[], alpha: number): void {
    const cs = win.getComputedStyle(el);
    const pre = /^pre/.test(cs.whiteSpace) || cs.whiteSpace === 'break-spaces';
    for (const n of Array.prototype.slice.call(el.childNodes)) {
      if (n.nodeType === 3) {
        const raw = String(n.textContent || '');
        if (!raw.trim() && !pre && !/\S/.test(raw) && acc.length === 0) continue;
        nodes.push(n);
        const style = runStyle(cs, alpha, el);
        if (pre) {
          raw.split('\n').forEach((line: string, i: number) => acc.push({ ...style, text: transform(line, cs.textTransform), breakBefore: i > 0 }));
        } else {
          const text = raw.replace(/\s+/g, ' ');
          if (text) acc.push({ ...style, text: transform(text, cs.textTransform) });
        }
      } else if (n.nodeType === 1) {
        if (n.localName === 'br') {
          acc.push({ ...runStyle(cs, alpha, el), text: '', breakBefore: true });
          continue;
        }
        if (REPLACED.has(n.localName) || n.matches(notesSelector)) continue;
        const ccs = win.getComputedStyle(n);
        if (ccs.display === 'none' || !isInlineDisplay(ccs.display)) continue;
        if (flattenReason(n, ccs)) continue;
        inlines.push(n);
        collectRuns(n, acc, nodes, inlines, alpha * opacityOf(ccs));
      }
    }
  }
  function hasOwnText(el: any): boolean {
    for (const n of Array.prototype.slice.call(el.childNodes)) {
      if (n.nodeType === 3 && String(n.textContent).trim()) return true;
      if (n.nodeType === 1 && !REPLACED.has(n.localName) && n.localName !== 'br') {
        const ccs = win.getComputedStyle(n);
        if (ccs.display !== 'none' && isInlineDisplay(ccs.display) && !flattenReason(n, ccs) && String(n.textContent).trim()) return true;
      }
    }
    return false;
  }
  function addText(el: any, cs: any, r: any, alpha: number): void {
    const acc: any[] = [];
    const nodes: any[] = [];
    const inlines: any[] = [];
    collectRuns(el, acc, nodes, inlines, alpha);
    // Trim the block's leading and trailing spaces, and spaces after a break.
    while (acc.length && acc[0].text.trim() === '' && !acc[0].breakBefore) acc.shift();
    if (acc.length) acc[0].text = acc[0].text.replace(/^\s+/, '');
    for (let i = 1; i < acc.length; i++) if (acc[i].breakBefore || (acc[i - 1].breakBefore && acc[i - 1].text === '')) acc[i].text = acc[i].text.replace(/^\s+/, '');
    if (acc.length) acc[acc.length - 1].text = acc[acc.length - 1].text.replace(/\s+$/, '');
    if (!acc.some((a: any) => a.text.trim())) return;

    // Lines and the text's own extent, from the text nodes' line boxes.
    const range = document.createRange();
    const lineRects: any[] = [];
    for (const n of nodes) {
      range.selectNodeContents(n);
      for (const lr of Array.prototype.slice.call(range.getClientRects())) if (lr.width > 0 && lr.height > 0) lineRects.push(rectOf(lr));
    }
    if (lineRects.length === 0) return;
    const lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
    const tops: number[] = [];
    for (const lr of lineRects.slice().sort((a: any, b: any) => a.y - b.y)) {
      if (!tops.some((t) => Math.abs(t - lr.y) < Math.max(2, lh / 2))) tops.push(lr.y);
    }
    const x1 = Math.min(...lineRects.map((q: any) => q.x));
    const y1 = Math.min(...lineRects.map((q: any) => q.y));
    const x2 = Math.max(...lineRects.map((q: any) => q.x + q.w));
    const first = lineRects.filter((q: any) => Math.abs(q.y - y1) < 1).reduce((m: any, q: any) => (q.h > m.h ? q : m), lineRects[0]);
    // Rects are the glyph content area; the line box adds half the leading above it.
    const top = y1 - Math.max(0, (lh - first.h) / 2);
    const lines = tops.length;
    const contentX = r.x + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const contentW = r.w - px(cs.borderLeftWidth) - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderRightWidth);
    const rect = lines <= 1 ? { x: x1, y: top, w: x2 - x1, h: lh } : { x: Math.min(contentX, x1), y: top, w: Math.max(contentW, x2 - x1), h: lines * lh };
    const ta = cs.textAlign;
    const align = ta === 'center' || ta === '-webkit-center' ? 'center' : ta === 'right' || ta === 'end' || ta === '-webkit-right' ? 'right' : ta === 'justify' ? 'justify' : 'left';
    const text: any = { rect, runs: acc, align, lineHeight: lh, lines };
    // An outside list marker becomes a PowerPoint bullet (and is hidden with the text); others stay on the background picture.
    if (cs.display === 'list-item' && cs.listStylePosition === 'outside' && (!cs.listStyleImage || cs.listStyleImage === 'none')) {
      const type = String(cs.listStyleType);
      const CHARS: any = { disc: '•', circle: '◦', square: '▪' };
      const NUMBERS: any = { decimal: 'arabicPeriod', 'lower-alpha': 'alphaLcPeriod', 'lower-latin': 'alphaLcPeriod', 'upper-alpha': 'alphaUcPeriod', 'upper-latin': 'alphaUcPeriod', 'lower-roman': 'romanLcPeriod', 'upper-roman': 'romanUcPeriod' };
      const size = px(cs.fontSize);
      if (CHARS[type]) {
        text.bullet = { kind: 'char', char: CHARS[type], indent: size * 1.1 };
      } else if (NUMBERS[type]) {
        let start = 1;
        const list = el.parentElement;
        if (list && list.localName === 'ol') {
          const s0 = Number.parseInt(list.getAttribute('start') || '1', 10);
          start = (Number.isFinite(s0) ? s0 : 1) + Array.prototype.slice.call(list.children).filter((c: any) => c.localName === 'li').indexOf(el);
        }
        text.bullet = { kind: 'number', style: NUMBERS[type], start, indent: size * 1.6 };
      }
      if (text.bullet) {
        text.rect = { x: text.rect.x - text.bullet.indent, y: text.rect.y, w: text.rect.w + text.bullet.indent, h: text.rect.h };
        state.hide.push({ el, marker: true });
      }
    }
    out.texts.push(text);
    for (const n of nodes) state.textNodes.push(n);
    state.decorated.push(el, ...inlines);
    el.setAttribute('data-od-ppt-text', '');
  }

  // ---- boxes
  function addBox(el: any, cs: any, r: any, isInline: boolean, alpha: number): void {
    const bg = cs.backgroundImage && cs.backgroundImage !== 'none' ? String(cs.backgroundImage) : '';
    const gradient = /gradient\(/.test(bg);
    const fill = fade(color(cs.backgroundColor), alpha);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
      w: px(cs['border' + s + 'Width']),
      style: cs['border' + s + 'Style'],
      color: cs['border' + s + 'Color'],
    }));
    const visible = (s: any): boolean => s.w > 0 && s.style !== 'none' && s.style !== 'hidden' && color(s.color).alpha > 0;
    const drawable = (s: any): boolean => s.style === 'solid' || s.style === 'dashed' || s.style === 'dotted';
    const anyBorder = sides.some(visible);
    const uniform = sides.every((s) => visible(s) && drawable(s) && s.w === sides[0].w && s.style === sides[0].style && s.color === sides[0].color);
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
    const sameRadii = radii.every((v: string) => v === radii[0]);
    const r0 = String(radii[0]).endsWith('%') ? (Math.min(r.w, r.h) * Number.parseFloat(radii[0])) / 100 : px(radii[0]);
    const radius = Math.min(r0, Math.min(r.w, r.h) / 2);
    const backdrop = (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
    const hide: any = { el };
    const fillOk = fill.alpha > 0 && !gradient && !backdrop && sameRadii && !isInline;
    if (fillOk || (uniform && sameRadii && !isInline && !backdrop)) {
      out.boxes.push({ z: order, hideRef: hide, rect: r, fill: fillOk ? fill : undefined, radius, line: uniform ? { width: sides[0].w, color: fade(color(sides[0].color), alpha), dash: sides[0].style === 'solid' ? 'solid' : sides[0].style === 'dashed' ? 'dash' : 'dot' } : undefined });
      if (fillOk) hide.bg = true;
      if (uniform) hide.border = true;
    } else if (fill.alpha > 0 && isInline && !gradient && el.getClientRects().length === 1) {
      out.boxes.push({ z: order, hideRef: hide, rect: r, fill, radius: sameRadii ? radius : 0 });
      hide.bg = true;
    }
    // Side borders (an accent bar on the left of a card): thin rectangles, square corners only.
    // Not for CSS triangles (a zero-size box drawn with borders): those stay on the background picture.
    const innerW = r.w - sides[1].w - sides[3].w;
    const innerH = r.h - sides[0].w - sides[2].w;
    if (!uniform && anyBorder && radius === 0 && !isInline && innerW >= 1 && innerH >= 1) {
      const bars = [
        { x: r.x, y: r.y, w: r.w, h: sides[0].w },
        { x: r.x + r.w - sides[1].w, y: r.y, w: sides[1].w, h: r.h },
        { x: r.x, y: r.y + r.h - sides[2].w, w: r.w, h: sides[2].w },
        { x: r.x, y: r.y, w: sides[3].w, h: r.h },
      ];
      if (sides.every((s) => !visible(s) || s.style === 'solid')) {
        sides.forEach((s, i) => {
          if (visible(s)) out.boxes.push({ z: order, hideRef: hide, rect: bars[i], fill: fade(color(s.color), alpha), radius: 0 });
        });
        hide.border = true;
      }
    }
    // One url() background layer: a picture, cropped like CSS does.
    const m = /^url\("?(.*?)"?\)$/.exec(bg);
    if (m && !isInline && sameRadii) {
      const src = m[1];
      const clipInfo = visibleClip(el, r);
      if (clipInfo && onStage(clipInfo.clip)) {
        const bl = px(cs.borderLeftWidth);
        const bt = px(cs.borderTopWidth);
        const area = { x: r.x + bl, y: r.y + bt, w: r.w - bl - px(cs.borderRightWidth), h: r.h - bt - px(cs.borderBottomWidth) };
        const repeat = String(cs.backgroundRepeat);
        const size = String(cs.backgroundSize);
        if (/no-repeat/.test(repeat) || size === 'cover') {
          hide.bgimg = true;
          const z = order;
          pending.push(
            loadImage(src).then((img: any) => {
              if (!img) {
                hide.bgimg = false;
                return;
              }
              let box: any;
              if (size === 'cover' || size === 'contain') box = fitBox(size, img.naturalWidth, img.naturalHeight, area.w, area.h);
              else if (size === 'auto' || size === 'auto auto') box = { w: img.naturalWidth, h: img.naturalHeight };
              else {
                const parts = size.split(/\s+/);
                const w = parts[0].endsWith('%') ? (area.w * Number.parseFloat(parts[0])) / 100 : px(parts[0]);
                const h = parts[1] && parts[1] !== 'auto' ? (parts[1].endsWith('%') ? (area.h * Number.parseFloat(parts[1])) / 100 : px(parts[1])) : (w * img.naturalHeight) / img.naturalWidth;
                box = { w, h };
              }
              const dest = { x: area.x + place(cs.backgroundPositionX, area.w - box.w), y: area.y + place(cs.backgroundPositionY, area.h - box.h), w: box.w, h: box.h };
              const clip = clipInfo.clip;
              const data = draw(img, dest, clip, Math.max(radius, clipInfo.radius), looksJpeg(src), alpha);
              if (!data) {
                hide.bgimg = false;
                return;
              }
              out.pictures.push({ rect: clip, data, z, hideRef: hide });
            }),
          );
        }
      }
    }
    if (hide.bg || hide.border || hide.bgimg) state.hide.push(hide);
  }

  function addImage(el: any, cs: any, r: any, alpha: number): void {
    const clipInfo = visibleClip(el, r);
    if (!clipInfo || !onStage(clipInfo.clip) || !el.complete || !el.naturalWidth) return;
    const bl = px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const bt = px(cs.borderTopWidth) + px(cs.paddingTop);
    const content = { x: r.x + bl, y: r.y + bt, w: r.w - bl - px(cs.borderRightWidth) - px(cs.paddingRight), h: r.h - bt - px(cs.borderBottomWidth) - px(cs.paddingBottom) };
    const box = fitBox(cs.objectFit, el.naturalWidth, el.naturalHeight, content.w, content.h);
    const pos = String(cs.objectPosition || '50% 50%').split(/\s+/);
    const dest = { x: content.x + place(pos[0], content.w - box.w), y: content.y + place(pos[1] || '50%', content.h - box.h), w: box.w, h: box.h };
    const ownRadius = px(cs.borderTopLeftRadius);
    const radius = Math.max(clipInfo.radius, ownRadius > 0 ? (String(cs.borderTopLeftRadius).endsWith('%') ? (Math.min(r.w, r.h) * Number.parseFloat(cs.borderTopLeftRadius)) / 100 : ownRadius) : 0);
    // contain/none leave empty margins: place the picture on the drawn part only.
    const x = Math.max(clipInfo.clip.x, dest.x);
    const y = Math.max(clipInfo.clip.y, dest.y);
    const clip = { x, y, w: Math.min(clipInfo.clip.x + clipInfo.clip.w, dest.x + dest.w) - x, h: Math.min(clipInfo.clip.y + clipInfo.clip.h, dest.y + dest.h) - y };
    const data = draw(el, dest, clip, radius, looksJpeg(el.currentSrc || el.src || ''), alpha);
    if (!data) return; // cross-origin without CORS: stays on the background picture
    const hide = { el, img: true };
    out.pictures.push({ rect: clip, data, z: order, hideRef: hide });
    state.hide.push(hide);
  }

  // ---- the walk
  let order = 0;
  const flatRects: any[] = [];
  function walk(el: any, consumed: boolean, parentAlpha: number): void {
    if (el.matches(notesSelector)) return;
    const tag = el.localName;
    if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript' || tag === 'head') return;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') return;
    const alpha = parentAlpha * opacityOf(cs);
    if (alpha < 0.001) return;
    order++;
    const r = rectOf(el.getBoundingClientRect());
    if (el !== slide) {
      const reason = flattenReason(el, cs);
      if (reason) {
        if (onStage(r) && (String(el.textContent || '').trim() || reason === 'svg' || reason === 'canvas' || reason === 'other')) {
          out.flattened.push({ reason, label: label(el) });
          flatRects.push({ z: order, rect: r });
        }
        el.setAttribute('data-od-ppt-flat', '');
        return;
      }
    }
    const shown = cs.visibility === 'visible';
    if (tag === 'img') {
      if (shown && onStage(r)) addImage(el, cs, r, alpha);
      return;
    }
    if (REPLACED.has(tag)) return; // form controls and <picture> wrappers: background picture
    if (shown && el !== slide && (onStage(r) || consumed)) addBox(el, cs, consumed ? rectOf(el.getClientRects()[0] || el.getBoundingClientRect()) : r, consumed, alpha);
    if (shown && !consumed && !isInlineDisplay(cs.display) && hasOwnText(el)) addText(el, cs, r, alpha);
    const textBlock = !consumed && el.hasAttribute('data-od-ppt-text');
    for (const c of Array.prototype.slice.call(el.children)) {
      const ccs = win.getComputedStyle(c);
      const inlineChild = isInlineDisplay(ccs.display) && !REPLACED.has(c.localName);
      walk(c, (textBlock || consumed) && inlineChild, alpha);
    }
  }

  // Slide background: the first solid colour from the slide outwards.
  for (let a = slide; a; a = a.parentElement) {
    const c = color(win.getComputedStyle(a).backgroundColor);
    if (c.alpha > 0) {
      out.background = { hex: c.hex, alpha: 1 };
      break;
    }
  }
  walk(slide, false, 1);
  await Promise.all(pending);

  // A native shape or picture painted below something flattened would cover it (the flattened part is on
  // the background picture, under every native object): leave such shapes and pictures on the picture too.
  const overlaps = (a: any, b: any): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const covers = (item: any): boolean => flatRects.some((f: any) => f.z > item.z && overlaps(item.rect, f.rect));
  const demoted = new Set();
  for (const b of out.boxes) if (covers(b)) demoted.add(b.hideRef);
  for (const p of out.pictures) if (covers(p)) demoted.add(p.hideRef);
  for (const h of demoted) {
    const rec: any = h;
    rec.bg = false;
    rec.border = false;
    rec.bgimg = false;
    rec.img = false;
  }
  out.boxes = out.boxes.filter((b: any) => !demoted.has(b.hideRef));
  out.pictures = out.pictures.filter((p: any) => !demoted.has(p.hideRef));
  for (const b of out.boxes) delete b.hideRef;
  for (const p of out.pictures) delete p.hideRef;

  // Text coverage: every visible text is in a text box or inside something flattened.
  const covered = new Set(state.textNodes);
  const walker = document.createTreeWalker(slide, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = String(n.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || covered.has(n)) continue;
    const p = n.parentElement;
    if (!p || p.closest('[data-od-ppt-flat]') || p.closest(notesSelector)) continue;
    const pl = p.localName;
    if (pl === 'script' || pl === 'style' || pl === 'template' || pl === 'noscript' || pl === 'option') continue;
    if (p.getClientRects().length === 0 || win.getComputedStyle(p).visibility !== 'visible') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const br = rectOf(range.getBoundingClientRect());
    if (!onStage(br)) continue;
    out.uncovered.push(t.length > 60 ? t.slice(0, 60) + '…' : t);
  }
  out.fonts = Array.from(fontsUsed.values());
  return out;
}

/**
 * Hides what readSlideScene made native — text (each text node wrapped in a
 * transparent span, so markers, pseudo-elements and other text stay), box
 * fills and borders, pictures — and records how to undo it.
 */
export function hideSceneObjects(): number {
  const state = window.__odPptScene;
  if (!state) return 0;
  const saved: any[] = [];
  state.saved = saved;
  state.wrappers = [];
  const set = (el: any, prop: string, value: string): void => {
    saved.push({ el, prop, value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop), hadStyle: el.hasAttribute('style') });
    el.style.setProperty(prop, value, 'important');
  };
  for (const n of state.textNodes) {
    if (!n.parentNode) continue;
    const span = document.createElement('span');
    span.setAttribute('data-od-ppt-wrap', '');
    span.style.cssText = 'color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;text-decoration-color:transparent!important';
    n.parentNode.insertBefore(span, n);
    span.appendChild(n);
    state.wrappers.push(span);
  }
  // Underlines are painted by the decorating element, not the text: hide those lines too.
  for (const el of state.decorated) set(el, 'text-decoration-color', 'transparent');
  for (const h of state.hide) {
    if (h.bg) set(h.el, 'background-color', 'transparent');
    if (h.border) set(h.el, 'border-color', 'transparent');
    if (h.bgimg) set(h.el, 'background-image', 'none');
    if (h.img) set(h.el, 'visibility', 'hidden');
    if (h.marker) set(h.el, 'list-style-type', 'none');
  }
  return state.textNodes.length + state.hide.length;
}

/** Undoes hideSceneObjects and forgets the scene. */
export function restoreSceneObjects(): void {
  const state = window.__odPptScene;
  if (!state) return;
  for (const span of state.wrappers || []) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    span.remove();
  }
  const saved = state.saved || [];
  for (let i = saved.length - 1; i >= 0; i--) {
    const s = saved[i];
    if (s.value) s.el.style.setProperty(s.prop, s.value, s.priority);
    else s.el.style.removeProperty(s.prop);
    if (!s.hadStyle && !s.el.getAttribute('style')) s.el.removeAttribute('style');
  }
  document.querySelectorAll('[data-od-ppt-text],[data-od-ppt-flat]').forEach((el: any) => {
    el.removeAttribute('data-od-ppt-text');
    el.removeAttribute('data-od-ppt-flat');
  });
  window.__odPptScene = undefined;
}
