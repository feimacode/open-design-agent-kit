import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { startStaticServer } from '../../export/staticServer';
import { imageSize, stripImageMetadata, sniffImage } from '../../portfolio/images';
import { formatImportWorkResult, importWork } from '../../portfolio/importWork';
import { assetForOutput, isInsideLibrary, outcomeLine, projectGaps, readLibrary, readProject, validateProjectFields } from '../../portfolio/library';
import { formatLibrary, saveProject } from '../../portfolio/saveProject';

function png(width: number, height: number, withText = false, stripes = false): Buffer {
  const img = new PNG({ width, height });
  for (let i = 0; i < img.data.length; i += 4) {
    const x = (i / 4) % width;
    img.data[i] = stripes ? (x % 8 < 4 ? 240 : 10) : x < width / 2 ? 220 : 20;
    img.data[i + 1] = 40;
    img.data[i + 2] = 90;
    img.data[i + 3] = 255;
  }
  const data = PNG.sync.write(img);
  if (!withText) return data;
  // A tEXt chunk after IHDR, the way phones and editors add metadata (CRC is not checked by the stripper).
  const body = Buffer.from('Comment\0GPS 51.5,-0.12', 'latin1');
  const chunk = Buffer.alloc(12 + body.length);
  chunk.writeUInt32BE(body.length, 0);
  chunk.write('tEXt', 4, 'ascii');
  body.copy(chunk, 8);
  return Buffer.concat([data.subarray(0, 33), chunk, data.subarray(33)]);
}

/** A minimal JPEG header: SOI, APP1 (EXIF with a GPS tag), SOF0 640×480, SOS, EOI. Not decodable, but enough for parsing. */
function jpegWithExif(): Buffer {
  const exif = Buffer.from('Exif\0\0GPSLatitude=51.5', 'latin1');
  const app1 = Buffer.alloc(4 + exif.length);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  exif.copy(app1, 4);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, sos]);
}

describe('work library', () => {
  let root: string;
  const out = '.open-design';
  const noBrowser = process.env.OPEN_DESIGN_BROWSER_PATH;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-library-'));
  });
  afterEach(async () => {
    process.env.OPEN_DESIGN_BROWSER_PATH = noBrowser;
    if (noBrowser === undefined) delete process.env.OPEN_DESIGN_BROWSER_PATH;
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('images', () => {
    it('reads sizes from PNG and JPEG headers', () => {
      assert.deepStrictEqual(imageSize(png(30, 20)), { width: 30, height: 20 });
      assert.deepStrictEqual(imageSize(jpegWithExif()), { width: 640, height: 480 });
    });

    it('removes EXIF from JPEG and text chunks from PNG', () => {
      const j = stripImageMetadata(jpegWithExif());
      assert.strictEqual(j.removed, 1);
      assert.ok(!j.data.includes(Buffer.from('GPSLatitude')));
      assert.strictEqual(sniffImage(j.data), 'image/jpeg');
      assert.deepStrictEqual(imageSize(j.data), { width: 640, height: 480 });
      const p = stripImageMetadata(png(10, 10, true));
      assert.strictEqual(p.removed, 1);
      assert.ok(!p.data.includes(Buffer.from('GPS 51.5')));
      assert.deepStrictEqual(PNG.sync.read(p.data).width, 10);
    });
  });

  describe('facts', () => {
    it('refuses an outcome without a source and a qualitative outcome with a number', () => {
      const a = validateProjectFields({ outcomes: [{ text: 'More sign-ups' }] });
      assert.ok(!a.ok && /needs a source/.test(a.error));
      const b = validateProjectFields({ outcomes: [{ text: 'Happier support team', value: '20%', source: 'qualitative' }] });
      assert.ok(!b.ok && /can't carry a value/.test(b.error));
    });

    it('shows measured, estimated and qualitative outcomes differently', () => {
      assert.strictEqual(outcomeLine({ text: 'Checkout conversion', value: '+18%', source: 'measured' }), 'Checkout conversion: +18%');
      assert.strictEqual(outcomeLine({ text: 'Support tickets', value: '-30%', source: 'estimated' }), 'Support tickets: about -30%');
      assert.strictEqual(outcomeLine({ text: 'Sales found it easier to demo', source: 'qualitative' }), 'Sales found it easier to demo');
    });

    it('knows the library folder', () => {
      assert.ok(isInsideLibrary(out, '.open-design/portfolio/projects/a/x.html'));
      assert.ok(!isInsideLibrary(out, '.open-design/portfolio-site/index.html'));
    });
  });

  describe('save_open_design_project', () => {
    it('needs a title, role and privacy level for a new project, then lists what is missing', async () => {
      const bad = await saveProject({ workspaceRoot: root, outputDir: out, project: { title: 'Checkout redesign' } });
      assert.ok(!bad.ok && /needs a title, the designer's role and a privacy level/.test(bad.text));
      const ok = await saveProject({ workspaceRoot: root, outputDir: out, owner: { name: 'Ada Park', role: 'Product designer' }, project: { title: 'Checkout redesign', role: 'Lead designer', privacy: 'public' } });
      assert.ok(ok.ok, ok.text);
      assert.match(ok.text, /Added project "checkout-redesign"/);
      assert.match(ok.text, /Still missing: .*problem/);
      const lib = await readLibrary(root, out);
      assert.deepStrictEqual(lib?.projects, ['checkout-redesign']);
      assert.strictEqual(lib?.owner.name, 'Ada Park');
    });

    it('merges fields and keeps those left out', async () => {
      await saveProject({ workspaceRoot: root, outputDir: out, project: { title: 'Checkout redesign', role: 'Lead designer', privacy: 'public', problem: 'Too many steps' } });
      await saveProject({ workspaceRoot: root, outputDir: out, project: { slug: 'checkout-redesign', decisions: [{ choice: 'One page checkout', rejected: ['Wizard'] }] } });
      const p = await readProject(root, out, 'checkout-redesign');
      assert.strictEqual(p?.problem, 'Too many steps');
      assert.strictEqual(p?.decisions?.[0].rejected?.[0], 'Wizard');
    });
  });

  describe('import_open_design_work', () => {
    beforeEach(async () => {
      // No browser in these tests: originals only.
      process.env.OPEN_DESIGN_BROWSER_PATH = path.join(root, 'no-browser');
      await saveProject({ workspaceRoot: root, outputDir: out, project: { title: 'Bank app', role: 'Designer', privacy: 'unlisted' } });
    });

    it('imports a workspace image without its metadata and flags a narrow one', async () => {
      await fs.writeFile(path.join(root, 'shot.png'), png(1200, 800, true));
      const result = await importWork({ workspaceRoot: root, outputDir: out, project: 'bank-app', sources: [{ kind: 'file', path: 'shot.png', alt: 'Account overview screen' }] });
      assert.ok(result.ok, formatImportWorkResult(result));
      const asset = result.imported[0].asset;
      assert.strictEqual(asset.id, 'shot');
      assert.strictEqual(asset.altDraft, true);
      assert.ok(result.imported[0].warnings.some((w) => /1600 px Dribbble minimum/.test(w)));
      const stored = await fs.readFile(path.join(root, out, 'portfolio/projects/bank-app', asset.file));
      assert.ok(!stored.includes(Buffer.from('GPS 51.5')));
      const p = await readProject(root, out, 'bank-app');
      assert.strictEqual(p?.assets.length, 1);
      assert.match(projectGaps(p!).join(';'), /confirmation of 1 drafted alt text/);
    });

    it('refuses an asset looser than its project and a file outside the workspace', async () => {
      await fs.writeFile(path.join(root, 'shot.png'), png(20, 20));
      const result = await importWork({
        workspaceRoot: root,
        outputDir: out,
        project: 'bank-app',
        sources: [
          { kind: 'file', path: 'shot.png', privacy: 'public' },
          { kind: 'file', path: '../etc/passwd' },
        ],
      });
      assert.strictEqual(result.imported.length, 0);
      assert.match(result.failed[0].error, /looser than the project's "unlisted"/);
      assert.match(result.failed[1].error, /inside the workspace/);
    });

    it('asks for the Figma connector when there is no token', async () => {
      const result = await importWork({ workspaceRoot: root, outputDir: out, project: 'bank-app', sources: [{ kind: 'figma', url: 'https://www.figma.com/design/abc123/Bank?node-id=1-2' }] });
      assert.match(result.steps[0], /get_screenshot/);
    });

    it('confirms alt text, blocks a redacted asset without copies, and says why', async () => {
      await fs.writeFile(path.join(root, 'shot.png'), png(40, 40));
      await importWork({ workspaceRoot: root, outputDir: out, project: 'bank-app', sources: [{ kind: 'file', path: 'shot.png', alt: 'Home' }] });
      const saved = await saveProject({ workspaceRoot: root, outputDir: out, project: { slug: 'bank-app' }, assets: [{ id: 'shot', confirmAlt: true, redactions: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.2 }] }] });
      assert.ok(saved.ok, saved.text);
      assert.match(saved.text, /no output will show it/);
      const p = (await readProject(root, out, 'bank-app'))!;
      assert.strictEqual(p.assets[0].altDraft, undefined);
      const forOutput = assetForOutput(p.assets[0]);
      assert.ok(!forOutput.ok);
      const looser = await saveProject({ workspaceRoot: root, outputDir: out, project: { slug: 'bank-app' }, assets: [{ id: 'shot', privacy: 'public' }] });
      assert.ok(!looser.ok && /can't be looser/.test(looser.text));
      assert.match(await formatLibrary(root, out, 'bank-app'), /1 redaction box \(copies not made yet\)/);
    });
  });

  describe('with a browser', function () {
    this.timeout(60_000);
    before(async function () {
      const found = await findBrowser({});
      if (!found.ok) this.skip();
    });

    it('captures a live page and a kit design at desktop and phone sizes', async () => {
      await saveProject({ workspaceRoot: root, outputDir: out, project: { title: 'Bank app', role: 'Designer', privacy: 'public' } });
      await fs.mkdir(path.join(root, 'site'), { recursive: true });
      await fs.writeFile(path.join(root, 'site/index.html'), '<!doctype html><meta name=viewport content="width=device-width"><h1 style="font:48px sans-serif">Bank</h1>');
      await fs.mkdir(path.join(root, out, 'home'), { recursive: true });
      await fs.writeFile(path.join(root, out, 'home/home.html'), '<!doctype html><h1>Home</h1>');
      const server = await startStaticServer(path.join(root, 'site'));
      try {
        const result = await importWork({
          workspaceRoot: root,
          outputDir: out,
          project: 'bank-app',
          sources: [{ kind: 'url', url: server.baseUrl }, { kind: 'design', entryPath: `${out}/home/home.html` }],
          allowHostsForTesting: ['127.0.0.1'],
        });
        assert.ok(result.ok, formatImportWorkResult(result));
        const ids = result.imported.map((i) => i.asset.id);
        assert.strictEqual(ids.length, 4, ids.join(', '));
        const desktop = result.imported[0].asset;
        assert.strictEqual(desktop.width, 2880);
        assert.strictEqual(desktop.device, 'browser');
        assert.strictEqual(result.imported[1].asset.width, 1170);
        assert.deepStrictEqual((await readProject(root, out, 'bank-app'))?.designs, [`${out}/home/home.html`]);
      } finally {
        await server.close();
      }
    });

    it('makes WebP widths and a redacted copy that hides what the box covers', async () => {
      await saveProject({ workspaceRoot: root, outputDir: out, project: { title: 'Bank app', role: 'Designer', privacy: 'public' } });
      await fs.writeFile(path.join(root, 'wide.png'), png(1800, 600, false, true));
      const result = await importWork({ workspaceRoot: root, outputDir: out, project: 'bank-app', sources: [{ kind: 'file', path: 'wide.png' }] });
      assert.ok(result.ok, formatImportWorkResult(result));
      const asset = result.imported[0].asset;
      assert.deepStrictEqual(asset.variants?.map((v) => v.width), [800, 1400]);
      const saved = await saveProject({ workspaceRoot: root, outputDir: out, project: { slug: 'bank-app' }, assets: [{ id: 'wide', redactions: [{ x: 0, y: 0, width: 1, height: 1 }] }] });
      assert.match(saved.text, /redacted copies made/);
      const p = (await readProject(root, out, 'bank-app'))!;
      const forOutput = assetForOutput(p.assets[0]);
      assert.ok(forOutput.ok);
      const redacted = PNG.sync.read(await fs.readFile(path.join(root, out, 'portfolio/projects/bank-app', forOutput.value.file)));
      // The original alternates 240 and 10 every 4 px, like fine text; under the box the stripes are gone.
      const at = (x: number) => redacted.data[(300 * redacted.width + x) * 4];
      for (const x of [101, 503, 1207]) assert.ok(Math.abs(at(x) - at(x + 4)) < 40, `stripes still readable at ${x}: ${at(x)} vs ${at(x + 4)}`);
    });
  });
});
