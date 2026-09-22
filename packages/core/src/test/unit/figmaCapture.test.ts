import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  figmaCaptureSidecarPath,
  resolveFigmaCaptureAssets,
  writeFigmaCapture,
  type FigmaCaptureAssetReader,
  type FigmaCaptureDocument,
} from '../../workspace/figmaCapture';

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-figma-capture-'));
}

function baseCapture(root: FigmaCaptureDocument['root']): FigmaCaptureDocument {
  return {
    version: 1,
    source: { url: 'artifact://hero.html', title: 'Hero', capturedAt: 0, viewport: { width: 1280, height: 800 }, dpr: 1 },
    fonts: [],
    root,
  };
}

describe('resolveFigmaCaptureAssets', () => {
  it('rewrites an IMAGE fill url to an inline dataUri', async () => {
    const capture = baseCapture({
      type: 'FRAME',
      name: 'root',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ type: 'IMAGE', scaleMode: 'FILL', url: 'assets/photo.png' }],
    });
    const reader: FigmaCaptureAssetReader = {
      async read(ref) {
        assert.strictEqual(ref, 'assets/photo.png');
        return { base64: 'AAAA', mimeType: 'image/png' };
      },
    };
    const resolved = await resolveFigmaCaptureAssets(capture, reader);
    assert.deepStrictEqual(resolved.root.fills, [{ type: 'IMAGE', scaleMode: 'FILL', dataUri: 'data:image/png;base64,AAAA' }]);
  });

  it('drops an IMAGE fill that cannot be resolved, rather than throwing', async () => {
    const capture = baseCapture({
      type: 'FRAME',
      name: 'leaf',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fills: [{ type: 'IMAGE', scaleMode: 'FILL', url: 'missing.png' }],
    });
    const reader: FigmaCaptureAssetReader = { async read() { return undefined; } };
    const resolved = await resolveFigmaCaptureAssets(capture, reader);
    assert.deepStrictEqual(resolved.root.fills, []);
  });

  it('leaves SOLID fills untouched', async () => {
    const capture = baseCapture({
      type: 'FRAME',
      name: 'root',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
    });
    const reader: FigmaCaptureAssetReader = { async read() { throw new Error('should not be called'); } };
    const resolved = await resolveFigmaCaptureAssets(capture, reader);
    assert.deepStrictEqual(resolved.root.fills, [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]);
  });

  it('recurses into children', async () => {
    const capture = baseCapture({
      type: 'FRAME',
      name: 'root',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          type: 'RECTANGLE',
          name: 'child',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fills: [{ type: 'IMAGE', scaleMode: 'FILL', url: 'child.png' }],
        },
      ],
    });
    const reader: FigmaCaptureAssetReader = { async read() { return { base64: 'BBBB', mimeType: 'image/jpeg' }; } };
    const resolved = await resolveFigmaCaptureAssets(capture, reader);
    const child = resolved.root.children?.[0];
    assert.strictEqual(child?.type === 'RECTANGLE' && child.fills?.[0].type === 'IMAGE' ? (child.fills[0] as { dataUri?: string }).dataUri : undefined, 'data:image/jpeg;base64,BBBB');
  });
});

describe('writeFigmaCapture', () => {
  it('writes the sidecar at <entryPath>.od-figma.json', async () => {
    const workspaceRoot = await makeTempWorkspace();
    const capture = baseCapture({ type: 'FRAME', name: 'root', x: 0, y: 0, width: 10, height: 10 });
    const absPath = await writeFigmaCapture(workspaceRoot, '.open-design/hero/hero.html', capture);
    assert.strictEqual(absPath, path.join(workspaceRoot, figmaCaptureSidecarPath('.open-design/hero/hero.html')));
    const raw = await fs.readFile(absPath, 'utf8');
    assert.deepStrictEqual(JSON.parse(raw), capture);
  });

  it('rejects an entryPath that escapes the workspace', async () => {
    const workspaceRoot = await makeTempWorkspace();
    const capture = baseCapture({ type: 'FRAME', name: 'root', x: 0, y: 0, width: 10, height: 10 });
    await assert.rejects(writeFigmaCapture(workspaceRoot, '../outside.html', capture));
  });
});
