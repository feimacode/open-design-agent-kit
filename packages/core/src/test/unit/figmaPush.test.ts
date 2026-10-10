import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeFigmaPushInstructions, prepareFigmaPush } from '../../figma/pushFigma';
import { writeFigmaCapture, type FigmaCaptureDocument } from '../../workspace/figmaCapture';

const PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC';
const capture: FigmaCaptureDocument = {
  version: 1,
  source: { url: 'x', title: 'Card', capturedAt: 0, viewport: { width: 400, height: 300 }, dpr: 1 },
  fonts: [{ family: 'Inter', styles: ['Regular'] }],
  root: {
    type: 'FRAME', name: 'body', x: 0, y: 0, width: 400, height: 300,
    children: [{ type: 'FRAME', name: 'img', x: 10, y: 10, width: 40, height: 40, fills: [{ type: 'IMAGE', scaleMode: 'FILL', dataUri: PNG_URI }] }],
  },
};

const base = { entryPath: '.open-design/card/card.html', title: 'Card', partFiles: ['a/part-01.js', 'a/part-02.js'], imageFiles: [{ ref: 1, file: 'a/images/1.png', contentType: 'image/png' }], layers: 2, truncated: false, reused: true, sidecar: '.open-design/card/card.html.od-figma.json' };

describe('figma push: prepare', () => {
  it('reuses a fresh capture and writes parts, images and a manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-figpush-'));
    const entry = '.open-design/card/card.html';
    await fs.mkdir(path.join(root, '.open-design/card'), { recursive: true });
    await fs.writeFile(path.join(root, entry), '<h1>x</h1>');
    await new Promise((r) => setTimeout(r, 20));
    await writeFigmaCapture(root, entry, capture);
    const result = await prepareFigmaPush({ workspaceRoot: root, entryPath: entry });
    assert.ok(result.ok, result.text);
    assert.match(result.text, /taken from its existing capture/);
    const dir = path.join(root, '.open-design/card/exports/figma');
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.strictEqual(manifest.parts.length, 2);
    assert.strictEqual(manifest.images[0].contentType, 'image/png');
    await fs.access(path.join(dir, 'part-01.js'));
    assert.ok((await fs.readFile(path.join(dir, 'images/1.png'))).length > 0);
  });

  it('fails cleanly for a missing entry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-figpush-'));
    const result = await prepareFigmaPush({ workspaceRoot: root, entryPath: 'nope.html' });
    assert.strictEqual(result.ok, false);
  });
});

describe('figma push: instructions', () => {
  const text = composeFigmaPushInstructions(base);

  it('asks for the target file before any Figma write', () => {
    assert.match(text, /wait for the answer before writing anything to Figma/);
    assert.ok(text.indexOf('## Step 2') < text.indexOf('`use_figma` with the chosen'));
    assert.match(text, /`whoami`[\s\S]*`create_new_file`/);
  });

  it('requires running parts verbatim, in order, and stopping on errors', () => {
    assert.match(text, /exactly as written/);
    assert.match(text, /If a call fails, show the user the error and stop/);
    assert.match(text, /1\. `a\/part-01\.js`\n2\. `a\/part-02\.js` \(clean-up/);
  });

  it('loads figma-use, uploads images to the returned node ids, and verifies', () => {
    assert.match(text, /skill:\/\/figma\/figma-use\/SKILL\.md/);
    assert.match(text, /`upload_assets`[\s\S]*`nodeIds`/);
    assert.match(text, /Content-Type: <type>/);
    assert.match(text, /`get_screenshot`/);
  });

  it('offers setup when not connected, and keeps the plugin route', () => {
    assert.match(text, /offer to set it up once/);
    assert.match(text, /OD Figma Import/);
    assert.match(text, /card\.html\.od-figma\.json/);
  });

  it('warns before a push with many parts', () => {
    const many = composeFigmaPushInstructions({ ...base, partFiles: Array.from({ length: 10 }, (_, i) => `p${i}.js`) });
    assert.match(many, /This push has 10 parts/);
    assert.ok(!/This push has/.test(text));
  });
});
