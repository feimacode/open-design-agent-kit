import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact } from '../../export/checkArtifact';
import { planCollectionSite } from '../../export/collectionSite';
import { validateFlowPlan } from '../../generation/flowPlan';
import { writeProject, readProject } from '../../portfolio/library';
import { deckTimingFindings, liveLinkFindings, portfolioPageFindings } from '../../portfolio/portfolioChecks';
import { loadPortfolioBrief, processRecords, validatePortfolioInput } from '../../portfolio/portfolioBrief';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const FIXTURE = path.resolve(__dirname, '../../../../../evals/fixtures/portfolio-library');
const OUT = '.open-design';

async function copyDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) await copyDir(a, b);
    else await fs.copyFile(a, b);
  }
}

function slide(attrs: string, notes = 'Say this.'): string {
  return `<section class="slide" ${attrs}><h2>Slide</h2>${notes ? `<aside class="notes">${notes}</aside>` : ''}</section>`;
}

describe('portfolio site and interview deck', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-portfolio-'));
    await copyDir(FIXTURE, root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('brief inputs', () => {
    it('takes one or two projects and 30, 45 or 60 minutes for a deck, and no length for a site', () => {
      assert.deepStrictEqual(validatePortfolioInput({ projects: ['a'] }, 'deck'), { ok: true, value: { kind: 'deck', projects: ['a'], length: 45 } });
      assert.strictEqual(validatePortfolioInput({ projects: ['a', 'b', 'c'] }, 'deck').ok, false);
      assert.strictEqual(validatePortfolioInput({ projects: ['a'], length: 50 }, 'deck').ok, false);
      assert.strictEqual(validatePortfolioInput({ projects: ['a'], length: 45 }, 'site').ok, false);
      assert.strictEqual(validatePortfolioInput({ projects: [] }, 'site').ok, false);
    });

    it('lists library facts and copies only pictures that may be shown, with srcset markup', async () => {
      const brief = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/portfolio-site/index.html`, portfolio: { projects: ['checkout-redesign', 'bank-onboarding'] }, kind: 'site' });
      assert.ok(brief.ok, !brief.ok ? brief.error : '');
      const { section, pictures } = brief.value;
      assert.match(section, /Sam Rivera/);
      assert.match(section, /\+18%/);
      assert.match(section, /about /, 'an estimated outcome is shown with "about"');
      assert.match(section, /rejected/);
      assert.match(section, /data-od-asset="checkout-redesign\//);
      // bank-onboarding's step 2 screen is internal: not copied, named as left out.
      assert.ok(!pictures.some((p) => p.asset === 'onboarding-step2'));
      assert.match(section, /onboarding-step2 \(internal\)/);
      for (const p of pictures) await fs.access(path.join(root, OUT, 'portfolio-site', p.src));
      assert.match(section, /no records for this project/, 'no process story without records');
    });

    it('refuses an internal project and an unknown slug', async () => {
      const p = (await readProject(root, OUT, 'design-system'))!;
      await writeProject(root, OUT, { ...p, privacy: 'internal' });
      const internal = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/site/index.html`, portfolio: { projects: ['design-system'] }, kind: 'site' });
      assert.ok(!internal.ok && /internal/.test(internal.error));
      const unknown = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/site/index.html`, portfolio: { projects: ['nope'] }, kind: 'site' });
      assert.ok(!unknown.ok && /No project "nope"/.test(unknown.error));
    });

    it('builds the process story only from records that exist', async () => {
      assert.deepStrictEqual(await processRecords(root, OUT, ['.open-design/missing/index.html']), []);
      const entry = `${OUT}/checkout/index.html`;
      await fs.mkdir(path.join(root, OUT, 'checkout'), { recursive: true });
      await fs.writeFile(path.join(root, entry), '<html><body>x</body></html>');
      await fs.writeFile(path.join(root, OUT, 'checkout', 'before-after.html'), '<html></html>');
      await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Checkout', metadata: { edits: [{ id: 'e1', verb: 'bolder', scope: 'pricing', at: '2026-01-01', status: 'checked' }] } } });
      const records = await processRecords(root, OUT, [entry]);
      assert.deepStrictEqual(records.map((r) => r.kind).sort(), ['before-after', 'steering']);
    });
  });

  describe('site export', () => {
    it('needs an index screen for a site, and publishes home as index.html with no map', async () => {
      assert.strictEqual(validateFlowPlan({ kind: 'site', screens: [{ id: 'home', title: 'Home' }] }).ok, false);
      const plan = { kind: 'site', screens: [{ id: 'index', title: 'Home' }, { id: 'checkout-redesign', title: 'Checkout' }, { id: 'about', title: 'About' }], links: [{ from: 'index', trigger: 'Read', to: 'checkout-redesign' }] };
      assert.ok(validateFlowPlan(plan).ok);
      const dir = `${OUT}/portfolio-site`;
      await fs.mkdir(path.join(root, dir), { recursive: true });
      for (const s of plan.screens) {
        const entryPath = `${dir}/${s.id}.html`;
        await fs.writeFile(path.join(root, entryPath), `<!doctype html><html><body><h1>${s.title}</h1><a href="about.html">About</a></body></html>`);
        await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: s.title, collectionId: 'portfolio-site', screenRole: s.id, metadata: { flow: { plan, screenId: s.id } } } });
      }
      const manifest = JSON.parse(await fs.readFile(path.join(root, `${dir}/about.html.artifact.json`), 'utf8'));
      const site = await planCollectionSite({ workspaceRoot: root, entryPath: `${dir}/about.html`, manifest });
      assert.ok(site.kind === 'collection' && site.ok);
      assert.strictEqual(site.plan.website, true);
      assert.deepStrictEqual(site.plan.pages.map((p) => p.bundlePath).sort(), ['about.html', 'checkout-redesign.html', 'index.html']);
      assert.match(site.plan.pages.find((p) => p.bundlePath === 'index.html')!.html, /<h1>Home<\/h1>/);
    });
  });

  describe('checks', () => {
    it('reports a talk that runs over, slides without minutes or notes, and no backup slides', () => {
      const deck = `<main>${slide('data-od-minutes="20"')}${slide('data-od-minutes="20"')}${slide('data-od-minutes="18"')}${slide('data-od-backup')}</main>`;
      const timing = deckTimingFindings(deck, 45);
      const over = timing.find((f) => f.check === 'deck-timing');
      assert.ok(over && /runs 13 minutes over/.test(over.message), JSON.stringify(timing));
      assert.ok(!timing.some((f) => f.check === 'deck-backup-missing'));
      const thin = deckTimingFindings(`<main>${slide('data-od-minutes="45"', '')}${slide('')}</main>`, 45);
      assert.deepStrictEqual(thin.map((f) => f.check).sort(), ['deck-backup-missing', 'deck-minutes-missing', 'deck-notes-missing']);
      assert.ok(!deckTimingFindings(`<main>${slide('data-od-minutes="42"')}${slide('data-od-backup')}</main>`, 45).some((f) => f.check === 'deck-timing'), '42 of 45 is within 10%');
    });

    it('reports an internal picture as an error, drafted alt text, and a case study without a summary', async () => {
      const html = `<!doctype html><html><body data-od-case-study="bank-onboarding"><nav>Work</nav>
        <img src="media/bank-onboarding/onboarding-step2-1400.webp" alt="Step two" data-od-asset="bank-onboarding/onboarding-step2">
        <img src="media/checkout-redesign/checkout-phone.png" alt="Checkout on a phone" data-od-asset="checkout-redesign/checkout-phone">
        <p>${'word '.repeat(40)}</p></body></html>`;
      const findings = await portfolioPageFindings({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/portfolio-site/bank-onboarding.html`, html, record: { kind: 'site', projects: ['bank-onboarding'] } });
      const codes = findings.map((f) => f.check);
      const internal = findings.find((f) => f.check === 'portfolio-internal');
      assert.ok(internal && internal.severity === 'error' && /onboarding-step2/.test(internal.message), JSON.stringify(findings));
      assert.ok(codes.includes('portfolio-alt-draft'));
      assert.ok(codes.includes('portfolio-summary'));
      assert.ok(codes.includes('portfolio-case-study-length'));
    });

    it('accepts a summary with the role and an outcome', async () => {
      const p = (await readProject(root, OUT, 'checkout-redesign'))!;
      const body = 'The checkout lost people at the address step. '.repeat(70);
      const html = `<!doctype html><html><body data-od-case-study="checkout-redesign"><section data-od-summary><p>${p.role}</p><p data-od-outcome>${p.outcomes![0].value}</p></section><p>${body}</p></body></html>`;
      const findings = await portfolioPageFindings({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/portfolio-site/checkout-redesign.html`, html, record: { kind: 'site', projects: ['checkout-redesign'] } });
      assert.deepStrictEqual(findings.filter((f) => f.check.startsWith('portfolio-summary') || f.check === 'portfolio-case-study-length'), []);
    });

    it('reports a live link that answers 404 and passes one that answers 200', async () => {
      const server = http.createServer((req, res) => {
        res.statusCode = req.url === '/gone' ? 404 : 200;
        res.end();
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const port = (server.address() as AddressInfo).port;
      try {
        const findings = await liveLinkFindings([`http://127.0.0.1:${port}/ok`, `http://127.0.0.1:${port}/gone`]);
        assert.strictEqual(findings.length, 1);
        assert.match(findings[0].message, /\/gone answers 404/);
      } finally {
        server.close();
      }
    });
  });

  describe('first screen (real browser; skipped when none is installed)', function () {
    this.timeout(60000);
    before(async function () {
      if (!(await findBrowser()).ok) this.skip();
    });

    it('reports a contact link below the fold on a phone, and not one on the first screen', async () => {
      const dir = `${OUT}/portfolio-site`;
      await fs.mkdir(path.join(root, dir), { recursive: true });
      const page = (contactLow: boolean) => `<!doctype html><html><head><style>body{margin:0;font:16px sans-serif} .hero{height:${contactLow ? 1200 : 300}px} .card{height:200px}</style></head>
        <body><div class="hero"><h1>Sam Rivera</h1><p>Senior product designer</p></div>
        <a href="mailto:sam@example.com">Email me</a><a class="card" data-od-project-card href="checkout-redesign.html">Checkout</a></body></html>`;
      const entryPath = `${dir}/index.html`;
      const register = () =>
        writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Home', collectionId: 'portfolio-site', screenRole: 'index', metadata: { portfolio: { kind: 'site', projects: ['checkout-redesign'] } } } });
      await fs.writeFile(path.join(root, entryPath), page(true));
      await register();
      const low = await checkArtifact({ workspaceRoot: root, outputDir: OUT, entryPath, maxImages: 0, states: false, saveRun: false, portfolioLinks: false });
      assert.ok(low.ok, !low.ok ? low.error : '');
      const first = low.findings.filter((f) => f.check === 'portfolio-first-screen');
      assert.ok(first.some((f) => /phone/.test(f.message) && /contact link/.test(f.message)), JSON.stringify(first));
      await fs.writeFile(path.join(root, entryPath), page(false));
      const ok = await checkArtifact({ workspaceRoot: root, outputDir: OUT, entryPath, maxImages: 0, states: false, saveRun: false, portfolioLinks: false });
      assert.ok(ok.ok);
      assert.deepStrictEqual(ok.findings.filter((f) => f.check === 'portfolio-first-screen'), []);
    });

    it('runs no portfolio checks on a page registered without portfolio inputs', async () => {
      const entryPath = `${OUT}/landing/index.html`;
      await fs.mkdir(path.join(root, OUT, 'landing'), { recursive: true });
      await fs.writeFile(path.join(root, entryPath), '<!doctype html><html><body><h1>Launch</h1><img src="x.png"></body></html>');
      await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Landing' } });
      const result = await checkArtifact({ workspaceRoot: root, outputDir: OUT, entryPath, maxImages: 0, states: false, saveRun: false });
      assert.ok(result.ok);
      assert.deepStrictEqual(result.findings.filter((f) => f.check.startsWith('portfolio-') || f.check.startsWith('deck-')), []);
    });
  });
});
