import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact } from '../../export/exportArtifact';
import { anonymityFindings, identifyingTerms, neutralLabels } from '../../portfolio/anonymise';
import { readLibrary, readProject } from '../../portfolio/library';
import { importWork } from '../../portfolio/importWork';
import { loadPortfolioBrief, portfolioKindForSkill } from '../../portfolio/portfolioBrief';
import { targetFindings } from '../../portfolio/portfolioChecks';
import { portfolioGuard } from '../../portfolio/privacy';
import { readTarget, saveTarget } from '../../portfolio/targets';
import { getFormat } from '../../poster/formats';
import { platformLimitFindings, SHARE_PLATFORMS, sharePlatform } from '../../poster/sharePlatforms';
import { readArtifactComments, resolveArtifactComments } from '../../workspace/artifactComments';
import { importComments } from '../../workspace/importComments';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const FIXTURE = path.resolve(__dirname, '../../../../../evals/fixtures/portfolio-library');
const OUT = '.open-design';
const MB = 1_000_000;

async function copyDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) await copyDir(a, b);
    else await fs.copyFile(a, b);
  }
}

function solid(width: number, height: number, rgb: [number, number, number]): Buffer {
  const img = new PNG({ width, height });
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
}

describe('portfolio sharing and review rounds', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-share-'));
    await copyDir(FIXTURE, root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function register(entryPath: string, html: string, metadata: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
    await fs.mkdir(path.dirname(path.join(root, entryPath)), { recursive: true });
    await fs.writeFile(path.join(root, entryPath), html);
    await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html', 'pdf'], title: 'Page', metadata, ...extra } });
  }

  describe('share formats and platform limits', () => {
    it('has the five share formats, each tied to a platform with a source and a date', () => {
      for (const id of ['dribbble-shot', 'behance-module', 'behance-cover', 'linkedin-document', 'marketplace-cover']) {
        const f = getFormat(id);
        assert.ok(f, id);
        assert.ok(f!.platform && sharePlatform(f!.platform), `${id} has no platform`);
      }
      assert.strictEqual(getFormat('linkedin-document')!.documentPdf, true);
      assert.deepStrictEqual([getFormat('linkedin-document')!.width, getFormat('linkedin-document')!.height], [1080, 1350]);
      for (const p of SHARE_PLATFORMS) {
        assert.match(p.source, /^https:\/\//, p.id);
        assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/, p.id);
      }
    });

    it('reports a Dribbble video over 20 MB as an error, and an unverified limit only as a warning', () => {
      const video = platformLimitFindings('dribbble-shot', { path: 'exports/shot.mp4', kind: 'video', bytes: 26 * MB });
      assert.strictEqual(video.length, 1);
      assert.strictEqual(video[0].severity, 'error');
      assert.match(video[0].message, /over the 20 MB limit/);
      assert.deepStrictEqual(platformLimitFindings('dribbble-shot', { path: 'shot.mp4', kind: 'video', bytes: 12 * MB }), []);
      const doc = platformLimitFindings('linkedin-document', { path: 'post.pdf', kind: 'document', bytes: 120 * MB });
      assert.strictEqual(doc[0].severity, 'warning');
      assert.match(doc[0].message, /unverified/);
      // Behance: over the recommended 10 MB warns; over the 50 MB it refuses is an error.
      assert.strictEqual(platformLimitFindings('behance-module', { path: 'm.png', kind: 'image', bytes: 12 * MB })[0].severity, 'warning');
      assert.strictEqual(platformLimitFindings('behance-module', { path: 'm.png', kind: 'image', bytes: 60 * MB })[0].severity, 'error');
    });
  });

  describe('share pack brief', () => {
    it('is made from one public project and refuses an unlisted one, asking about its level', async () => {
      assert.strictEqual(portfolioKindForSkill('portfolio-share-pack'), 'share');
      const unlisted = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/share/index.html`, portfolio: { projects: ['bank-onboarding'] }, kind: 'share' });
      assert.ok(!unlisted.ok);
      assert.match(unlisted.error, /not public/);
      assert.match(unlisted.error, /whether to make it public/);
      const two = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/share/index.html`, portfolio: { projects: ['checkout-redesign', 'design-system'] }, kind: 'share' });
      assert.ok(!two.ok && /one project/.test(two.error));
      const ok = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/share/index.html`, portfolio: { projects: ['checkout-redesign'] }, kind: 'share' });
      assert.ok(ok.ok, !ok.ok ? ok.error : '');
      assert.strictEqual(ok.value.record.kind, 'share');
    });
  });

  describe('review rounds', () => {
    it('asks which three questions to keep when given four, and defaults to an unlisted site', async () => {
      const four = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'UX critique', kind: 'review', review: { questions: ['Mobile?', 'Too long?', 'Clear role?', 'Visuals?'] } } });
      assert.ok(!four.ok);
      assert.match(four.text, /which three to keep/);
      const saved = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'UX critique', kind: 'review', projects: ['checkout-redesign'], notes: 'Flair your post. No links to paid courses.', review: { community: 'r/UXDesign', questions: ['Is it readable on a phone?', 'Are the case studies too long?'], notWanted: 'Colours (fixed by the brand)' } } });
      assert.ok(saved.ok, saved.text);
      const t = (await readTarget(root, OUT, 'ux-critique'))!;
      assert.strictEqual(t.ceiling, 'unlisted');
      assert.deepStrictEqual(t.outputs, ['site']);
      assert.strictEqual(t.review?.questions?.length, 2);
    });

    it('briefs an anonymised version with neutral labels and a review post', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'UX critique', kind: 'review', projects: ['checkout-redesign'], review: { questions: ['Is it readable on a phone?'] } } });
      const brief = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/review/index.html`, portfolio: { target: 'ux-critique' }, kind: 'site' });
      assert.ok(brief.ok, !brief.ok ? brief.error : '');
      assert.match(brief.value.section, /Anonymise this version/);
      assert.match(brief.value.section, /Harvest Box \(checkout-redesign\): "Company A, 2025"/);
      assert.match(brief.value.section, /review-post\.md/);
      assert.match(brief.value.section, /1\. Is it readable on a phone\?/);
      const labelled = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { slug: 'ux-critique', review: { labels: { 'checkout-redesign': 'Grocery company, 2025' } } } });
      assert.ok(labelled.ok, labelled.text);
      const t = (await readTarget(root, OUT, 'ux-critique'))!;
      // Labels are added without dropping the questions saved before.
      assert.strictEqual(t.review?.questions?.length, 1);
      const projects = [(await readProject(root, OUT, 'checkout-redesign'))!];
      assert.strictEqual(neutralLabels(projects, t).get('checkout-redesign'), 'Grocery company, 2025');
    });

    it('reports the name in the title, the employer, the email and the profile link, and passes a clean page', async () => {
      const library = (await readLibrary(root, OUT))!;
      const projects = [(await readProject(root, OUT, 'checkout-redesign'))!];
      const terms = identifyingTerms(library, projects);
      const leaky = `<!doctype html><html><head><title>Sam Rivera · Portfolio</title><meta property="og:title" content="Portfolio of Sam Rivera"></head><body>
        <h1>Checkout redesign</h1><p>At Harvest Box I led the checkout.</p>
        <img src="media/rivera-checkout.png" alt="Checkout screen" data-od-asset="checkout-redesign/x">
        <a href="https://www.linkedin.com/in/example/">Profile</a><a href="mailto:sam@example.com">Mail</a></body></html>`;
      const found = anonymityFindings(leaky, 'index.html', terms);
      const where = found.map((f) => f.message);
      assert.ok(found.every((f) => f.severity === 'error' && f.check === 'review-anonymity'));
      assert.ok(where.some((m) => /page title still has "Sam Rivera"/.test(m)), where.join('\n'));
      assert.ok(where.some((m) => /og:title tag/.test(m)));
      assert.ok(where.some((m) => /text still has "Harvest Box"/.test(m)));
      assert.ok(where.some((m) => /file name still has "Rivera"/.test(m)));
      assert.ok(where.some((m) => /link target still has "linkedin\.com\/in\/example"/.test(m)));
      assert.ok(where.some((m) => /link target still has "sam@example\.com"/.test(m)));
      const clean = `<!doctype html><html><head><title>Product designer · Portfolio</title></head><body><h1>Checkout redesign</h1><p>At Company A (2025) I led the checkout. The same team shipped it.</p><img src="media/checkout-redesign/home.png" alt="Checkout screen"></body></html>`;
      assert.deepStrictEqual(anonymityFindings(clean, 'index.html', terms), []);
    });

    it('checks a review version for names and refuses to publish it until they are gone', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'UX critique', kind: 'review', projects: ['checkout-redesign'] } });
      const entryPath = `${OUT}/review/index.html`;
      const portfolio = { kind: 'site', projects: ['checkout-redesign'], target: 'ux-critique' };
      await register(entryPath, '<!doctype html><html><head><title>Sam Rivera</title><meta name="robots" content="noindex"></head><body data-od-project="checkout-redesign"><p>Work</p></body></html>', { portfolio });
      const findings = await targetFindings({ workspaceRoot: root, outputDir: OUT, html: await fs.readFile(path.join(root, entryPath), 'utf8'), record: portfolio as never, page: 'index.html' });
      assert.ok(findings.some((f) => f.check === 'review-anonymity' && /index\.html: the page title/.test(f.message)), JSON.stringify(findings));
      const refused = await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'publish', provider: 'claude-artifact' });
      assert.ok(!refused.ok && /still identifies the designer/.test(refused.text));
      await register(entryPath, '<!doctype html><html><head><title>Product designer</title><meta name="robots" content="noindex"></head><body data-od-project="checkout-redesign"><p>Work</p></body></html>', { portfolio });
      assert.ok((await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'publish', provider: 'claude-artifact' })).ok);
    });
  });

  describe('community feedback', () => {
    it('records each point on its page, sends the rest to the home page and keeps status on re-import', async () => {
      const home = `${OUT}/review/index.html`;
      const study = `${OUT}/review/checkout.html`;
      await register(home, '<!doctype html><html><body>Home</body></html>', {}, { collectionId: 'ux-critique', screenRole: 'index' });
      await register(study, '<!doctype html><html><body>Case</body></html>', {}, { collectionId: 'ux-critique', screenRole: 'case-study' });
      const points = [
        { text: 'The checkout case study is hard to read on a phone.', author: 'u/reviewer1', page: study },
        { text: 'Lead with the outcome.', page: `${OUT}/elsewhere.html` },
        { text: 'Love the clear role line.' },
      ];
      const first = await importComments({ workspaceRoot: root, outputDir: OUT, entryPath: home, source: 'community', comments: points });
      assert.ok(first.ok, first.text);
      const onStudy = await readArtifactComments(root, study);
      assert.strictEqual(onStudy.length, 1);
      assert.strictEqual(onStudy[0].status, 'open');
      assert.strictEqual(onStudy[0].source, 'community');
      assert.strictEqual(onStudy[0].author, 'u/reviewer1');
      const onHome = await readArtifactComments(root, home);
      assert.strictEqual(onHome.length, 2);
      assert.match(first.text, /attached to the home page/);
      await resolveArtifactComments(root, study, [onStudy[0].id]);
      const again = await importComments({ workspaceRoot: root, outputDir: OUT, entryPath: home, source: 'community', comments: points });
      assert.ok(again.ok);
      const after = await readArtifactComments(root, study);
      assert.strictEqual(after.length, 1);
      assert.strictEqual(after[0].status, 'resolved');
      assert.match(again.text, /already imported/);
    });

    it('needs ids and the artifact URL for artifact threads', async () => {
      const entryPath = `${OUT}/a/index.html`;
      await register(entryPath, '<!doctype html><html><body>A</body></html>', {});
      const noUrl = await importComments({ workspaceRoot: root, outputDir: OUT, entryPath, source: 'claude-artifact', comments: [{ text: 'x', externalId: '1' }] });
      assert.ok(!noUrl.ok && /artifactUrl/.test(noUrl.text));
      const noId = await importComments({ workspaceRoot: root, outputDir: OUT, entryPath, source: 'claude-artifact', artifactUrl: 'https://claude.ai/artifact/abc', comments: [{ text: 'x' }] });
      assert.ok(!noId.ok && /externalId/.test(noId.text));
      const ok = await importComments({ workspaceRoot: root, outputDir: OUT, entryPath, source: 'claude-artifact', artifactUrl: 'https://claude.ai/artifact/abc', comments: [{ text: 'Bigger headline', externalId: 'c1', anchor: { odId: 'hero' } }] });
      assert.ok(ok.ok, ok.text);
      const [c] = await readArtifactComments(root, entryPath);
      assert.strictEqual(c.selector, '[data-od-id="hero"]');
      assert.strictEqual(c.threadUrl, 'https://claude.ai/artifact/abc');
    });
  });

  describe('exports (real browser; skipped when none is installed)', function () {
    this.timeout(120000);
    before(async function () {
      if (!(await findBrowser()).ok) this.skip();
    });

    it('exports a six-card LinkedIn document post as one PDF of six 1080 × 1350 pages', async () => {
      const entryPath = `${OUT}/share/linkedin.html`;
      const cards = [1, 2, 3, 4, 5, 6].map((i) => `<div data-od-card style="width:1080px;height:1350px;overflow:hidden;background:hsl(${i * 50} 60% 50%)"><h1>Card ${i}</h1></div>`).join('');
      await register(entryPath, `<!doctype html><html><head><style>body{margin:0}</style></head><body>${cards}</body></html>`, { format: 'linkedin-document' }, { kind: 'html' });
      const result = await exportArtifact({ workspaceRoot: root, entryPath, preset: 'linkedin-document', outputDir: OUT });
      assert.ok(result.ok, !result.ok ? result.error : '');
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].format, 'pdf');
      const pdf = await PDFDocument.load(await fs.readFile(path.join(root, result.files[0].path)));
      assert.strictEqual(pdf.getPageCount(), 6);
      for (const page of pdf.getPages()) {
        const { width, height } = page.getSize();
        assert.deepStrictEqual([Math.round(width), Math.round(height)], [1080, 1350]);
      }
    });

    it('frames an imported phone screenshot in the iPhone frame', async () => {
      await fs.writeFile(path.join(root, 'phone.png'), solid(390, 844, [40, 120, 200]));
      const imported = await importWork({ workspaceRoot: root, outputDir: OUT, project: 'checkout-redesign', sources: [{ kind: 'file', path: 'phone.png', name: 'phone', assetKind: 'screen', device: 'iphone', alt: 'Phone checkout' }] });
      assert.ok(imported.ok, JSON.stringify(imported.failed));
      const asset = (await readProject(root, OUT, 'checkout-redesign'))!.assets.find((a) => a.id === 'phone')!;
      assert.ok(asset.framedFile, 'no framed copy');
      const framed = PNG.sync.read(await fs.readFile(path.join(root, OUT, 'portfolio/projects/checkout-redesign', asset.framedFile!)));
      // The frame adds the bezel and the status and home bars around the screen.
      assert.ok(framed.width > 390 && framed.height > 844, `${framed.width}×${framed.height}`);
      const brief = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/share/index.html`, portfolio: { projects: ['checkout-redesign'] }, kind: 'share' });
      assert.ok(brief.ok, !brief.ok ? brief.error : '');
      assert.match(brief.value.section, /In its device frame[^\n]*phone-framed\.png[^\n]*data-od-framed/);
    });
  });
});
