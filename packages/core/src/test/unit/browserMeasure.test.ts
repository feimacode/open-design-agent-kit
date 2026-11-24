import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { launchLiveBrowser } from '../../export/livePage';
import { BROWSER_MEASURE_MAX_BYTES, browserMeasureLoader, browserMeasureScript, extractFromMeasured, validateMeasuredSource } from '../../generation/browserMeasure';
import { extractSite } from '../../generation/siteExtraction';

const FIXTURES = path.resolve(__dirname, '../../../src/test/fixtures/siteExtraction');

describe('browser-measured source (add-browser-measured-source)', () => {
  it('is one versioned script under the inline cap, and a loader that fetches it', () => {
    const script = browserMeasureScript();
    assert.match(script.version, /^\d+-[0-9a-f]{12}$/);
    assert.ok(Buffer.byteLength(script.source) <= BROWSER_MEASURE_MAX_BYTES, `${Buffer.byteLength(script.source)} bytes`);
    assert.strictEqual(browserMeasureScript(), script);
    assert.match(browserMeasureLoader('https://od.example/measure/abc.js'), /^fetch\("https:\/\/od\.example\/measure\/abc\.js"\)/);
  });

  it('refuses a stale script version, data that is not the result, and a url that is not a page', () => {
    const stale = validateMeasuredSource({ kind: 'measured', url: 'https://example.com/', data: { scriptVersion: '0-000000000000', page: {}, viewport: {} } }, 0);
    assert.ok(!stale.ok && /script version 0-000000000000/.test(stale.error) && /Nothing was drafted/.test(stale.error));
    const garbage = validateMeasuredSource({ kind: 'measured', url: 'https://example.com/', data: 'not json' }, 1);
    assert.ok(!garbage.ok && /sources\[1\]/.test(garbage.error));
    const noUrl = validateMeasuredSource({ kind: 'measured', data: '{}' }, 0);
    assert.ok(!noUrl.ok && /needs url/.test(noUrl.error));
  });
});

describe('browser-measured source in a browser', function () {
  this.timeout(120_000);
  let server: http.Server;
  let base: string;
  let executablePath: string;

  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    executablePath = found.executablePath;
    server = http.createServer((req, res) => {
      const name = (req.url ?? '/').split('?')[0].replace(/^\//, '') || 'light.html';
      fs.readFile(path.join(FIXTURES, path.basename(name)))
        .then((body) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(body);
        })
        .catch(() => {
          res.writeHead(404);
          res.end();
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server?.close());

  /** The script run the way an agent's browser tool runs it: one expression, its result a JSON string. */
  const measureInPage = async (file: string): Promise<{ data: string; screenshot: string }> => {
    const live = await launchLiveBrowser(executablePath, ['127.0.0.1']);
    try {
      await live.page.setViewport({ width: 1280, height: 800 });
      await live.page.goto(`${base}/${file}`, { waitUntil: 'load' });
      const data = (await live.page.evaluate(browserMeasureScript().source)) as string;
      const screenshot = Buffer.from(await live.page.screenshot({ type: 'png' })).toString('base64');
      return { data, screenshot };
    } finally {
      await live.close();
    }
  };

  const hexes = (v: string | undefined) => (v ? /#[0-9a-f]{6}/i.exec(v)?.[0]?.toLowerCase() : undefined);
  const px = (v: string | undefined) => (v && /^-?\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : undefined);

  it('drafts the same tokens as the local extraction, with declared hover and crops from the screenshot', async () => {
    const { data, screenshot } = await measureInPage('light.html');
    const checked = validateMeasuredSource({ kind: 'measured', url: `${base}/light.html`, data, screenshot }, 0);
    assert.ok(checked.ok, checked.ok ? '' : checked.error);
    if (!checked.ok) return;
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-measured-'));
    const measured = await extractFromMeasured({ workspaceRoot, outputDir: '.open-design', sources: [checked.source], allowHostsForTesting: ['127.0.0.1'] });
    const local = await extractSite({ url: `${base}/light.html`, discover: false, workspaceRoot: await fs.mkdtemp(path.join(os.tmpdir(), 'od-local-')), outputDir: '.open-design', executablePath, allowHostsForTesting: ['127.0.0.1'] });
    assert.strictEqual(local.status, 'ok');
    if (local.status !== 'ok') return;
    const a = measured.draft!.tokens;
    const b = local.draft!.tokens;
    const compared: string[] = [];
    for (const [token, value] of Object.entries(b)) {
      if (token.startsWith('--motion') || token === '--focus-ring' || token.endsWith('-phone')) continue;
      if (hexes(value) && /^#|^rgb/.test(value)) {
        assert.strictEqual(hexes(a[token]), hexes(value), `${token}: browser ${a[token]}, local ${value}`);
        compared.push(token);
      } else if (px(value) !== undefined) {
        assert.ok(px(a[token]) !== undefined && Math.abs(px(a[token])! - px(value)!) <= 1, `${token}: browser ${a[token]}, local ${value}`);
        compared.push(token);
      }
    }
    assert.ok(compared.length >= 10, compared.join(', '));
    assert.strictEqual(a['--accent-hover'], '#46a302');
    assert.strictEqual(measured.draft!.sources['--accent-hover'].confidence, 'declared');
    assert.strictEqual(measured.draft!.sources['--accent'].confidence, 'measured');
    const bundle = path.join(workspaceRoot, measured.bundleDir);
    await fs.access(path.join(bundle, 'desktop.png'));
    await fs.access(path.join(bundle, 'crops', 'accent.png'));
    const evidence = JSON.parse(await fs.readFile(path.join(bundle, 'evidence.json'), 'utf8'));
    assert.strictEqual(evidence.measuredBy, 'browser');
    assert.ok(measured.notes.some((n) => /user's browser/.test(n)));
  });
});
