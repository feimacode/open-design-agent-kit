// Ported from open-design's own web clipper (/home/iven/tools/open-design/
// clipper/capture.js's buildFigmaIr()) — the producer of the ".od-figma.json"
// capture IR documented in figma-plugin/IR.md, which a separate, vendored
// Figma plugin (assets/figma-plugin/) rebuilds into real Figma layers. This
// module must stay structurally compatible with that IR; it is NOT a
// reinterpretation of the format, just a retargeted producer.
//
// Adapted to walk THIS extension's own artifact preview iframe instead of a
// live top-level browser tab:
//  - Scroll/viewport reads use the iframe's own window
//    (iframeDoc.defaultView), never the outer webview's window.
//  - getComputedStyle() is called unqualified (unbound global) — per spec it
//    resolves against the element's own node document regardless of which
//    window's global called it, the same cross-realm-but-same-origin access
//    this extension's hover/selection code (main.ts) already relies on.
//  - Image fills carry the element's RAW src/background-image reference
//    (relative workspace path, data: URI, or absolute URL) as a `url`
//    placeholder. An already-inlined `data:` reference is used directly as
//    `dataUri`, skipping resolution. Anything else is resolved later, once,
//    by the extension host against the artifact's own files — no shared
//    "resources" fetch-dedup queue like the original (this isn't fetching
//    cross-origin bytes from inside a sandboxed page).
//  - No "skip our own injected UI" guard — nothing of this extension's own
//    is ever injected INTO the artifact's iframe document, unlike a live web
//    page carrying the clipper's own on-page toolbar.

const IR_VERSION = 1;
const MAX_NODES = 6000;

export interface FigmaCaptureColor {
  r: number;
  g: number;
  b: number;
}

export type FigmaCapturePaint = { type: 'SOLID'; color: FigmaCaptureColor; opacity?: number } | { type: 'IMAGE'; scaleMode: string; url?: string; dataUri?: string };

export interface FigmaCaptureEffect {
  type: 'DROP_SHADOW';
  color: FigmaCaptureColor & { a: number };
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

export interface FigmaCaptureCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

interface FigmaCaptureBoxFields {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: FigmaCapturePaint[];
  strokes?: FigmaCapturePaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: FigmaCaptureCornerRadii;
  effects?: FigmaCaptureEffect[];
  opacity?: number;
}

export interface FigmaCaptureFrameNode extends FigmaCaptureBoxFields {
  type: 'FRAME';
  clipsContent?: boolean;
  children?: FigmaCaptureNode[];
}

export interface FigmaCaptureTextNode {
  type: 'TEXT';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  characters: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  color: FigmaCaptureColor;
  opacity?: number;
}

export type FigmaCaptureNode = FigmaCaptureFrameNode | FigmaCaptureTextNode;

export interface FigmaCaptureDocument {
  version: 1;
  source: { url: string; title: string; capturedAt: number; viewport: { width: number; height: number }; dpr: number };
  fonts: Array<{ family: string; styles: string[] }>;
  root: FigmaCaptureFrameNode;
}

export interface FigmaCaptureResult {
  capture: FigmaCaptureDocument;
  nodeCount: number;
  truncated: boolean;
}

function isDataUri(ref: string): boolean {
  return /^data:/i.test(ref);
}

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(str: string | undefined): ParsedColor | null {
  if (!str) return null;
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(str);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return { r: Math.min(1, Number(m[1]) / 255), g: Math.min(1, Number(m[2]) / 255), b: Math.min(1, Number(m[3]) / 255), a: Number.isFinite(a) ? a : 1 };
}

function solidFill(color: ParsedColor | null): FigmaCapturePaint | null {
  if (!color || color.a === 0) return null;
  return { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
}

function hexToColor(hex: string): ParsedColor | null {
  const clean = hex.replace('#', '');
  if (![3, 4, 6, 8].includes(clean.length)) return null;
  const full = clean.length <= 4 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// The IR's Paint type has no GRADIENT variant (matches the vendored plugin's
// own Figma-side type — see IR.md), so a real gradient can't round-trip.
// Rather than emit nothing (transparent), this takes the gradient's first
// color stop as a best-effort approximation — visibly closer to the source
// than a missing fill, even though it flattens the gradient itself.
function firstGradientColor(image: string): ParsedColor | null {
  if (!image || !/gradient\(/i.test(image)) return null;
  const m = /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/.exec(image);
  if (!m) return null;
  return m[0].startsWith('#') ? hexToColor(m[0]) : parseColor(m[0]);
}

function uniformRadius(s: CSSStyleDeclaration): number | FigmaCaptureCornerRadii {
  const tl = px(s.borderTopLeftRadius);
  const tr = px(s.borderTopRightRadius);
  const br = px(s.borderBottomRightRadius);
  const bl = px(s.borderBottomLeftRadius);
  if (tl === tr && tr === br && br === bl) return tl;
  return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
}

function borderStroke(s: CSSStyleDeclaration): { stroke: FigmaCapturePaint; weight: number } | null {
  const w = px(s.borderTopWidth);
  if (!w || s.borderTopStyle === 'none' || s.borderTopStyle === 'hidden') return null;
  const fill = solidFill(parseColor(s.borderTopColor));
  if (!fill) return null;
  const uniform = s.borderTopWidth === s.borderRightWidth && s.borderRightWidth === s.borderBottomWidth && s.borderBottomWidth === s.borderLeftWidth;
  if (!uniform) return null;
  return { stroke: fill, weight: w };
}

function parseShadow(boxShadow: string): FigmaCaptureEffect | null {
  if (!boxShadow || boxShadow === 'none') return null;
  const first = boxShadow.split(/,(?![^(]*\))/)[0].trim();
  if (/\binset\b/.test(first)) return null;
  const colorMatch = /rgba?\([^)]+\)|#[0-9a-f]{3,8}/i.exec(first);
  const color = parseColor(colorMatch ? colorMatch[0] : '');
  const nums = (first.replace(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i, '').match(/-?[\d.]+px/g) || []).map(px);
  if (!color || nums.length < 2) return null;
  return {
    type: 'DROP_SHADOW',
    color: { r: color.r, g: color.g, b: color.b, a: color.a },
    offset: { x: nums[0] || 0, y: nums[1] || 0 },
    radius: nums[2] || 0,
    spread: nums[3] || 0,
  };
}

function fontStyleName(weight: string, italic: boolean): string {
  const w = Number(weight) || 400;
  const name = w <= 100 ? 'Thin' : w <= 200 ? 'ExtraLight' : w <= 300 ? 'Light' : w <= 400 ? 'Regular' : w <= 500 ? 'Medium' : w <= 600 ? 'SemiBold' : w <= 700 ? 'Bold' : w <= 800 ? 'ExtraBold' : 'Black';
  if (italic) return name === 'Regular' ? 'Italic' : `${name} Italic`;
  return name;
}

function firstFamily(fontFamily: string): string {
  return (fontFamily || 'Inter').split(',')[0].replace(/["']/g, '').trim() || 'Inter';
}

function isVisible(s: CSSStyleDeclaration): boolean {
  if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
  if (Number(s.opacity) === 0) return false;
  return true;
}

function textRect(node: Node, doc: Document): DOMRect | null {
  try {
    const range = doc.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect();
  } catch {
    return null;
  }
}

export interface FigmaCaptureSourceMeta {
  title: string;
}

export function captureFigmaIr(iframeDoc: Document, sourceMeta: FigmaCaptureSourceMeta): FigmaCaptureResult {
  const win = iframeDoc.defaultView;
  const sx = win?.scrollX || 0;
  const sy = win?.scrollY || 0;
  const fonts = new Map<string, Set<string>>();
  let nodeCount = 0;
  let truncated = false;

  function noteFont(family: string, style: string): void {
    if (!fonts.has(family)) fonts.set(family, new Set());
    fonts.get(family)!.add(style);
  }

  // Deliberately does NOT absolutize non-data references against the
  // iframe's own baseURI: this is a `srcdoc` iframe with no meaningful base
  // of its own (it resolves against the outer webview's URL, not the
  // artifact's real location on disk). The raw reference exactly as authored
  // — e.g. "logo.png" or "./assets/x.png" — is what the extension host needs
  // to resolve relative to the entry file's own directory, the same
  // "sibling file, relative to the entry file's directory" convention
  // register_open_design_artifact's supportingFiles already uses.
  function resolveImageRef(raw: string): { url?: string; dataUri?: string } {
    if (isDataUri(raw)) return { dataUri: raw };
    return { url: raw };
  }

  function elementNode(el: Element): FigmaCaptureNode | null {
    if (nodeCount >= MAX_NODES) {
      truncated = true;
      return null;
    }
    const s = getComputedStyle(el);
    if (!isVisible(s)) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    nodeCount += 1;
    const node: FigmaCaptureFrameNode = {
      type: 'FRAME',
      name: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
      x: rect.left + sx,
      y: rect.top + sy,
      width: rect.width,
      height: rect.height,
    };

    const fills: FigmaCapturePaint[] = [];
    let imageRef: string | null = null;
    const bgImage = s.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(bgImage);
      if (m) imageRef = m[1];
    }
    if (el.tagName === 'IMG') {
      const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
      if (src) imageRef = src;
    }
    if (imageRef) {
      fills.push({ type: 'IMAGE', scaleMode: 'FILL', ...resolveImageRef(imageRef) });
    } else {
      const bg = solidFill(parseColor(s.backgroundColor)) ?? solidFill(firstGradientColor(bgImage));
      if (bg) fills.push(bg);
    }
    if (fills.length) node.fills = fills;

    const stroke = borderStroke(s);
    if (stroke) {
      node.strokes = [stroke.stroke];
      node.strokeWeight = stroke.weight;
    }
    const radius = uniformRadius(s);
    if (typeof radius === 'number') {
      if (radius > 0) node.cornerRadius = radius;
    } else {
      node.rectangleCornerRadii = radius;
    }
    const shadow = parseShadow(s.boxShadow);
    if (shadow) node.effects = [shadow];
    const opacity = Number(s.opacity);
    if (Number.isFinite(opacity) && opacity < 1) node.opacity = opacity;
    if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') node.clipsContent = true;

    const children: FigmaCaptureNode[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1 /* ELEMENT_NODE */) {
        const childEl = child as Element;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'TITLE', 'BR', 'SVG'].includes(childEl.tagName)) continue;
        const c = elementNode(childEl);
        if (c) children.push(c);
      } else if (child.nodeType === 3 /* TEXT_NODE */) {
        const text = child.nodeValue;
        if (!text || !text.trim()) continue;
        const t = textNode(child, text, s);
        if (t) children.push(t);
      }
    }
    if (children.length) node.children = children;
    return node;
  }

  function textNode(child: Node, text: string, parentStyle: CSSStyleDeclaration): FigmaCaptureTextNode | null {
    if (nodeCount >= MAX_NODES) {
      truncated = true;
      return null;
    }
    const r = textRect(child, iframeDoc);
    if (!r || r.width <= 0 || r.height <= 0) return null;
    nodeCount += 1;
    const s = parentStyle;
    const family = firstFamily(s.fontFamily);
    const italic = s.fontStyle === 'italic' || s.fontStyle === 'oblique';
    const style = fontStyleName(s.fontWeight, italic);
    noteFont(family, style);
    const lh = s.lineHeight === 'normal' ? undefined : px(s.lineHeight);
    const ls = px(s.letterSpacing);
    const align = s.textAlign === 'center' ? 'CENTER' : s.textAlign === 'right' || s.textAlign === 'end' ? 'RIGHT' : s.textAlign === 'justify' ? 'JUSTIFIED' : 'LEFT';

    // Gradient text (background-clip: text + a transparent fill) has no
    // SOLID representation of its real `color` — the CSS `color` property
    // is usually left at its inherited/default value and never the one the
    // gradient-clipped text visually renders in, so reading it straight
    // would silently pick the wrong solid color rather than an approximate
    // one. Detect that pattern and fall back to the gradient's first stop,
    // same approximation as an element's own gradient background fill.
    const bgClip = s.getPropertyValue('-webkit-background-clip') || s.backgroundClip;
    const fillColorProp = s.getPropertyValue('-webkit-text-fill-color');
    const isClippedTransparentText = bgClip === 'text' && (fillColorProp === 'transparent' || parseColor(fillColorProp)?.a === 0);
    const gradientColor = isClippedTransparentText ? firstGradientColor(s.backgroundImage) : null;
    const color = gradientColor ?? parseColor(s.color) ?? { r: 0, g: 0, b: 0, a: 1 };

    const transform = s.textTransform;
    const transformedText =
      transform === 'uppercase' ? text.toUpperCase() : transform === 'lowercase' ? text.toLowerCase() : transform === 'capitalize' ? text.replace(/\b\w/g, (c) => c.toUpperCase()) : text;

    const node: FigmaCaptureTextNode = {
      type: 'TEXT',
      name: transformedText.trim().slice(0, 40),
      x: r.left + sx,
      y: r.top + sy,
      width: Math.ceil(r.width) + 1,
      height: Math.ceil(r.height),
      characters: transformedText.replace(/\s+/g, ' ').trim(),
      fontFamily: family,
      fontStyle: style,
      fontSize: px(s.fontSize) || 16,
      textAlign: align,
      color: { r: color.r, g: color.g, b: color.b },
      opacity: gradientColor ? 1 : color.a,
    };
    if (lh) node.lineHeight = lh;
    if (ls) node.letterSpacing = ls;
    return node;
  }

  const root =
    (elementNode(iframeDoc.body) as FigmaCaptureFrameNode | null) ??
    ({ type: 'FRAME', name: 'body', x: 0, y: 0, width: iframeDoc.documentElement.scrollWidth, height: iframeDoc.documentElement.scrollHeight } as FigmaCaptureFrameNode);

  const capture: FigmaCaptureDocument = {
    version: IR_VERSION,
    source: {
      url: iframeDoc.URL,
      title: sourceMeta.title,
      capturedAt: Date.now(),
      viewport: { width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 },
      dpr: win?.devicePixelRatio || 1,
    },
    fonts: Array.from(fonts.entries()).map(([family, styles]) => ({ family, styles: Array.from(styles) })),
    root,
  };

  return { capture, nodeCount, truncated };
}
