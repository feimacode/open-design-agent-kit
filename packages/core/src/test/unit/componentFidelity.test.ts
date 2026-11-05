import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact, type CheckArtifactResult } from '../../export/checkArtifact';
import { renderBrandReviewPage } from '../../export/brandReview';
import { fidelityMessage, pixelFidelity, replicaSpecs } from '../../export/componentFidelity';
import type { ComponentSpec } from '../../generation/brandKit';
import { designMdHeading, writeBrandRecord } from '../../generation/brandKit';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const png = (w: number, h: number, fill: (x: number, y: number) => number[]): PNG => {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * w + x) * 4;
      p.data[i] = r;
      p.data[i + 1] = g;
      p.data[i + 2] = b;
      p.data[i + 3] = 255;
    }
  return p;
};

describe('component fidelity (add-component-restyle-review)', () => {
  it('scores identical pixels 100%, tolerates a 1 px shift of an edge, and counts a different colour as a miss', () => {
    const a = png(20, 10, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
    assert.strictEqual(pixelFidelity(a, a), 100);
    assert.strictEqual(pixelFidelity(a, png(20, 10, (x) => (x < 11 ? [0, 0, 0] : [255, 255, 255]))), 100);
    assert.strictEqual(pixelFidelity(a, png(20, 10, (x) => (x < 10 ? [255, 0, 0] : [255, 255, 255]))), 50);
  });

  it('rebuilds buttons and the badge for scoring, and shows the input, card and nav only', () => {
    const s = { selector: 'x' };
    const specs = replicaSpecs({ button: { primary: s, ghost: s }, badge: s, card: s, nav: s });
    assert.deepStrictEqual(specs.map((x) => [x.key, x.scored]), [['button-primary', true], ['button-ghost', true], ['badge', true], ['card', false], ['nav', false]]);
  });

  it('words a finding with the family and both values', () => {
    assert.strictEqual(
      fidelityMessage('Primary button', 81.4, 'spacing', { site: '14px 28px', tokens: '12px 24px (--space-3, --space-5)' }).split('. Rebuilt')[0],
      'Primary button 81%: spacing. The site pads 14px 28px; nearest tokens give 12px 24px (--space-3, --space-5)',
    );
  });
});

describe('component replicas in the review (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string;
  let browser: import('puppeteer-core').Browser;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    browserPath = found.executablePath;
    const { default: puppeteer } = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true });
  });
  after(async () => browser?.close());

  const BASE_TOKENS = `--bg: #ffffff; --fg: #1a1a1a; --accent: #0b5fff; --accent-on: #ffffff; --border: #dddddd;
    --font-body: Arial, sans-serif; --font-display: Arial, sans-serif;
    --text-sm: 14px; --text-base: 16px; --text-lg: 20px;
    --radius-sm: 8px; --radius-md: 12px; --radius-pill: 9999px;
    --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;`;

  /** The site's button, as the extraction would have cropped it. */
  async function siteCrop(style: string, label: string): Promise<{ crop: Buffer; width: number; height: number }> {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 800, height: 400, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0;background:#ffffff"><button id="b" style="font-family:Arial, sans-serif;border-style:solid;${style}">${label}</button></body>`);
      const el = (await page.$('#b'))!;
      const box = (await el.boundingBox())!;
      const crop = Buffer.from((await page.screenshot({ type: 'png', clip: { x: box.x, y: box.y, width: Math.round(box.width), height: Math.round(box.height) } })) as Uint8Array);
      return { crop, width: Math.round(box.width), height: Math.round(box.height) };
    } finally {
      await page.close();
    }
  }

  async function review(tokens: string, spec: ComponentSpec, crop: Buffer): Promise<Extract<CheckArtifactResult, { ok: true }>> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-replica-'));
    const dir = path.join(root, '.open-design', 'design-systems', 'acme');
    const bundle = path.join(root, '.open-design', '.extract', 'acme');
    await fs.mkdir(path.join(bundle, 'crops'), { recursive: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(bundle, 'crops', 'component-button-primary.png'), crop);
    const components = { button: { primary: { ...spec, crop: 'crops/component-button-primary.png' } } };
    await fs.writeFile(path.join(bundle, 'evidence.json'), JSON.stringify({ version: 2, pages: [], components }));
    await fs.writeFile(path.join(dir, 'DESIGN.md'), `${designMdHeading('Acme', 'reference')}\n\nPlain.\n`);
    await fs.writeFile(path.join(dir, 'tokens.css'), `:root { ${tokens} }`);
    await writeBrandRecord(dir, { kind: 'reference', name: 'Acme' });
    const entry = '.open-design/design-systems/acme/review.html';
    await fs.writeFile(path.join(root, entry), renderBrandReviewPage({ name: 'Acme', evidence: '../../.extract/acme/evidence.json', components }));
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Review' } });
    const r = await checkArtifact({ workspaceRoot: root, entryPath: entry, browserPath, settleMs: 0, maxImages: 0 });
    assert.ok(r.ok, JSON.stringify(r));
    return r as Extract<CheckArtifactResult, { ok: true }>;
  }
  const components = (r: Extract<CheckArtifactResult, { ok: true }>) => r.findings.filter((f) => f.check === 'brand-fidelity' && /replica/.test(f.selector ?? ''));

  it('raises nothing when every measured property is a token', async () => {
    const style = 'background:#0b5fff;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:700;border-width:0';
    const { crop, width, height } = await siteCrop(style, 'Get started');
    const spec: ComponentSpec = { selector: 'button', label: 'Get started', width, height, paddingY: 12, paddingX: 24, radius: 8, fontSize: 16, fontWeight: 700, background: '#0b5fff', color: '#ffffff', fontFamily: 'Arial, sans-serif' };
    const r = await review(BASE_TOKENS, spec, crop);
    assert.deepStrictEqual(components(r).filter((f) => f.severity === 'warning'), [], JSON.stringify(r.findings));
  });

  it('names spacing for padding between two steps, with both values', async () => {
    const style = 'background:#0b5fff;color:#ffffff;padding:18px 44px;border-radius:8px;font-size:16px;font-weight:700;border-width:0';
    const { crop, width, height } = await siteCrop(style, 'Get started');
    const spec: ComponentSpec = { selector: 'button', label: 'Get started', width, height, paddingY: 18, paddingX: 44, radius: 8, fontSize: 16, fontWeight: 700, background: '#0b5fff', color: '#ffffff', fontFamily: 'Arial, sans-serif' };
    const found = components(await review(BASE_TOKENS, spec, crop)).filter((f) => f.severity === 'warning');
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /^Primary button \d+%: spacing\. The site pads 18px 44px; nearest tokens give 16px 32px/);
  });

  it('names the shadow when no --elev token carries it, and notes it as unmapped', async () => {
    const style = 'background:#0b5fff;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:700;border-width:0;box-shadow:inset 0 -6px 0 #00308a';
    const { crop, width, height } = await siteCrop(style, 'Get started');
    const spec: ComponentSpec = { selector: 'button', label: 'Get started', width, height, paddingY: 12, paddingX: 24, radius: 8, fontSize: 16, fontWeight: 700, background: '#0b5fff', color: '#ffffff', fontFamily: 'Arial, sans-serif', shadow: 'rgb(0, 48, 138) 0px -6px 0px 0px inset' };
    const r = await review(BASE_TOKENS, spec, crop);
    assert.ok(components(r).some((f) => f.severity === 'info' && /no token for shadow/.test(f.message)), JSON.stringify(r.findings));
    const found = components(r).filter((f) => f.severity === 'warning');
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /: shadow\. The site has rgb\(0, 48, 138\) 0px -6px 0px 0px inset; nearest tokens give none/);
  });

  it('names colour when the button paints a colour no token holds', async () => {
    const style = 'background:#e11d48;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:700;border-width:0';
    const { crop, width, height } = await siteCrop(style, 'Get started');
    const spec: ComponentSpec = { selector: 'button', label: 'Get started', width, height, paddingY: 12, paddingX: 24, radius: 8, fontSize: 16, fontWeight: 700, background: '#e11d48', color: '#ffffff', fontFamily: 'Arial, sans-serif' };
    const found = components(await review(BASE_TOKENS, spec, crop)).filter((f) => f.severity === 'warning');
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.match(found[0].message, /: colour\. The site has #e11d48 \/ #ffffff; nearest tokens give --\S+ #[0-9a-f]{6} \/ --accent-on #ffffff/);
  });
});
