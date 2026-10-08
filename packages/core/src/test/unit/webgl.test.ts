import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact } from '../../export/checkArtifact';
import { exportArtifact } from '../../export/exportArtifact';
import { isFullyOpaquePng, isUniformPng, usesWebgl, webglLaunchArgs } from '../../export/webgl';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

/** A plain-WebGL scene (no three.js, no network): clears to `clear`, draws a triangle unless `blank`. */
function scene(opts: { blank?: boolean; noWebgl?: boolean; transparent?: boolean; readyDelayMs?: number } = {}): string {
  return `<!doctype html><html><head><style>html, body { margin: 0; background: ${opts.transparent ? 'transparent' : '#fff'}; } canvas { display: block; width: 400px; height: 300px; }</style></head><body>
<canvas id="stage" data-od-webgl width="400" height="300"></canvas>
<script>
${opts.noWebgl ? `HTMLCanvasElement.prototype.getContext = function () { return null; };` : ''}
const canvas = document.getElementById('stage');
const gl = canvas.getContext('webgl', { alpha: ${opts.transparent ? 'true' : 'false'}, preserveDrawingBuffer: true });
let angle = 0;
function draw() {
  if (!gl) return;
  gl.clearColor(0.1, 0.1, 0.12, ${opts.transparent ? '0' : '1'});
  gl.clear(gl.COLOR_BUFFER_BIT);
  ${opts.blank ? '' : `
  const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, 'precision mediump float; void main(){ gl_FragColor = vec4(0.9, 0.35, 0.2, 1.0); }'); gl.compileShader(fs);
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.6, -0.6, 0.6, -0.6, 0.0, 0.6]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);`}
}
window.odScene = { rotate: true, ready: new Promise((resolve) => setTimeout(() => { draw(); window.odScene.readyAt = performance.now(); resolve(); }, ${opts.readyDelayMs ?? 0})) };
</script></body></html>`;
}

async function workspaceWith(html: string): Promise<{ ws: string; entry: string }> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'od-webgl-'));
  const entry = '.open-design/s/scene.html';
  await fs.mkdir(path.join(ws, '.open-design/s'), { recursive: true });
  await fs.writeFile(path.join(ws, entry), html);
  await writeArtifactManifest({ workspaceRoot: ws, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html', 'png'], title: 'Scene' } });
  return { ws, entry };
}

function png(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Buffer {
  const img = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) img.data.set(fill(x, y), (y * width + x) * 4);
  return PNG.sync.write(img);
}

describe('webgl: detection and pixel helpers', () => {
  it('opts into software WebGL only for marked canvases and three.js imports', () => {
    assert.ok(usesWebgl('<canvas data-od-webgl></canvas>'));
    assert.ok(usesWebgl(`<script type="module">import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';</script>`));
    assert.ok(usesWebgl(`<script type="importmap">{"imports": {"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}</script><script type="module">import * as THREE from "three";</script>`));
    assert.ok(!usesWebgl('<canvas id="chart"></canvas><p>Three ways to win</p>'));
    assert.deepStrictEqual(webglLaunchArgs('<p>plain</p>'), []);
    assert.ok(webglLaunchArgs('<canvas data-od-webgl></canvas>').includes('--use-angle=swiftshader'));
  });

  it('tells a flat image from a drawn one, and an opaque one from a cut-out', () => {
    assert.ok(isUniformPng(png(40, 30, () => [20, 20, 30, 255])));
    assert.ok(!isUniformPng(png(40, 30, (x) => (x > 20 ? [200, 80, 40, 255] : [20, 20, 30, 255]))));
    assert.ok(isFullyOpaquePng(png(40, 30, () => [255, 255, 255, 255])));
    assert.ok(!isFullyOpaquePng(png(40, 30, (x, y) => (x > 10 && x < 30 && y > 5 && y < 25 ? [200, 80, 40, 255] : [0, 0, 0, 0]))));
  });

  it('rejects transparent with formats that cannot carry it', async () => {
    const jpeg = await exportArtifact({ workspaceRoot: os.tmpdir(), entryPath: 'x.html', format: 'jpeg', transparent: true });
    assert.ok(!jpeg.ok && /transparent exports a PNG/.test(jpeg.error));
    const gif = await exportArtifact({ workspaceRoot: os.tmpdir(), entryPath: 'x.html', format: 'gif', transparent: true });
    assert.ok(!gif.ok && /transparent/.test(gif.error));
  });
});

describe('webgl: rendering (real browser; skipped when none is installed)', function () {
  this.timeout(90000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });

  it('renders a working scene headlessly, waits for odScene.ready, and stops the turntable for stills', async () => {
    const { ws, entry } = await workspaceWith(scene({ readyDelayMs: 1200 }));
    const r = await checkArtifact({ workspaceRoot: ws, entryPath: entry, browserPath, maxImages: 0, settleMs: 0 });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(r.findings.filter((f) => f.check === 'webgl'), [], 'a drawn scene has no webgl findings');
    assert.ok(!r.warnings.some((w) => /wasn't ready/.test(w)), r.warnings.join('\n'));

    const out = await exportArtifact({ workspaceRoot: ws, entryPath: entry, browserPath, width: 400, height: 300, settleMs: 0 });
    assert.ok(out.ok && 'files' in out, JSON.stringify(out));
    assert.ok(!isUniformPng(await fs.readFile(path.join(ws, out.files[0].path))), 'the exported PNG shows the scene');
  });

  it('warns about a blank canvas and errors when no WebGL context exists', async () => {
    const blank = await workspaceWith(scene({ blank: true }));
    const r1 = await checkArtifact({ workspaceRoot: blank.ws, entryPath: blank.entry, browserPath, maxImages: 0, settleMs: 0 });
    assert.ok(r1.ok);
    assert.deepStrictEqual(r1.findings.filter((f) => f.check === 'webgl').map((f) => [f.severity, f.selector]), [['warning', '#stage']]);

    const none = await workspaceWith(scene({ noWebgl: true }));
    const r2 = await checkArtifact({ workspaceRoot: none.ws, entryPath: none.entry, browserPath, maxImages: 0, settleMs: 0 });
    assert.ok(r2.ok);
    assert.deepStrictEqual(r2.findings.filter((f) => f.check === 'webgl').map((f) => [f.severity, f.selector]), [['error', '#stage']]);
    const out = await exportArtifact({ workspaceRoot: none.ws, entryPath: none.entry, browserPath, width: 400, height: 300, settleMs: 0 });
    assert.ok(out.ok && 'findings' in out && (out.findings ?? []).some((f) => f.check === 'webgl' && f.severity === 'error'), 'export reports it too');
  });

  it('exports a transparent cut-out, and warns when the page paints its own background', async () => {
    const cut = await workspaceWith(scene({ transparent: true }));
    const out = await exportArtifact({ workspaceRoot: cut.ws, entryPath: cut.entry, browserPath, width: 400, height: 300, transparent: true, settleMs: 0 });
    assert.ok(out.ok && 'files' in out, JSON.stringify(out));
    const file = await fs.readFile(path.join(cut.ws, out.files[0].path));
    assert.strictEqual(out.files[0].format, 'png');
    assert.ok(!isFullyOpaquePng(file), 'pixels around the object are transparent');
    assert.ok(!out.warnings.some((w) => /no pixel is transparent/.test(w)));

    const opaque = await workspaceWith(scene());
    const out2 = await exportArtifact({ workspaceRoot: opaque.ws, entryPath: opaque.entry, browserPath, width: 400, height: 300, transparent: true, settleMs: 0 });
    assert.ok(out2.ok && 'warnings' in out2 && out2.warnings.some((w) => /no pixel is transparent/.test(w)), JSON.stringify(out2));
  });
});

describe('webgl: three.js that never loaded', () => {
  it('turns failed three.js loads into one error each, pointing at the pinned import map', async () => {
    const { threeLoadFindings } = await import('../../export/webgl');
    const findings = threeLoadFindings([
      'Failed to load: https://unpkg.com/three@0.163.0/build/three.min.js (HTTP 404)',
      'Failed to load: https://unpkg.com/three@0.163.0/build/three.min.js (net::ERR_BLOCKED_BY_ORB)',
      'Failed to load: https://fonts.example/inter.woff2 (HTTP 404)',
      'Web fonts were still loading after 5s',
    ]);
    assert.deepStrictEqual(findings.map((f) => [f.check, f.severity]), [['webgl', 'error']]);
    assert.match(findings[0].message, /three\.min\.js[\s\S]*three@0\.160\.0\/build\/three\.module\.js/);
  });
});

describe('webgl: unmarked canvases (real browser; skipped when none is installed)', function () {
  this.timeout(60000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });

  it('still judges the canvas of a three.js page that forgot data-od-webgl', async () => {
    // Mentions three.js (so it opts into WebGL handling) but never draws: a blank, unmarked canvas.
    const html = scene({ blank: true }).replace(' data-od-webgl', '').replace('<script>', '<script>/* https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js */');
    const { ws, entry } = await workspaceWith(html);
    const r = await checkArtifact({ workspaceRoot: ws, entryPath: entry, browserPath, maxImages: 0, settleMs: 0 });
    assert.ok(r.ok);
    assert.deepStrictEqual(r.findings.filter((f) => f.check === 'webgl').map((f) => [f.severity, f.selector]), [['warning', '#stage']]);
  });
});
