import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { auditSite, cropMarked, formatAuditSiteResult, groupFindings, renderAuditReport, type AuditFinding } from '../../export/siteAudit';

const FIXTURES = path.resolve(__dirname, '../../../src/test/fixtures/siteAudit');

const finding = (over: Partial<AuditFinding>): AuditFinding => ({
  check: 'contrast',
  severity: 'warning',
  message: 'x has a contrast ratio of 1.5:1',
  page: 'https://rosa.example/',
  viewport: 'desktop',
  region: 'main',
  aboveFold: false,
  ...over,
});

describe('site audit: ranking and report', () => {
  it('ranks a call to action above many footer findings of the same kind', () => {
    const footer = Array.from({ length: 40 }, (_, i) => finding({ selector: `p.f${i} "Line ${i}"`, region: 'footer' }));
    const cta = finding({ selector: 'a.cta "Book a table"', region: 'main', aboveFold: true });
    const groups = groupFindings([...footer, cta]);
    assert.deepStrictEqual(
      groups.map((g) => [g.region, g.count]),
      [
        ['main', 1],
        ['footer', 40],
      ],
    );
    assert.strictEqual(groups[0].id, 'F1');
    assert.strictEqual(groups[0].title, 'Text that is hard to read');
  });

  it('puts a missing viewport above taste findings', () => {
    const groups = groupFindings([
      finding({ check: 'slop-glow', selector: 'div.hero', aboveFold: true }),
      finding({ check: 'missing-viewport', severity: 'error', region: 'page', viewport: 'phone' }),
    ]);
    assert.strictEqual(groups[0].check, 'missing-viewport');
  });

  it('crops round the element and marks it', () => {
    const src = new PNG({ width: 200, height: 120 });
    src.data.fill(255);
    const out = PNG.sync.read(cropMarked(PNG.sync.write(src), { x: 80, y: 50, width: 20, height: 10 }, 1, 10));
    assert.ok(out.width <= 200 && out.width >= 40, String(out.width));
    const reds = [];
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i] === 220 && out.data[i + 1] === 38) reds.push(i);
    assert.ok(reds.length > 40, 'outline drawn');
  });

  it('writes a report with the top findings, the scope and no score', () => {
    const groups = groupFindings([finding({ selector: 'a.cta "Book a table"', aboveFold: true })]);
    const html = renderAuditReport({ url: 'https://www.rosa.example/', capturedAt: '2026-11-03T11:00:00Z', pages: ['https://www.rosa.example/'], groups, screenshots: [], blocked: [], pageWeight: [{ page: 'https://www.rosa.example/', bytes: 3_200_000, requests: 40 }], notes: [] }, '.open-design/.audits/rosa-example');
    assert.match(html, /What’s holding rosa\.example back/);
    assert.match(html, /Text that is hard to read/);
    assert.match(html, /What it doesn’t measure/);
    assert.match(html, /Search ranking and SEO/);
    assert.match(html, /3\.1 MB in 40 requests/);
    assert.doesNotMatch(html, /score:\s*\d|\d+\s*\/\s*100/i);
    assert.doesNotMatch(html, /\/100|lighthouse|speed index/i);
  });
});

describe('site audit in a browser', function () {
  this.timeout(120_000);
  let server: http.Server;
  let base: string;
  let executablePath: string;

  before(async function () {
    const found = await findBrowser({});
    if (!found.ok) this.skip();
    executablePath = found.executablePath;
    server = http.createServer((req, res) => {
      const name = (req.url ?? '/').split('?')[0].replace(/^\//, '') || 'index.html';
      fs.readFile(path.join(FIXTURES, path.basename(name)))
        .then((body) => {
          res.writeHead(200, { 'content-type': name.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' });
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

  it('refuses private hosts unless allowed for testing', async () => {
    const result = await auditSite({ url: `${base}/`, workspaceRoot: os.tmpdir(), outputDir: '.open-design', executablePath });
    assert.strictEqual(result.status, 'invalid-args');
  });

  it('finds the fixture site’s problems and writes the report', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-audit-'));
    const result = await auditSite({ url: `${base}/`, extraUrls: [`${base}/menu.html`], workspaceRoot, outputDir: '.open-design', executablePath, allowHostsForTesting: ['127.0.0.1'] });
    assert.ok(result.status === 'ok', JSON.stringify(result).slice(0, 400));
    const checks = new Set(result.findings.map((f) => `${f.check}@${new URL(f.page).pathname}`));
    for (const expected of ['contrast@/', 'tap-target@/', 'horizontal-scroll@/', 'missing-alt@/', 'broken-asset@/', 'missing-viewport@/menu.html']) {
      assert.ok(checks.has(expected), `${expected} in ${[...checks].join(', ')}`);
    }
    assert.ok(!result.findings.some((f) => /^(state-|flow-|sample-data|token-|type-scale)/.test(f.check)), 'no kit-markup checks');
    const cta = result.findings.find((f) => f.check === 'contrast' && /Book a table/.test(f.selector ?? ''));
    assert.ok(cta?.rect && cta.aboveFold, JSON.stringify(cta));
    const top = result.groups.slice(0, 5);
    assert.ok(top.some((g) => g.check === 'missing-viewport'));
    assert.ok(top.some((g) => g.crop), 'a crop for a top group');
    const report = await fs.readFile(path.join(workspaceRoot, result.report), 'utf8');
    assert.match(report, /What’s holding 127\.0\.0\.1 back/);
    const json = JSON.parse(await fs.readFile(path.join(workspaceRoot, result.auditDir, 'audit.json'), 'utf8'));
    assert.strictEqual(json.findings.length, result.findings.length);
    assert.match(formatAuditSiteResult(result), /"report": "\.open-design\/\.audits\/127-0-0-1\/index\.html"/);
  });
});
