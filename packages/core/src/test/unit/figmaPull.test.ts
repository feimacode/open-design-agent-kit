import * as assert from 'node:assert';
import {
  composePullFigmaInstructions,
  fetchFigmaFrameImage,
  fetchFigmaNode,
  FigmaApiError,
  parseFigmaUrl,
  summarizeFigmaNode,
  type FigmaNode,
} from '../../generation/figmaPull';

function fakeFetch(handler: (url: string) => { ok: boolean; status?: number; json: unknown }): typeof fetch {
  return (async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const result = handler(url);
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      json: async () => result.json,
    } as Response;
  }) as typeof fetch;
}

describe('parseFigmaUrl', () => {
  it('parses a "design" URL with a node-id, converting the dash to a colon', () => {
    const ref = parseFigmaUrl('https://www.figma.com/design/abc123/My-File?node-id=45-678&t=xyz');
    assert.deepStrictEqual(ref, { fileKey: 'abc123', nodeId: '45:678' });
  });

  it('parses a legacy "file" URL', () => {
    const ref = parseFigmaUrl('https://figma.com/file/abc123/My-File?node-id=1-2');
    assert.deepStrictEqual(ref, { fileKey: 'abc123', nodeId: '1:2' });
  });

  it('returns a fileKey with no nodeId when node-id is absent', () => {
    const ref = parseFigmaUrl('https://www.figma.com/design/abc123/My-File');
    assert.deepStrictEqual(ref, { fileKey: 'abc123', nodeId: undefined });
  });

  it('returns undefined for a non-Figma URL', () => {
    assert.strictEqual(parseFigmaUrl('https://example.com/design/abc123'), undefined);
  });
});

describe('fetchFigmaNode', () => {
  it('fetches the node-scoped endpoint and extracts the document', async () => {
    const node: FigmaNode = { id: '45:678', name: 'Hero', type: 'FRAME' };
    const fetchImpl = fakeFetch((url) => {
      assert.match(url, /\/v1\/files\/abc123\/nodes\?ids=45%3A678/);
      return { ok: true, json: { nodes: { '45:678': { document: node } } } };
    });
    const result = await fetchFigmaNode('token', { fileKey: 'abc123', nodeId: '45:678' }, fetchImpl);
    assert.deepStrictEqual(result, node);
  });

  it('throws FigmaApiError when no nodeId is given', async () => {
    await assert.rejects(fetchFigmaNode('token', { fileKey: 'abc123' }), FigmaApiError);
  });

  it('throws FigmaApiError on a non-ok response', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 403, json: {} }));
    await assert.rejects(fetchFigmaNode('token', { fileKey: 'abc123', nodeId: '1:2' }, fetchImpl), FigmaApiError);
  });

  it('throws FigmaApiError when the response has no matching document', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: { nodes: {} } }));
    await assert.rejects(fetchFigmaNode('token', { fileKey: 'abc123', nodeId: '1:2' }, fetchImpl), FigmaApiError);
  });
});

describe('fetchFigmaFrameImage', () => {
  it('returns the image URL on success', async () => {
    const fetchImpl = fakeFetch((url) => {
      assert.match(url, /\/v1\/images\/abc123\?ids=1%3A2&format=png&scale=2/);
      return { ok: true, json: { err: null, images: { '1:2': 'https://figma-images.example/x.png' } } };
    });
    const url = await fetchFigmaFrameImage('token', 'abc123', '1:2', fetchImpl);
    assert.strictEqual(url, 'https://figma-images.example/x.png');
  });

  it('degrades to undefined on a non-ok response rather than throwing', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, json: {} }));
    const url = await fetchFigmaFrameImage('token', 'abc123', '1:2', fetchImpl);
    assert.strictEqual(url, undefined);
  });

  it('degrades to undefined when the API reports an error', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: { err: 'rate limited', images: {} } }));
    const url = await fetchFigmaFrameImage('token', 'abc123', '1:2', fetchImpl);
    assert.strictEqual(url, undefined);
  });

  it('degrades to undefined when fetch itself throws', async () => {
    const throwingFetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const url = await fetchFigmaFrameImage('token', 'abc123', '1:2', throwingFetch);
    assert.strictEqual(url, undefined);
  });
});

describe('summarizeFigmaNode', () => {
  const frame: FigmaNode = {
    id: '1:1',
    name: 'Card',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    cornerRadius: 8,
    children: [
      {
        id: '1:2',
        name: 'Title',
        type: 'TEXT',
        characters: 'Hello world',
        style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700, textAlignHorizontal: 'LEFT' },
      },
    ],
  };

  it('flattens box geometry, hex fill color, and cornerRadius', () => {
    const summary = summarizeFigmaNode(frame);
    assert.strictEqual(summary.root.box?.width, 200);
    assert.strictEqual(summary.root.fillColor, '#ffffff');
    assert.strictEqual(summary.root.cornerRadius, 8);
    assert.strictEqual(summary.truncated, false);
  });

  it('captures text properties only for TEXT nodes', () => {
    const summary = summarizeFigmaNode(frame);
    const text = summary.root.children?.[0];
    assert.strictEqual(text?.characters, 'Hello world');
    assert.strictEqual(text?.fontFamily, 'Inter');
    assert.strictEqual(text?.fontSize, 20);
    assert.strictEqual(summary.root.characters, undefined);
  });

  it('counts nodes and truncates past maxNodes', () => {
    const summary = summarizeFigmaNode(frame, { maxNodes: 1 });
    assert.strictEqual(summary.nodeCount, 1);
    assert.strictEqual(summary.truncated, true);
    assert.strictEqual(summary.root.children, undefined);
  });

  it('ignores invisible fills when picking the fill color', () => {
    const withHiddenFill: FigmaNode = {
      id: '1:1',
      name: 'Box',
      type: 'RECTANGLE',
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, visible: false },
        { type: 'SOLID', color: { r: 0, g: 1, b: 0 } },
      ],
    };
    const summary = summarizeFigmaNode(withHiddenFill);
    assert.strictEqual(summary.root.fillColor, '#00ff00');
  });
});

describe('composePullFigmaInstructions', () => {
  const summary = summarizeFigmaNode({ id: '1:1', name: 'Hero', type: 'FRAME' });
  const base = { frameSummary: summary, frameName: 'Hero', suggestedEntryPath: '.open-design/figma/hero.html' };

  it('embeds the frame name, structural JSON, and output path', () => {
    const result = composePullFigmaInstructions(base);
    assert.match(result, /"Hero"/);
    assert.match(result, /"id": "1:1"/);
    assert.match(result, /\.open-design\/figma\/hero\.html/);
    assert.match(result, /register_open_design_artifact/);
  });

  it('references the image URL when given', () => {
    const result = composePullFigmaInstructions({ ...base, imageUrl: 'https://figma-images.example/x.png' });
    assert.match(result, /https:\/\/figma-images\.example\/x\.png/);
  });

  it('notes when no image export was available', () => {
    const result = composePullFigmaInstructions(base);
    assert.match(result, /No rendered image export was available/);
  });

  it('mentions the design system id when given', () => {
    const result = composePullFigmaInstructions({ ...base, designSystemId: 'acme' });
    assert.match(result, /design system "acme"/);
  });

  it('flags truncation in the instructions', () => {
    const truncated = summarizeFigmaNode(
      { id: '1:1', name: 'Hero', type: 'FRAME', children: [{ id: '1:2', name: 'Child', type: 'RECTANGLE' }] },
      { maxNodes: 1 },
    );
    const result = composePullFigmaInstructions({ ...base, frameSummary: truncated });
    assert.match(result, /was truncated/);
  });
});
