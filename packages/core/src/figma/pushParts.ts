// Turns a Figma capture into ready-to-run `use_figma` code parts (openspec
// connect-figma). Figma's MCP server runs Plugin API JavaScript per call, with
// no state between calls and at most 50,000 characters of code, so:
//  - every part carries the builder and preloads the fonts again;
//  - every non-text layer is named with a marker ` ⟦od:<run>:<path>⟧`, which
//    later parts use to find their parent and the clean-up part strips;
//  - images leave the capture as files; their layers get a placeholder fill
//    and the clean-up part returns which node ids need which image, for
//    `upload_assets`.
// The builder logic is the vendored "OD Figma Import" plugin's
// (packages/vscode/assets/figma-plugin/code.js), extended as above; a test
// keeps the two in step. Tested live against Figma's server on 2026-10-10.
import type { FigmaCaptureDocument, FigmaCaptureNode, FigmaCapturePaint } from '../workspace/figmaCapture';

export const FIGMA_PART_MAX_CHARS = 30000;

/** Plugin API code shared by every part. Plain ES2020, no closePlugin, no UI. */
export const FIGMA_PUSH_BUILDER = String.raw`
let LOADED_FONTS = new Set();
const FAILED_FONTS = [];
const fontKey = (family, style) => family + ' ' + style;
async function tryLoadFont(family, style, quiet) {
  const key = fontKey(family, style);
  if (LOADED_FONTS.has(key)) return true;
  try {
    await figma.loadFontAsync({ family, style });
    LOADED_FONTS.add(key);
    return true;
  } catch (e) {
    if (!quiet) FAILED_FONTS.push(key);
    return false;
  }
}
// Inter (the fallback) spells some styles with a space.
const INTER_STYLE = { SemiBold: 'Semi Bold', ExtraBold: 'Extra Bold', ExtraLight: 'Extra Light', 'SemiBold Italic': 'Semi Bold Italic', 'ExtraBold Italic': 'Extra Bold Italic', 'ExtraLight Italic': 'Extra Light Italic' };
const interStyle = (style) => INTER_STYLE[style] || style;
async function preloadFonts(fonts) {
  await tryLoadFont('Inter', 'Regular', true);
  for (const f of fonts || []) {
    if (!f || !f.family) continue;
    const styles = f.styles && f.styles.length ? f.styles : ['Regular'];
    for (const style of styles) {
      if (!(await tryLoadFont(f.family, style))) await tryLoadFont('Inter', interStyle(style), true);
    }
  }
}
// A missing font falls back to Inter in the same weight and style when Figma has it, keeping bold text bold.
function resolveFont(family, style) {
  if (LOADED_FONTS.has(fontKey(family, style))) return { family, style };
  if (LOADED_FONTS.has(fontKey(family, 'Regular'))) return { family, style: 'Regular' };
  if (LOADED_FONTS.has(fontKey('Inter', interStyle(style)))) return { family: 'Inter', style: interStyle(style) };
  return { family: 'Inter', style: 'Regular' };
}
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function solidPaint(fill) {
  if (!fill || !fill.color) return null;
  const c = fill.color;
  return { type: 'SOLID', color: { r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) }, opacity: fill.opacity == null ? 1 : clamp01(fill.opacity) };
}
function toPaints(fills) {
  const out = [];
  for (const f of fills || []) {
    if (f && f.type === 'IMAGE_REF') {
      out.push({ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 });
      continue;
    }
    const paint = f && f.type === 'SOLID' ? solidPaint(f) : null;
    if (paint) out.push(paint);
  }
  return out;
}
function toEffects(effects) {
  const out = [];
  for (const e of effects || []) {
    if (!e || e.type !== 'DROP_SHADOW') continue;
    const c = e.color || { r: 0, g: 0, b: 0, a: 0.25 };
    out.push({
      type: 'DROP_SHADOW',
      color: { r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b), a: c.a == null ? 0.25 : clamp01(c.a) },
      offset: { x: (e.offset && e.offset.x) || 0, y: (e.offset && e.offset.y) || 0 },
      radius: Math.max(0, e.radius || 0),
      spread: Math.max(0, e.spread || 0),
      visible: true,
      blendMode: 'NORMAL',
    });
  }
  return out;
}
function safeResize(node, w, h) {
  const width = Math.max(1, Math.round(Number(w) || 1));
  const height = Math.max(1, Math.round(Number(h) || 1));
  try { node.resize(width, height); } catch (e) {}
}
function applyBoxProps(node, spec) {
  const fills = toPaints(spec.fills);
  if ('fills' in node) node.fills = fills;
  if (spec.strokes && 'strokes' in node) {
    const strokes = toPaints(spec.strokes);
    if (strokes.length) {
      node.strokes = strokes;
      if (spec.strokeWeight && 'strokeWeight' in node) node.strokeWeight = spec.strokeWeight;
    }
  }
  if ('cornerRadius' in node && typeof spec.cornerRadius === 'number') node.cornerRadius = spec.cornerRadius;
  if (spec.rectangleCornerRadii && 'topLeftRadius' in node) {
    const r = spec.rectangleCornerRadii;
    node.topLeftRadius = r.topLeft || 0;
    node.topRightRadius = r.topRight || 0;
    node.bottomRightRadius = r.bottomRight || 0;
    node.bottomLeftRadius = r.bottomLeft || 0;
  }
  const effects = toEffects(spec.effects);
  if (effects.length && 'effects' in node) node.effects = effects;
  if (typeof spec.opacity === 'number' && 'opacity' in node) node.opacity = spec.opacity;
}
const marker = (path) => ' ⟦od:' + RUN + ':' + path + '⟧';
function findMarked(path) {
  const suffix = marker(path);
  return figma.currentPage.findOne((n) => n.name.endsWith(suffix));
}
let CREATED = 0;
async function buildNode(spec, parent, pax, pay, path) {
  try {
    if (spec.type === 'TEXT') {
      const t = figma.createText();
      t.fontName = resolveFont(spec.fontFamily || 'Inter', spec.fontStyle || 'Regular');
      t.characters = spec.characters || '';
      if (spec.fontSize) t.fontSize = Math.max(1, spec.fontSize);
      if (spec.lineHeight) t.lineHeight = { value: spec.lineHeight, unit: 'PIXELS' };
      if (spec.letterSpacing) t.letterSpacing = { value: spec.letterSpacing, unit: 'PIXELS' };
      t.textAlignHorizontal = spec.textAlign || 'LEFT';
      const color = spec.color || { r: 0, g: 0, b: 0 };
      t.fills = [{ type: 'SOLID', color: { r: clamp01(color.r), g: clamp01(color.g), b: clamp01(color.b) }, opacity: spec.opacity == null ? 1 : clamp01(spec.opacity) }];
      t.textAutoResize = 'NONE';
      safeResize(t, spec.width, spec.height);
      parent.appendChild(t);
      t.x = (spec.x || 0) - pax;
      t.y = (spec.y || 0) - pay;
      CREATED++;
      return t;
    }
    const hasChildren = Array.isArray(spec.children) && spec.children.length;
    const node = spec.type === 'RECTANGLE' && !hasChildren ? figma.createRectangle() : figma.createFrame();
    node.name = (spec.name || spec.type.toLowerCase()) + marker(path);
    if (node.type === 'FRAME') {
      node.clipsContent = Boolean(spec.clipsContent);
      node.fills = [];
    }
    safeResize(node, spec.width, spec.height);
    applyBoxProps(node, spec);
    parent.appendChild(node);
    node.x = (spec.x || 0) - pax;
    node.y = (spec.y || 0) - pay;
    CREATED++;
    if (hasChildren && node.type === 'FRAME') {
      const ax = spec.x || 0;
      const ay = spec.y || 0;
      for (let i = 0; i < spec.children.length; i++) await buildNode(spec.children[i], node, ax, ay, path + '.' + i);
    }
    return node;
  } catch (e) {
    return null;
  }
}
`;

/** A capture node whose IMAGE paints were replaced by references to extracted files. */
type PushPaint = FigmaCapturePaint | { type: 'IMAGE_REF'; ref: number; scaleMode: string };

export interface FigmaPushImage {
  ref: number;
  /** Marker path of the layer that receives it. */
  path: string;
  mimeType: string;
  ext: string;
  bytes: Buffer;
  scaleMode: string;
}

export interface FigmaPushParts {
  runId: string;
  /** use_figma code, in run order; the last one is the clean-up part. */
  parts: string[];
  images: FigmaPushImage[];
  nodeCount: number;
}

interface Job {
  parentPath: string;
  parentAbs: { x: number; y: number };
  path: string;
  node: unknown;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

/** Copies the capture tree, moving every decodable IMAGE fill out into `images`. Undecodable fills are dropped, as the plugin drops them. */
function extractImages(node: FigmaCaptureNode, path: string, images: FigmaPushImage[]): unknown {
  if (node.type === 'TEXT') return node;
  const paints = (list: FigmaCapturePaint[] | undefined): PushPaint[] | undefined => {
    if (!list) return list;
    const out: PushPaint[] = [];
    for (const p of list) {
      if (p.type !== 'IMAGE') {
        out.push(p);
        continue;
      }
      const m = p.dataUri ? /^data:([^;,]+);base64,(.*)$/s.exec(p.dataUri) : null;
      const ext = m ? EXT_BY_MIME[m[1].toLowerCase()] : undefined;
      if (!m || !ext) continue;
      const ref = images.length + 1;
      images.push({ ref, path, mimeType: m[1].toLowerCase(), ext, bytes: Buffer.from(m[2], 'base64'), scaleMode: p.scaleMode || 'FILL' });
      out.push({ type: 'IMAGE_REF', ref, scaleMode: p.scaleMode || 'FILL' });
    }
    return out;
  };
  const copy: Record<string, unknown> = { ...node, fills: paints(node.fills), strokes: node.strokes?.filter((s) => s.type !== 'IMAGE') };
  if (node.type === 'FRAME' && node.children) copy.children = node.children.map((c, i) => extractImages(c, `${path}.${i}`, images));
  return copy;
}

function countNodes(node: FigmaCaptureNode): number {
  return 1 + (node.type === 'FRAME' ? (node.children ?? []).reduce((n, c) => n + countNodes(c), 0) : 0);
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (code: string) => unknown;

function assertParses(code: string, label: string): void {
  try {
    new AsyncFunction(code);
  } catch (err) {
    throw new Error(`Generated ${label} is not valid JavaScript: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function partCode(runId: string, fonts: unknown, jobs: Job[], first: { width: number; height: number; name: string; root: unknown } | undefined): string {
  const lines = [
    `const RUN = ${JSON.stringify(runId)};`,
    FIGMA_PUSH_BUILDER,
    `await preloadFonts(${JSON.stringify(fonts)});`,
  ];
  if (first) {
    lines.push(
      `const right = figma.currentPage.children.reduce((m, n) => Math.max(m, n.x + n.width), 0);`,
      `const container = figma.createFrame();`,
      `container.name = ${JSON.stringify(first.name)} + marker('root');`,
      `container.clipsContent = true;`,
      `safeResize(container, ${first.width}, ${first.height});`,
      `applyBoxProps(container, ${JSON.stringify(first.root)});`,
      `if (!container.fills || !container.fills.length) container.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];`,
      `figma.currentPage.appendChild(container);`,
      `container.x = right + 200;`,
      `container.y = 0;`,
    );
  }
  lines.push(
    `const JOBS = ${JSON.stringify(jobs)};`,
    `for (const job of JOBS) {`,
    `  const parent = findMarked(job.parentPath);`,
    `  if (!parent) throw new Error('Parent layer ' + job.parentPath + ' not found: run the parts in order, in the same file.');`,
    `  await buildNode(job.node, parent, job.parentAbs.x, job.parentAbs.y, job.path);`,
    `}`,
    `return { created: CREATED, failedFonts: FAILED_FONTS };`,
  );
  return lines.join('\n');
}

function cleanupCode(runId: string, images: FigmaPushImage[]): string {
  return [
    `const RUN = ${JSON.stringify(runId)};`,
    `const tag = ' \\u27e6od:' + RUN + ':';`,
    `const IMAGES = ${JSON.stringify(images.map((i) => ({ ref: i.ref, path: i.path })))};`,
    `const marked = figma.currentPage.findAll((n) => n.name.includes(tag));`,
    `const byPath = new Map();`,
    `for (const n of marked) { const i = n.name.lastIndexOf(tag); byPath.set(n.name.slice(i + tag.length, -1), n); }`,
    `const root = byPath.get('root');`,
    `if (!root) throw new Error('No layers from this push found: run the earlier parts first, in the same file.');`,
    `const imageNodes = IMAGES.map((img) => ({ ref: img.ref, id: byPath.has(img.path) ? byPath.get(img.path).id : null }));`,
    `for (const n of marked) n.name = n.name.slice(0, n.name.lastIndexOf(tag));`,
    `figma.currentPage.selection = [root];`,
    `return { containerId: root.id, containerName: root.name, layers: marked.length, imageNodes };`,
  ].join('\n');
}

/** Splits a capture into use_figma parts of at most `maxChars` characters each, plus a clean-up part. */
export function buildFigmaPushParts(capture: FigmaCaptureDocument, options: { runId: string; maxChars?: number }): FigmaPushParts {
  const maxChars = options.maxChars ?? FIGMA_PART_MAX_CHARS;
  const runId = options.runId;
  const images: FigmaPushImage[] = [];
  const root = extractImages(capture.root, 'root', images) as Record<string, unknown> & { children?: unknown[]; x?: number; y?: number; width?: number; height?: number };
  const rootAbs = { x: root.x ?? 0, y: root.y ?? 0 };
  const { children: rootChildren = [], ...rootBox } = root;
  const first = { width: root.width ?? 1, height: root.height ?? 1, name: capture.source?.title || 'OD Capture', root: rootBox };

  const overhead = partCode(runId, capture.fonts, [], first).length + 200;
  const budget = maxChars - overhead;
  if (budget < 2000) throw new Error('maxChars is too small for the builder.');

  // Flatten into jobs: a subtree that fits goes whole; one that doesn't is
  // created as a shell (its box, no children) and its children become jobs.
  const jobs: Array<Job & { size: number }> = [];
  const addJobs = (nodes: unknown[], parentPath: string, parentAbs: { x: number; y: number }) => {
    nodes.forEach((n, i) => {
      const path = `${parentPath}.${i}`;
      const size = JSON.stringify(n).length + 120;
      const node = n as Record<string, unknown> & { children?: unknown[]; x?: number; y?: number; type?: string };
      if (size <= budget || node.type !== 'FRAME' || !node.children?.length) {
        if (size > budget) throw new Error(`A single layer at ${path} is larger than one part allows; it can't be pushed.`);
        jobs.push({ parentPath, parentAbs, path, node: n, size });
        return;
      }
      const { children, ...shell } = node;
      jobs.push({ parentPath, parentAbs, path, node: shell, size: JSON.stringify(shell).length + 120 });
      addJobs(children ?? [], path, { x: node.x ?? 0, y: node.y ?? 0 });
    });
  };
  addJobs(rootChildren, 'root', rootAbs);

  const parts: string[] = [];
  let batch: Job[] = [];
  let used = 0;
  const flush = (isFirst: boolean) => {
    const code = partCode(runId, capture.fonts, batch, isFirst ? first : undefined);
    assertParses(code, `part ${parts.length + 1}`);
    if (code.length > maxChars) throw new Error(`Part ${parts.length + 1} is ${code.length} characters, over ${maxChars}.`);
    parts.push(code);
    batch = [];
    used = 0;
  };
  for (const job of jobs) {
    if (used + job.size > budget && (batch.length > 0 || parts.length > 0)) flush(parts.length === 0);
    const { size, ...rest } = job;
    batch.push(rest);
    used += size;
  }
  if (batch.length > 0 || parts.length === 0) flush(parts.length === 0);

  const cleanup = cleanupCode(runId, images);
  assertParses(cleanup, 'clean-up part');
  parts.push(cleanup);
  return { runId, parts, images, nodeCount: countNodes(capture.root) };
}
