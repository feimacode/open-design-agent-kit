import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact } from '../../export/exportArtifact';
import { publishArtifact } from '../../generation/publishArtifact';
import { readAllProjects } from '../../portfolio/library';
import { loadPortfolioBrief } from '../../portfolio/portfolioBrief';
import { targetFindings } from '../../portfolio/portfolioChecks';
import { portfolioGuard } from '../../portfolio/privacy';
import { criteriaMap, readTarget, saveTarget, suggestOrder } from '../../portfolio/targets';
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

function noise(width: number, height: number, seed: number): Buffer {
  const img = new PNG({ width, height });
  let x = seed;
  // A photo-like picture: smooth gradients with a little grain, which PNG stores large and JPEG small.
  for (let i = 0; i < img.data.length; i += 4) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    const grain = (x & 15) - 8;
    img.data[i] = Math.max(0, Math.min(255, (px * 255) / width + grain));
    img.data[i + 1] = Math.max(0, Math.min(255, (py * 255) / height + grain));
    img.data[i + 2] = Math.max(0, Math.min(255, 128 + 100 * Math.sin((px + py + seed) / 40) + grain));
    img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
}

describe('tailored portfolios', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-targets-'));
    await copyDir(FIXTURE, root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function register(entryPath: string, html: string, portfolio: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
    await fs.mkdir(path.dirname(path.join(root, entryPath)), { recursive: true });
    await fs.writeFile(path.join(root, entryPath), html);
    await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html', 'pdf'], title: 'Version', metadata: { portfolio }, ...extra } });
  }

  describe('targets', () => {
    it('suggests the projects a job ad matches first, with the matched words', async () => {
      const projects = await readAllProjects(root, OUT);
      const order = suggestOrder('Senior designer to own our design systems and tokens for B2B teams.', projects);
      assert.strictEqual(order[0].slug, 'design-system');
      assert.ok(order[0].matched.includes('design system'), JSON.stringify(order[0]));
      const saved = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Acme senior product designer', kind: 'job', notes: 'We need someone for design systems and checkout conversion.' } });
      assert.ok(saved.ok, saved.text);
      assert.match(saved.text, /Suggested order/);
      assert.match(saved.text, /matched: /);
      const t = (await readTarget(root, OUT, 'acme-senior-product-designer'))!;
      assert.strictEqual(t.limits.pdfBytes, 10 * 1024 * 1024);
      assert.strictEqual(t.ceiling, 'public');
    });

    it('fills each kind\'s defaults and refuses a published internal version', async () => {
      const school = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'RCA MA', kind: 'school', limits: { pieces: 12 } } });
      assert.ok(school.ok, school.text);
      const st = (await readTarget(root, OUT, 'rca-ma'))!;
      assert.deepStrictEqual([st.limits.imageBytes, st.limits.pdfBytes, st.limits.pieces], [5 * 1024 * 1024, 10 * 1024 * 1024, 12]);
      const promo = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Staff promotion', kind: 'promotion', notes: '- Leads cross-team initiatives\n- Raises checkout conversion with measured outcomes' } });
      assert.ok(promo.ok, promo.text);
      const pt = (await readTarget(root, OUT, 'staff-promotion'))!;
      assert.strictEqual(pt.ceiling, 'internal');
      assert.deepStrictEqual(pt.criteria, ['Leads cross-team initiatives', 'Raises checkout conversion with measured outcomes']);
      const bad = await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'NDA site', kind: 'general', ceiling: 'internal', outputs: ['site'] } });
      assert.ok(!bad.ok && /files only/.test(bad.text));
    });

    it('keeps a criterion with no evidence visible and empty', async () => {
      const map = criteriaMap(['Leads cross-team initiatives', 'Improves checkout conversion'], await readAllProjects(root, OUT));
      assert.deepStrictEqual(map[0].evidence, []);
      assert.ok(map[1].evidence.some((e) => e.project === 'checkout-redesign'));
    });

    it('builds a brief from the target\'s projects and leaves out work above its ceiling', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Acme', kind: 'job', projects: ['design-system', 'checkout-redesign'], coverNote: 'I would love to help Acme ship faster.' } });
      const brief = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/acme/index.html`, portfolio: { target: 'acme' }, kind: 'site' });
      assert.ok(brief.ok, !brief.ok ? brief.error : '');
      assert.deepStrictEqual(brief.value.record, { kind: 'site', projects: ['design-system', 'checkout-redesign'], target: 'acme' });
      assert.match(brief.value.section, /I would love to help Acme ship faster/);
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { slug: 'acme', projects: ['bank-onboarding'] } });
      const refused = await loadPortfolioBrief({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/acme/index.html`, portfolio: { target: 'acme' }, kind: 'site' });
      assert.ok(!refused.ok && /unlisted, stricter than the target's ceiling \(public\)/.test(refused.error));
    });
  });

  describe('privacy ceiling', () => {
    it('refuses to publish a public version holding an unlisted picture, naming it and its page', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Acme', kind: 'job', projects: ['checkout-redesign'] } });
      const entryPath = `${OUT}/acme/index.html`;
      await register(entryPath, '<!doctype html><html><body><img src="a.png" alt="x" data-od-asset="bank-onboarding/onboarding-step1"></body></html>', { kind: 'site', projects: ['checkout-redesign'], target: 'acme' });
      const guard = await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'publish', provider: 'netlify' });
      assert.ok(!guard.ok && /bank-onboarding\/onboarding-step1 is unlisted, on Version/.test(guard.text), JSON.stringify(guard));
      const published = await publishArtifact({ workspaceRoot: root, entryPath, provider: 'netlify', outputDir: OUT });
      assert.ok(!published.ok && /Nothing was published/.test(published.text));
      const exported = await exportArtifact({ workspaceRoot: root, entryPath, format: 'pdf', outputDir: OUT });
      assert.ok(!exported.ok && exported.code === 'privacy-ceiling');
      const findings = await targetFindings({ workspaceRoot: root, outputDir: OUT, html: await fs.readFile(path.join(root, entryPath), 'utf8'), record: { kind: 'site', projects: [], target: 'acme' } });
      assert.ok(findings.some((f) => f.check === 'portfolio-ceiling' && f.severity === 'error'));
    });

    it('exports an internal version as a file but never publishes it', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Promo', kind: 'promotion', projects: ['bank-onboarding'] } });
      const entryPath = `${OUT}/promo/index.html`;
      await register(entryPath, '<!doctype html><html><body><img src="a.png" alt="x" data-od-asset="bank-onboarding/onboarding-step2"></body></html>', { kind: 'pdf', projects: ['bank-onboarding'], target: 'promo' });
      assert.ok((await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'export' })).ok);
      const publish = await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'publish', provider: 'claude-artifact' });
      assert.ok(!publish.ok && /only exported as a file/.test(publish.text));
    });

    it('keeps internal work out of a portfolio design with no target, and warns about untagged pictures', async () => {
      const entryPath = `${OUT}/site/index.html`;
      await register(entryPath, '<!doctype html><html><body><img src="x.png" alt="A copied screen"><img src="b.png" alt="x" data-od-asset="bank-onboarding/onboarding-step2"></body></html>', { kind: 'site', projects: ['checkout-redesign'] });
      const guard = await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'export' });
      assert.ok(!guard.ok && /onboarding-step2 is internal/.test(guard.text));
      const findings = await targetFindings({ workspaceRoot: root, outputDir: OUT, html: await fs.readFile(path.join(root, entryPath), 'utf8'), record: { kind: 'site', projects: ['checkout-redesign'] } });
      assert.deepStrictEqual(findings.map((f) => f.check), ['portfolio-untagged-image']);
    });

    it('says an unlisted version needs a password the designer adds, without claiming one', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Bank job', kind: 'job', ceiling: 'unlisted', projects: ['bank-onboarding'] } });
      const entryPath = `${OUT}/bank-job/index.html`;
      await register(entryPath, '<!doctype html><html><head></head><body><div data-od-project="bank-onboarding">Bank</div></body></html>', { kind: 'site', projects: ['bank-onboarding'], target: 'bank-job' });
      const guard = await portfolioGuard({ workspaceRoot: root, outputDir: OUT, entryPath, action: 'publish', provider: 'netlify' });
      assert.ok(guard.ok && /add a password on the host/.test(guard.notes.join(' ')) && /hasn't set one/.test(guard.notes.join(' ')));
      const findings = await targetFindings({ workspaceRoot: root, outputDir: OUT, html: await fs.readFile(path.join(root, entryPath), 'utf8'), record: { kind: 'site', projects: [], target: 'bank-job' } });
      assert.ok(findings.some((f) => f.check === 'portfolio-noindex'));
    });

    it('reports a school set with the wrong number of pieces and a promotion map missing a criterion', async () => {
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'School', kind: 'school', limits: { pieces: 3 } } });
      const school = await targetFindings({ workspaceRoot: root, outputDir: OUT, html: '<main><section class="slide" data-od-piece="Bank, 2024, app"></section><section class="slide" data-od-piece=""></section></main>', record: { kind: 'pdf', projects: [], target: 'school' } });
      assert.deepStrictEqual(school.map((f) => f.check).sort(), ['portfolio-piece-count', 'portfolio-piece-title']);
      await saveTarget({ workspaceRoot: root, outputDir: OUT, target: { name: 'Promo', kind: 'promotion', criteria: ['Leads cross-team initiatives', 'Mentors designers'] } });
      const promo = await targetFindings({ workspaceRoot: root, outputDir: OUT, html: '<table><tr data-od-criterion><td>Mentors designers</td><td>No evidence yet</td></tr></table>', record: { kind: 'pdf', projects: [], target: 'promo' } });
      const missing = promo.find((f) => f.check === 'portfolio-criteria');
      assert.ok(missing && /Leads cross-team initiatives/.test(missing.message));
    });
  });

  describe('PDF size limit (real browser; skipped when none is installed)', function () {
    this.timeout(120000);
    before(async function () {
      if (!(await findBrowser()).ok) this.skip();
    });

    async function deck(): Promise<string> {
      const entryPath = `${OUT}/pdf/index.html`;
      const dir = path.join(root, OUT, 'pdf');
      await fs.mkdir(dir, { recursive: true });
      for (let i = 1; i <= 3; i++) await fs.writeFile(path.join(dir, `p${i}.png`), noise(640, 360, i * 7 + (i === 2 ? 99 : 0)));
      const slides = [1, 2, 3].map((i) => `<section class="slide" data-screen-label="${i}"><img src="p${i}.png" alt="Page ${i}" style="width:100%;height:100%"></section>`).join('');
      await fs.writeFile(
        path.join(root, entryPath),
        `<!doctype html><html><head><style>body{margin:0}.slide{width:640px;height:360px;overflow:hidden}</style></head><body>${slides}</body></html>`,
      );
      await writeArtifactManifest({ workspaceRoot: root, entryPath, artifactManifest: { kind: 'deck', renderer: 'deck-html', exports: ['pdf'], title: 'PDF' } });
      return entryPath;
    }

    it('lowers image quality until the PDF fits, keeping every page', async () => {
      const entryPath = await deck();
      const full = await exportArtifact({ workspaceRoot: root, entryPath, format: 'pdf', scale: 1, outputDir: OUT });
      assert.ok(full.ok, !full.ok ? full.error : '');
      const fullBytes = full.files[0].bytes;
      const limit = Math.floor(fullBytes * 0.6);
      const fitted = await exportArtifact({ workspaceRoot: root, entryPath, format: 'pdf', scale: 1, maxBytes: limit, outputDir: OUT });
      assert.ok(fitted.ok, !fitted.ok ? fitted.error : '');
      assert.ok(fitted.files[0].bytes <= limit, `${fitted.files[0].bytes} > ${limit}`);
      assert.ok(fitted.warnings.some((w) => /every page is kept/.test(w)));
    });

    it('fails naming the heaviest pages when even the lowest quality is too big', async () => {
      const entryPath = await deck();
      const result = await exportArtifact({ workspaceRoot: root, entryPath, format: 'pdf', scale: 1, maxBytes: 2000, outputDir: OUT });
      assert.ok(!result.ok && result.code === 'over-budget');
      assert.match(result.error, /heaviest pages are slide \d \(\d+ KB\)/);
    });
  });
});
