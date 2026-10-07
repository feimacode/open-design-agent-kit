import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { load } from 'cheerio';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact } from '../../export/checkArtifact';
import { exportArtifact, formatExportResult } from '../../export/exportArtifact';
import { absolutizeUrls, pasteFragment, type InlineExportResult } from '../../export/inlineExport';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/mail/mail.html';
const EMAIL_EXAMPLE = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'local', 'examples', 'email-campaign', 'example.html');
const VENDORED_EMAIL = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design', 'examples', 'email-marketing', 'example.html');

async function workspace(html: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-inline-'));
  await fs.mkdir(path.join(root, '.open-design', 'mail'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), html);
  await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Launch day' } });
  return root;
}
const read = (root: string, rel: string) => fs.readFile(path.join(root, rel), 'utf8');
type Ok = Extract<InlineExportResult, { ok: true }>;

describe('paste fragment rules and URL rewriting (no browser)', () => {
  it('turns top-level blocks into sections for WeChat', () => {
    const out = pasteFragment('<div style="color:red"><p>a</p></div><p>b</p>loose', 'wechat');
    assert.strictEqual(out, '<section style="color:red"><p>a</p></section><section><p>b</p></section><section>loose</section>');
  });

  it('flattens wrappers for Notion and keeps only code language classes', () => {
    const out = pasteFragment('<section><div><h2>T</h2><p>x</p></div></section><pre><code class="language-ts">a</code></pre>', 'notion');
    assert.strictEqual(out, '<h2>T</h2><p>x</p><pre><code class="language-ts">a</code></pre>');
  });

  it('resolves relative image and link URLs against baseUrl, leaving absolute ones alone', () => {
    const out = absolutizeUrls('<img src="assets/hero.png"><img src="https://x.dev/a.png"><a href="pricing.html">p</a><a href="#top">t</a><a href="mailto:a@b.c">m</a>', 'https://cdn.example.com/launch', '.open-design/mail');
    const $ = load(out);
    assert.deepStrictEqual($('img').map((_, e) => $(e).attr('src')).get(), ['https://cdn.example.com/launch/assets/hero.png', 'https://x.dev/a.png']);
    assert.deepStrictEqual($('a').map((_, e) => $(e).attr('href')).get(), ['https://cdn.example.com/launch/pricing.html', '#top', 'mailto:a@b.c']);
  });
});

describe('email and paste export (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });
  const run = (root: string, extra: Record<string, unknown>) => exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, ...extra } as Parameters<typeof exportArtifact>[0]);

  it('inlines styles created at runtime (as the Tailwind CDN does), drops classes and scripts, and does not repeat inherited text styles', async () => {
    const root = await workspace(`<!doctype html><html><head><script>
      const s = document.createElement('style'); s.textContent = '.brand{color:rgb(10, 120, 60);font-weight:700}.box{padding:12px;background:rgb(240, 240, 240)}.w{width:100%;max-width:480px}';
      document.head.appendChild(s);</script></head>
      <body style="color:rgb(20, 20, 20)"><div class="box w"><p class="brand" data-od-id="x">Hello</p><p>Plain</p></div></body></html>`);
    const result = (await run(root, { format: 'paste', target: 'generic' })) as Ok;
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.files.map((f) => f.path), ['.open-design/mail/exports/mail.generic.html']);
    const $ = load(await read(root, result.files[0].path));
    assert.strictEqual($('[class]').length, 0);
    assert.strictEqual($('script, style, [data-od-id]').length, 0);
    const box = $('div').attr('style') ?? '';
    assert.match(box, /padding-top:12px/);
    assert.match(box, /background-color:rgb\(240, 240, 240\)/);
    assert.match(box, /width:100%/, 'authored width kept, not resolved to px');
    assert.match(box, /max-width:480px/);
    assert.match($('p').first().attr('style') ?? '', /color:rgb\(10, 120, 60\)/);
    assert.match($('p').first().attr('style') ?? '', /font-weight:700/);
    assert.doesNotMatch($('p').last().attr('style') ?? '', /color:/, 'inherited color not repeated');
  });

  it('warns when pseudo-element content would be lost', async () => {
    const root = await workspace('<!doctype html><html><head><style>h2::before{content:"★ "}</style></head><body><h2>Title</h2></body></html>');
    const result = (await run(root, { format: 'paste', target: 'generic' })) as Ok;
    assert.ok(result.warnings.some((w) => /::before/.test(w)), JSON.stringify(result.warnings));
  });

  it('writes an email document, its plain-text twin, and absolute image URLs with baseUrl', async () => {
    const root = await workspace(`<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Georgia,serif;color:#222">
      <table data-od-email role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff"><tr><td style="padding:24px">
      <h1>Launch day is here</h1><p>Everything you asked for in one release, ready for your team today.</p>
      <img src="assets/hero.png" alt="The new dashboard" width="552"><a href="https://example.com/launch">Read the post</a>
      </td></tr></table></body></html>`);
    const result = (await run(root, { format: 'email', baseUrl: 'https://cdn.example.com/launch/' })) as Ok;
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepStrictEqual(result.files.map((f) => path.basename(f.path)), ['mail.email.html', 'mail.email.txt']);
    const html = await read(root, result.files[0].path);
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
    assert.match(html, /mso-hide:all[^>]*>Everything you asked for/);
    assert.match(html, /src="https:\/\/cdn\.example\.com\/launch\/assets\/hero\.png"/);
    assert.match(html, /<h1[^>]*font-family:Georgia/, 'text styles repeated for email');
    const text = await read(root, result.files[1].path);
    assert.match(text, /Launch day is here/);
    assert.match(text, /Links:\n- Read the post: https:\/\/example\.com\/launch/);
    assert.deepStrictEqual(result.findings.filter((f) => f.severity === 'error'), []);
    assert.match(formatExportResult(result), /open .*mail\.email\.html in a browser, select all, copy/);
  });

  it('exports the email-campaign example cleanly: no email findings, Outlook button kept, link styles kept, fits a phone', async () => {
    const root = await workspace(await fs.readFile(EMAIL_EXAMPLE, 'utf8'));
    const check = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 0 });
    assert.ok(check.ok);
    assert.deepStrictEqual(check.findings.filter((f) => f.severity !== 'info'), []);
    const result = (await run(root, { format: 'email' })) as Ok;
    assert.deepStrictEqual(result.findings, []);
    const html = await read(root, result.files[0].path);
    assert.match(html, /v:roundrect/);
    assert.match(html, /mso-hide:all[^>]*>Scheduled reports/);
    const $ = load(html);
    assert.match($('a[href="https://ledgerly.example/reports"]').attr('style') ?? '', /text-decoration:none/);
    assert.match($('table[role="presentation"]').eq(1).attr('style') ?? '', /margin-left:auto;margin-right:auto|margin-right:auto/);
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath: browserPath, headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 800 });
      await page.setContent(html, { waitUntil: 'load' });
      assert.ok(Number(await page.evaluate('document.documentElement.scrollWidth')) <= 390);
    } finally {
      await browser.close();
    }
  });

  it('reports what breaks in inboxes for the vendored email-marketing example, and still writes it', async () => {
    const root = await workspace(await fs.readFile(VENDORED_EMAIL, 'utf8'));
    const result = (await run(root, { format: 'email' })) as Ok;
    assert.ok(result.ok, JSON.stringify(result));
    const checks = new Set(result.findings.map((f) => f.check));
    assert.ok(checks.has('email-layout'), [...checks].join(','));
    assert.ok(checks.has('email-svg'), [...checks].join(','));
    assert.ok((await fs.stat(path.join(root, result.files[0].path))).size > 0);
  });

  it('runs the email checks in the visual check for email artifacts, with local images as a note', async () => {
    const root = await workspace('<!doctype html><html><body><div data-od-email><div style="display:flex"><p>a</p><p>b</p></div><img src="assets/x.png"></div></body></html>');
    const result = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 0 });
    assert.ok(result.ok);
    const byCheck = (c: string) => result.findings.filter((f) => f.check === c);
    assert.strictEqual(byCheck('email-layout')[0]?.severity, 'error');
    assert.strictEqual(byCheck('email-local-image')[0]?.severity, 'info');
    assert.strictEqual(byCheck('email-missing-alt').length, 1);
  });

  it('rejects bad combinations without a browser', async () => {
    const root = await workspace('<p>x</p>');
    for (const args of [{ format: 'paste' }, { format: 'email', target: 'wechat' }, { format: 'email', width: 600, height: 800 }, { format: 'png', target: 'notion' }, { format: 'email', baseUrl: 'http://insecure.example' }]) {
      const result = await run(root, args);
      assert.ok(!result.ok && result.code === 'invalid-args', JSON.stringify([args, result]));
    }
  });
});
