import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { hasConceptRibbon, redesignFindings, redesignSiteOf } from '../../export/redesignChecks';
import { composeInstructions } from '../../generation/composeInstructions';
import { composeRedesignSection, loadRedesignContext, parseRobots, robotsDisallows, type ContentInventory } from '../../generation/contentInventory';
import { publishArtifact } from '../../generation/publishArtifact';
import { extractSite } from '../../generation/siteExtraction';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import { buildCritiqueInput } from '../../workspace/critique';

const FIXTURES = path.resolve(__dirname, '../../../src/test/fixtures/siteAudit');
const SITE = 'https://www.rosa.example/';

const inventory = (): ContentInventory => ({
  site: SITE,
  capturedAt: '2026-11-03T12:00:00Z',
  pages: [
    {
      url: SITE,
      title: "Rosa's Trattoria | Bologna",
      headings: [{ level: 1, text: 'Pasta made fresh every morning', selector: 'section.hero > h1' }],
      blocks: [{ kind: 'paragraph', text: 'Open Tuesday to Sunday, 12:00 to 22:00', selector: 'footer > p' }],
      ctas: [{ text: 'Book a table', href: `${SITE}#book`, selector: 'a.cta' }],
      nav: [{ text: 'Menu', href: `${SITE}menu.html` }],
      contact: { phones: ['051 123 4567'], emails: [], addresses: ['Via Roma 12, Bologna'] },
      hours: ['Open Tuesday to Sunday, 12:00 to 22:00'],
      prices: [{ text: '€14', selector: 'td:nth-of-type(4)' }],
      images: [{ src: `${SITE}pasta.png`, width: 320, height: 200, selector: 'img' }],
    },
  ],
});

async function workspaceWith(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-redesign-'));
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
  return root;
}

const AUDIT = JSON.stringify({
  groups: [
    { id: 'F1', title: 'Text that is hard to read', page: SITE, viewport: 'desktop', region: 'main', fix: 'Darken the button text to 4.5:1.' },
    { id: 'F2', title: 'The page is wider than a phone', page: SITE, viewport: 'phone', region: 'page', fix: 'Let the table wrap.' },
  ],
});

describe('redesign: robots.txt', () => {
  it('reads the rules for every crawler and lets the longest match win', () => {
    const rules = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /menu\nAllow: /menu/today\nDisallow: /*.pdf$\n# Disallow: /contact');
    assert.deepStrictEqual(rules, { allow: ['/menu/today'], disallow: ['/menu', '/*.pdf$'] });
    assert.ok(robotsDisallows('/menu', rules));
    assert.ok(robotsDisallows('/menu.html', rules));
    assert.ok(!robotsDisallows('/menu/today', rules));
    assert.ok(robotsDisallows('/files/a.pdf', rules));
    assert.ok(!robotsDisallows('/contact', rules));
    assert.ok(!robotsDisallows('/', parseRobots('User-agent: *\nDisallow:')));
  });
});

describe('redesign: brief section', () => {
  it('needs the content inventory and says how to get it', async () => {
    const root = await workspaceWith({});
    const result = await loadRedesignContext(root, '.open-design', { site: SITE });
    assert.ok(!result.ok);
    assert.match(result.error, /extract_open_design_design_system with url "https:\/\/www\.rosa\.example\/" and content: true/);
    assert.ok(!(await loadRedesignContext(root, '.open-design', { site: 'not a url' })).ok);
    assert.ok(!(await loadRedesignContext(root, '.open-design', { site: SITE, owned: 'yes' })).ok);
  });

  it('binds the inventory, lists the audit findings to fix and adds the ribbon for a site the user does not own', async () => {
    const root = await workspaceWith({
      '.open-design/.extract/rosa-example/content.json': JSON.stringify(inventory()),
      '.open-design/.audits/rosa-example/audit.json': AUDIT,
    });
    const loaded = await loadRedesignContext(root, '.open-design', { site: SITE });
    assert.ok(loaded.ok);
    assert.strictEqual(loaded.context.siteName, "Rosa's Trattoria");
    assert.strictEqual(loaded.context.findings.length, 2);
    const section = composeRedesignSection(loaded.context);
    assert.match(section, /data-od-redesign="https:\/\/www\.rosa\.example\/"/);
    assert.match(section, /\.open-design\/\.extract\/rosa-example\/content\.json/);
    assert.match(section, /data-od-bind/);
    assert.match(section, /\*\*F1 Text that is hard to read\*\* \(\/, desktop, main\)\. Darken the button text/);
    assert.match(section, /data-od-copy-edit/);
    assert.match(section, /data-od-original/);
    assert.match(section, /<aside data-od-concept[^>]*>Concept by <span data-od-concept-designer>DESIGNER<\/span>, not affiliated with Rosa's Trattoria<\/aside>/);
    const brief = composeInstructions({ skillName: 'web-prototype', skillBody: 'x', craftSections: [], brief: 'Redesign rosa.example', suggestedEntryPath: '.open-design/rosa/index.html', redesign: loaded.context });
    assert.match(brief, /## Redesign of https:\/\/www\.rosa\.example\//);
  });

  it('drops the ribbon for a site the user owns and says when there is no audit', async () => {
    const root = await workspaceWith({ '.open-design/.extract/rosa-example/content.json': JSON.stringify(inventory()) });
    const loaded = await loadRedesignContext(root, '.open-design', { site: SITE, owned: true });
    assert.ok(loaded.ok);
    const section = composeRedesignSection(loaded.context);
    assert.doesNotMatch(section, /<aside data-od-concept/);
    assert.match(section, /data-od-owned/);
    assert.match(section, /has not been audited/);
  });
});

describe('redesign: check findings', () => {
  it('reports a copy edit without its original', () => {
    const html = '<body data-od-redesign="https://www.rosa.example/" data-od-owned><p data-od-copy-edit data-od-original="Our pasta is made by hand every single morning by Rosa">Fresh pasta, every morning</p><h2 class="lead" data-od-copy-edit>Book now</h2></body>';
    const findings = redesignFindings(html);
    assert.deepStrictEqual(
      findings.map((f) => [f.check, f.selector]),
      [['copy-edit-original-missing', 'h2.lead[data-od-copy-edit]']],
    );
  });

  it('reports a concept with no ribbon, unless the site is owned', () => {
    assert.deepStrictEqual(redesignFindings('<body data-od-redesign="https://www.rosa.example/"><h1>Hi</h1></body>').map((f) => f.check), ['concept-unmarked']);
    assert.deepStrictEqual(redesignFindings('<body data-od-redesign="https://www.rosa.example/"><aside data-od-concept role="note">Concept</aside></body>'), []);
    assert.deepStrictEqual(redesignFindings('<body data-od-redesign="https://www.rosa.example/" data-od-owned><h1>Hi</h1></body>'), []);
    assert.deepStrictEqual(redesignFindings('<body><p data-od-concept-designer>x</p></body>'), []);
    assert.strictEqual(redesignSiteOf('<body class="x" data-od-redesign="https://www.rosa.example/">'), SITE);
    assert.ok(!hasConceptRibbon('<span data-od-concept-designer>me</span>'));
  });
});

describe('redesign: critic and publish', () => {
  it('gives the critic the audit findings for a redesign', async () => {
    const entry = '.open-design/rosa/index.html';
    const root = await workspaceWith({
      '.open-design/.audits/rosa-example/audit.json': AUDIT,
      [entry]: `<!doctype html><html><body data-od-redesign="${SITE}"><h1>Rosa's</h1></body></html>`,
    });
    const input = await buildCritiqueInput({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, manifest: null });
    assert.deepStrictEqual(input.auditFixes?.map((f) => f.id), ['F1', 'F2']);
    await fs.writeFile(path.join(root, entry), '<!doctype html><html><body><h1>Plain</h1></body></html>');
    assert.strictEqual((await buildCritiqueInput({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, manifest: null })).auditFixes, undefined);
  });

  it('warns when publishing a page with the concept ribbon', async () => {
    const entry = '.open-design/rosa/index.html';
    const page = (ribbon: boolean) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body data-od-redesign="${SITE}">${ribbon ? '<aside data-od-concept role="note">Concept by me, not affiliated with Rosa\'s</aside>' : ''}<h1>Rosa's</h1></body></html>`;
    const root = await workspaceWith({ [entry]: page(true) });
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: "Rosa's" } });
    const { ok, text } = await publishArtifact({ workspaceRoot: root, entryPath: entry, provider: 'claude-artifact' });
    assert.ok(ok, text);
    assert.match(text, /concept of someone else's site/);
    await fs.writeFile(path.join(root, entry), page(false));
    assert.doesNotMatch((await publishArtifact({ workspaceRoot: root, entryPath: entry, provider: 'claude-artifact' })).text, /concept of someone else's site/);
  });
});

describe('redesign: content pass in a browser', function () {
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
      if (name === 'robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /private\n');
        return;
      }
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

  it('copies the content verbatim, skips what robots.txt disallows and localizes images on request', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-content-'));
    const result = await extractSite({
      url: `${base}/`,
      extraUrls: [`${base}/menu.html`, `${base}/private.html`],
      workspaceRoot,
      outputDir: '.open-design',
      executablePath,
      allowHostsForTesting: ['127.0.0.1'],
      content: true,
      localizeImages: true,
    });
    assert.ok(result.status === 'ok', JSON.stringify(result).slice(0, 400));
    assert.deepStrictEqual(result.blocked, [{ url: `${base}/private.html`, reason: 'robots.txt disallows it' }]);
    assert.strictEqual(result.content, '.open-design/.extract/127-0-0-1/content.json');
    const inv = JSON.parse(await fs.readFile(path.join(workspaceRoot, result.content!), 'utf8')) as ContentInventory;
    assert.strictEqual(inv.pages.length, 2);
    const [home, menu] = inv.pages;
    assert.strictEqual(home.title, "Rosa's Trattoria");
    assert.deepStrictEqual(home.headings[0], { level: 1, text: 'Pasta made fresh every morning', selector: 'section.hero > h1' });
    assert.ok(home.ctas.some((c) => c.text === 'Book a table' && c.href?.endsWith('#book')), JSON.stringify(home.ctas));
    assert.deepStrictEqual(home.nav.map((n) => n.text).slice(0, 3), ['Menu', 'Hours', 'Find us']);
    assert.deepStrictEqual(home.hours, ['Open Tuesday to Sunday, 12:00 to 22:00']);
    assert.ok(home.contact.phones.includes('051 123 4567'), JSON.stringify(home.contact));
    assert.ok(home.contact.addresses.includes('Via Roma 12, Bologna'), JSON.stringify(home.contact));
    assert.ok(home.prices.some((p) => p.text === '€14'), JSON.stringify(home.prices));
    const pasta = home.images.find((i) => i.src.endsWith('/pasta.png'));
    assert.ok(pasta && pasta.alt === undefined && pasta.local?.startsWith('.open-design/.extract/127-0-0-1/images/'), JSON.stringify(home.images));
    await fs.access(path.join(workspaceRoot, pasta.local!));
    assert.ok(menu.blocks.some((b) => b.kind === 'item' && b.text === 'Pappardelle al cinghiale, €16'), JSON.stringify(menu.blocks));
  });

  it('writes no content.json without content, and keeps images remote without localizeImages', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-content-'));
    const plain = await extractSite({ url: `${base}/`, workspaceRoot, outputDir: '.open-design', executablePath, allowHostsForTesting: ['127.0.0.1'] });
    assert.ok(plain.status === 'ok');
    assert.strictEqual(plain.content, undefined);
    const remote = await extractSite({ url: `${base}/`, workspaceRoot, outputDir: '.open-design', executablePath, allowHostsForTesting: ['127.0.0.1'], content: true });
    assert.ok(remote.status === 'ok' && remote.content);
    const inv = JSON.parse(await fs.readFile(path.join(workspaceRoot, remote.content), 'utf8')) as ContentInventory;
    assert.ok(inv.pages[0].images.every((i) => i.local === undefined));
  });
});
