import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { captureArtifactForFigma, createWorkspaceFigmaAssetReader } from '../../figma/captureRunner';
import { captureFigmaIr } from '../../figma/captureIr';
import type { FigmaCaptureNode } from '../../workspace/figmaCapture';

// 4×4 opaque PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC', 'base64');

function walk(node: FigmaCaptureNode, out: FigmaCaptureNode[] = []): FigmaCaptureNode[] {
  out.push(node);
  if (node.type === 'FRAME') for (const c of node.children ?? []) walk(c, out);
  return out;
}

describe('figma capture: shared function', () => {
  it('is self-contained source the headless page can evaluate', () => {
    const src = captureFigmaIr.toString();
    assert.doesNotThrow(() => new Function(`return (${src})`));
    assert.ok(!/require\(|exports\./.test(src));
  });
});

describe('figma capture: workspace asset reader', () => {
  it('reads relative paths and served-origin URLs inside the workspace, nothing else', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-figcap-'));
    await fs.mkdir(path.join(root, 'a/img'), { recursive: true });
    await fs.writeFile(path.join(root, 'a/img/x.png'), PNG);
    const reader = createWorkspaceFigmaAssetReader(root, 'a/page.html', 'http://127.0.0.1:5555');
    assert.strictEqual((await reader.read('img/x.png'))?.mimeType, 'image/png');
    assert.strictEqual((await reader.read('http://127.0.0.1:5555/a/img/x.png'))?.mimeType, 'image/png');
    assert.strictEqual(await reader.read('https://example.com/x.png'), undefined);
    assert.strictEqual(await reader.read('../../etc/passwd.png'), undefined);
  });
});

describe('figma capture: headless runner', function () {
  // Same budget as checkArtifact's browser tests: a loaded machine can be slow to launch Chrome.
  this.timeout(120000);
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
  });

  it('captures a page with text, a box and a local image, and writes the sidecar', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-figcap-'));
    const entry = '.open-design/card/card.html';
    await fs.mkdir(path.join(root, '.open-design/card'), { recursive: true });
    await fs.writeFile(path.join(root, '.open-design/card/dot.png'), PNG);
    await fs.writeFile(
      path.join(root, entry),
      '<!doctype html><html><head><title>Card</title><style>body{margin:0;background:#f5efe4}h1{font:700 40px sans-serif;color:#8a2f17;margin:20px}.box{width:200px;height:80px;background:#fff;border-radius:12px;margin:20px}</style></head><body><h1>Hello Figma</h1><div class="box"></div><img src="dot.png" width="40" height="40"></body></html>',
    );
    const result = await captureArtifactForFigma({ workspaceRoot: root, entryPath: entry });
    assert.ok(result.ok, result.ok ? '' : result.error);
    if (!result.ok) return;
    assert.strictEqual(result.sidecarPath, `${entry}.od-figma.json`);
    await fs.access(path.join(root, result.sidecarPath));
    const nodes = walk(result.capture.root);
    assert.ok(nodes.some((n) => n.type === 'TEXT' && n.characters === 'Hello Figma'));
    assert.ok(nodes.some((n) => n.type === 'FRAME' && n.cornerRadius === 12));
    const img = nodes.find((n) => n.type === 'FRAME' && n.name === 'img');
    assert.ok(img && img.type === 'FRAME');
    const fill = img.fills?.[0];
    assert.ok(fill && fill.type === 'IMAGE' && fill.dataUri?.startsWith('data:image/png;base64,'), JSON.stringify(fill));
    assert.strictEqual(result.capture.source.title, 'Card');
  });

  it('captures a card design at the card size, not the page width', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-figcap-'));
    const entry = '.open-design/post/post.html';
    await fs.mkdir(path.join(root, '.open-design/post'), { recursive: true });
    await fs.writeFile(path.join(root, entry), '<!doctype html><html><body style="margin:0"><div data-od-card style="width:300px;height:200px;background:#123456"></div></body></html>');
    const result = await captureArtifactForFigma({ workspaceRoot: root, entryPath: entry });
    assert.ok(result.ok, result.ok ? '' : result.error);
    if (!result.ok) return;
    assert.strictEqual(Math.round(result.capture.root.width), 300);
  });
});

