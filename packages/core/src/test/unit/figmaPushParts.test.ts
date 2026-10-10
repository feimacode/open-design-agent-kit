import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { buildFigmaPushParts, FIGMA_PART_MAX_CHARS } from '../../figma/pushParts';
import type { FigmaCaptureDocument, FigmaCaptureNode } from '../../workspace/figmaCapture';

const PLUGIN = path.resolve(__dirname, '..', '..', '..', '..', 'vscode', 'assets', 'figma-plugin', 'code.js');
const PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC';

// --- a tiny fake of the Figma Plugin API: enough for both builders ---------
interface FakeNode {
  id: string;
  type: string;
  name: string;
  children: FakeNode[];
  parent?: FakeNode;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  characters?: string;
  [k: string]: unknown;
}

function fakeFigma() {
  let n = 0;
  const all: FakeNode[] = [];
  const make = (type: string): FakeNode => {
    const node: FakeNode = {
      id: `1:${++n}`,
      type,
      name: type.toLowerCase(),
      children: [],
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [],
      resize(w: number, h: number) {
        node.width = w;
        node.height = h;
      },
      appendChild(c: FakeNode) {
        c.parent = node;
        node.children.push(c);
      },
    };
    all.push(node);
    return node;
  };
  const page = make('PAGE');
  const walk = (root: FakeNode, out: FakeNode[] = []) => {
    for (const c of root.children) {
      out.push(c);
      walk(c, out);
    }
    return out;
  };
  const figma = {
    currentPage: Object.assign(page, {
      selection: [] as FakeNode[],
      findOne: (fn: (x: FakeNode) => boolean) => walk(page).find(fn) ?? null,
      findAll: (fn: (x: FakeNode) => boolean) => walk(page).filter(fn),
    }),
    createFrame: () => make('FRAME'),
    createText: () => make('TEXT'),
    createRectangle: () => make('RECTANGLE'),
    createImage: () => ({ hash: 'h' }),
    loadFontAsync: async (f: { family: string; style: string }) => {
      if (f.family === 'Missing') throw new Error('no font');
    },
    viewport: { scrollAndZoomIntoView() {} },
    notify() {},
    showUI() {},
    closePlugin() {},
    ui: { onmessage: undefined as undefined | ((m: unknown) => Promise<void>), postMessage() {} },
  };
  return { figma, page, walk: () => walk(page) };
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

const text = (characters: string, x: number, y: number): FigmaCaptureNode => ({
  type: 'TEXT', name: characters, x, y, width: 200, height: 30, characters, fontFamily: 'Inter', fontStyle: 'Bold', fontSize: 24, textAlign: 'LEFT', color: { r: 0.5, g: 0.1, b: 0.1 },
});

function capture(children: FigmaCaptureNode[]): FigmaCaptureDocument {
  return {
    version: 1,
    source: { url: 'https://x/', title: 'Test card', capturedAt: 0, viewport: { width: 600, height: 400 }, dpr: 1 },
    fonts: [{ family: 'Inter', styles: ['Regular', 'Bold'] }],
    root: { type: 'FRAME', name: 'body', x: 0, y: 0, width: 600, height: 400, fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }], children },
  };
}

const sample = () =>
  capture([
    text('Hello', 20, 20),
    { type: 'FRAME', name: 'card', x: 20, y: 80, width: 240, height: 120, cornerRadius: 12, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], children: [text('Inside', 30, 90)] },
    { type: 'FRAME', name: 'img', x: 300, y: 80, width: 40, height: 40, fills: [{ type: 'IMAGE', scaleMode: 'FILL', dataUri: PNG_URI }] },
  ]);

async function runParts(parts: string[], f = fakeFigma()) {
  const results: unknown[] = [];
  for (const code of parts) results.push(await new AsyncFunction('figma', code)(f.figma));
  return { results, f };
}

const shape = (nodes: FakeNode[]) => nodes.filter((n) => n.type !== 'PAGE').map((n) => `${n.type}:${n.name}:${n.width}x${n.height}`);

describe('figma push parts', () => {
  it('builds the same layers as the vendored import plugin, then strips the markers', async () => {
    const plugin = fakeFigma();
    const source = await fs.readFile(PLUGIN, 'utf8');
    new AsyncFunction('figma', '__html__', source)(plugin.figma, '');
    await plugin.figma.ui.onmessage!({ type: 'import', ir: sample() });

    const { results, f } = await runParts(buildFigmaPushParts(sample(), { runId: 'r1' }).parts);
    assert.deepStrictEqual(shape(f.walk()), shape(plugin.walk()));
    assert.ok(f.walk().every((n) => !n.name.includes('⟦od:')), 'markers removed');
    const cleanup = results[results.length - 1] as { containerId: string; imageNodes: Array<{ ref: number; id: string }> };
    const img = f.walk().find((n) => n.name === 'img');
    assert.deepStrictEqual(cleanup.imageNodes, [{ ref: 1, id: img!.id }]);
    assert.strictEqual(cleanup.containerId, f.walk()[0].id);
  });

  it('places the container to the right of existing layers', async () => {
    const f = fakeFigma();
    const existing = f.figma.createFrame();
    existing.x = 0;
    existing.width = 1000;
    (f.page.appendChild as (c: FakeNode) => void)(existing);
    await runParts(buildFigmaPushParts(sample(), { runId: 'r2' }).parts, f);
    const container = f.page.children[1];
    assert.strictEqual(container.x, 1200);
  });

  it('extracts images into files and keeps each part under the limit', () => {
    const result = buildFigmaPushParts(sample(), { runId: 'r3' });
    assert.strictEqual(result.images.length, 1);
    assert.strictEqual(result.images[0].ext, 'png');
    assert.ok(result.images[0].bytes.length > 0);
    assert.ok(result.parts.every((p) => p.length <= FIGMA_PART_MAX_CHARS));
    assert.ok(!result.parts.some((p) => p.includes('base64')), 'no embedded image data');
    assert.strictEqual(result.parts.length, 2, 'one build part plus clean-up');
  });

  it('splits a large capture across parts that still build every layer in order', async () => {
    const many: FigmaCaptureNode[] = [];
    for (let i = 0; i < 30; i++) {
      const kids: FigmaCaptureNode[] = [];
      for (let k = 0; k < 20; k++) kids.push(text(`Row ${i} cell ${k} with some longer copy to take up space`, 10 + k, 10 + i));
      many.push({ type: 'FRAME', name: `row-${i}`, x: 0, y: i * 40, width: 600, height: 40, children: kids });
    }
    const big = capture(many);
    const result = buildFigmaPushParts(big, { runId: 'r4', maxChars: 20000 });
    assert.ok(result.parts.length > 3, `${result.parts.length} parts`);
    assert.ok(result.parts.every((p) => p.length <= 20000));
    const { f } = await runParts(result.parts);
    const built = f.walk();
    assert.strictEqual(built.length, result.nodeCount);
    const rows = f.page.children[0].children.map((n) => n.name);
    assert.deepStrictEqual(rows, many.map((n) => n.name), 'rows keep their order');
  });

  it('reports fonts that could not be loaded', async () => {
    const c = sample();
    c.fonts.push({ family: 'Missing', styles: ['Regular'] });
    const { results } = await runParts(buildFigmaPushParts(c, { runId: 'r5' }).parts);
    assert.deepStrictEqual((results[0] as { failedFonts: string[] }).failedFonts, ['Missing Regular']);
  });

  it('falls back to Inter in the same style when a font is missing', async () => {
    const c = sample();
    c.fonts.push({ family: 'Missing', styles: ['Bold'] });
    c.root.children!.push({ ...text('Bold heading', 20, 300), fontFamily: 'Missing', fontStyle: 'Bold' } as FigmaCaptureNode);
    const { f } = await runParts(buildFigmaPushParts(c, { runId: 'r6' }).parts);
    const heading = f.walk().find((n) => n.characters === 'Bold heading');
    assert.deepStrictEqual(heading?.fontName, { family: 'Inter', style: 'Bold' });
  });
});

