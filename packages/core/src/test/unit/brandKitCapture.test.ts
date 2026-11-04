import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { readBrandRecord } from '../../generation/brandKit';
import { componentSpecs, fontAvailability, freeFontMatch, pickIcons, voiceFacts } from '../../generation/brandKitCapture';
import { saveNewBrand } from '../../generation/brandSave';
import { extractSite } from '../../generation/siteExtraction';

const FIXTURES = path.resolve(__dirname, '../../../src/test/fixtures/brandKit');

describe('brand kit capture (add-brand-kit-capture)', () => {
  it('counts voice facts: heading case, sentence length, person, exclamations', () => {
    const facts = voiceFacts([
      { page: '/', kind: 'h1', text: 'Banking that stays out of the way' },
      { page: '/', kind: 'h2', text: 'Built for how you live' },
      { page: '/', kind: 'h2', text: 'Your money, sorted' },
      { page: '/', kind: 'cta', text: 'Start your account' },
      { page: '/', kind: 'paragraph', text: 'Open an account in minutes. We handle the paperwork, so you can get on with your day.' },
      { page: '/', kind: 'nav', text: 'We We We' },
    ]);
    assert.strictEqual(facts.headingCase, 'sentence');
    assert.strictEqual(facts.person, 'second');
    assert.strictEqual(facts.exclamations, 0);
    assert.strictEqual(facts.emoji, 0);
    assert.strictEqual(facts.avgSentenceWords, 9);
    assert.strictEqual(voiceFacts([{ page: '/', kind: 'h1', text: 'AMAZING DEALS TODAY!!!' }, { page: '/', kind: 'h2', text: 'BIG SAVINGS' }]).headingCase, 'upper');
    assert.strictEqual(voiceFacts([{ page: '/', kind: 'h1', text: 'The Future Of Money' }, { page: '/', kind: 'h2', text: 'Built For Teams' }]).headingCase, 'title');
  });

  it('says where each font comes from and names a free match for a self-hosted one', () => {
    const fonts = fontAvailability(
      [
        { family: 'Inter', weight: '400', style: 'normal', source: 'url(https://fonts.gstatic.com/s/inter/v1.woff2)' },
        { family: 'Inter', weight: '600', style: 'normal' },
        { family: 'Circular Std', weight: '500', style: 'normal', source: 'url(/fonts/circular.woff2)' },
        { family: 'Arial', weight: '400', style: 'normal' },
        { family: 'Proxima Nova', weight: '400', style: 'normal', source: 'url(https://use.typekit.net/af/x.woff2)' },
      ],
      ['https://fonts.googleapis.com/css2?family=Inter:wght@400;600', 'https://use.typekit.net/abc.css'],
    );
    const by = Object.fromEntries(fonts.map((f) => [f.family, f]));
    assert.strictEqual(by.Inter.source, 'google');
    assert.deepStrictEqual(by.Inter.weights, ['400', '600']);
    assert.match(by.Inter.stylesheet ?? '', /family=Inter:wght@400;600/);
    assert.strictEqual(by['Circular Std'].source, 'self-hosted');
    assert.strictEqual(by['Circular Std'].licence, 'unknown');
    assert.strictEqual(by['Circular Std'].freeMatch, 'DM Sans');
    assert.strictEqual(by.Arial.source, 'system');
    assert.strictEqual(by['Proxima Nova'].source, 'adobe');
    assert.strictEqual(freeFontMatch('Acme Serif Text'), 'Source Serif 4');
    assert.strictEqual(freeFontMatch('Acme Mono'), 'JetBrains Mono');
    assert.strictEqual(freeFontMatch('Tiempos Headline Bold'), 'Playfair Display');
  });

  it('picks the largest icon and the touch icon, and cleans component specs', () => {
    assert.deepStrictEqual(
      pickIcons([
        { href: 'https://a.example/16.png', sizes: '16x16', rel: 'icon' },
        { href: 'https://a.example/192.png', sizes: '192x192', rel: 'icon' },
        { href: 'https://a.example/touch.png', rel: 'apple-touch-icon' },
      ]),
      { icon: 'https://a.example/192.png', touch: 'https://a.example/touch.png' },
    );
    const specs = componentSpecs({ button: { primary: { selector: 'a.btn', rect: { x: 0, y: 0, width: 10, height: 10 }, height: 44, radius: 999 } } }, { 'button-primary': 'crops/component-button-primary.png' });
    assert.deepStrictEqual(specs, { button: { primary: { selector: 'a.btn', height: 44, radius: 999, crop: 'crops/component-button-primary.png' } } });
  });
});

describe('brand kit capture (real browser; skipped when none is installed)', function () {
  this.timeout(180000);
  let executablePath: string | undefined;
  let server: http.Server | undefined;
  let base = '';
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) return this.skip();
    executablePath = found.executablePath;
    server = http.createServer((req, res) => {
      const name = (req.url ?? '/').split('?')[0].replace(/^\//, '') || 'index.html';
      fs.readFile(path.join(FIXTURES, path.basename(name.includes('.') ? name : 'index.html')))
        .then((body) => {
          res.writeHead(200, { 'content-type': types[path.extname(name)] ?? 'text/html; charset=utf-8' });
          res.end(body);
        })
        .catch(() => {
          res.writeHead(404);
          res.end();
        });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server?.close());

  it('captures marks with variants, fonts, component specs, voice and imagery, and saves them into brand.json', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-kit-'));
    const result = await extractSite({ url: `${base}/`, theme: 'both', workspaceRoot, outputDir: '.open-design', executablePath, allowHostsForTesting: ['127.0.0.1'] });
    assert.strictEqual(result.status, 'ok');
    if (result.status !== 'ok') return;
    const kit = result.brandKit!;
    const roles = kit.marks.map((m) => m.role).sort();
    for (const r of ['logo', 'logo-dark', 'logo-on-dark', 'icon', 'touch-icon', 'manifest-icon', 'social']) assert.ok(roles.includes(r as never), `${r} in ${roles.join(', ')}`);
    assert.strictEqual(kit.marks.find((m) => m.role === 'icon')?.path, 'icon.png');
    assert.strictEqual(kit.marks.find((m) => m.role === 'logo')?.seenOn, '#ffffff');
    assert.strictEqual(kit.themeColor, '#0b5fff');

    const brandFont = kit.fonts.find((f) => f.family === 'Brand Sans');
    assert.strictEqual(brandFont?.source, 'self-hosted');
    assert.strictEqual(brandFont?.licence, 'unknown');
    assert.ok(brandFont?.freeMatch);
    assert.deepStrictEqual(brandFont?.files, ['fonts/brand.woff2']);
    assert.ok(result.notes.some((n) => /Brand Sans .*may be licensed/.test(n)));

    const b = kit.components.button!;
    assert.strictEqual(b.primary?.height, 44);
    assert.strictEqual(b.primary?.paddingX, 24);
    assert.strictEqual(b.primary?.fontWeight, 600);
    assert.strictEqual(b.primary?.radius, 999);
    assert.strictEqual(b.secondary?.borderWidth, 1);
    assert.ok(b.ghost);
    assert.match(kit.components.input?.focus ?? '', /0px 0px 0px 3px/);
    assert.strictEqual(kit.components.nav?.sticky, true);
    assert.strictEqual(kit.components.badge?.textTransform, 'uppercase');
    await fs.access(path.join(workspaceRoot, result.bundleDir, 'crops', 'component-button-primary.png'));

    assert.strictEqual(kit.voice.headingCase, 'sentence');
    assert.strictEqual(kit.voice.person, 'second');
    assert.ok(kit.voice.samples.some((s) => s.kind === 'h1' && s.text === 'Banking that stays out of the way'));
    assert.ok(kit.voice.samples.reduce((n, s) => n + s.text.length, 0) <= 1500);
    assert.strictEqual(kit.imagery.hero, 'illustration');
    assert.deepStrictEqual(kit.imagery.icons, { set: 'lucide', style: 'outline', strokeWidth: 1.5 });

    // Own brand with the licence confirmed: marks into assets/, font files into assets/fonts/.
    const own = await saveNewBrand({ workspaceRoot, outputDir: '.open-design', dirRel: '.open-design/design-systems/acme', name: 'Acme', kind: 'own', evidenceDir: result.bundleDir, fontLicence: 'confirmed' });
    assert.ok(own.brand.marks?.some((m) => m.role === 'logo-dark' && m.path === 'assets/logo-dark.svg'));
    await fs.access(path.join(workspaceRoot, '.open-design/design-systems/acme/assets/logo-dark.svg'));
    const ownFont = own.brand.fonts?.find((f) => f.family === 'Brand Sans');
    assert.strictEqual(ownFont?.licence, 'confirmed');
    assert.deepStrictEqual(ownFont?.files, ['assets/fonts/brand.woff2']);
    await fs.access(path.join(workspaceRoot, '.open-design/design-systems/acme/assets/fonts/brand.woff2'));
    assert.strictEqual((await readBrandRecord(path.join(workspaceRoot, '.open-design/design-systems/acme')))?.components?.button?.primary?.height, 44);

    // A reference keeps no marks, font files or copied lines.
    const ref = await saveNewBrand({ workspaceRoot, outputDir: '.open-design', dirRel: '.open-design/design-systems/acme-inspired', name: 'Acme-inspired', kind: 'reference', evidenceDir: result.bundleDir, fontLicence: 'confirmed' });
    assert.strictEqual(ref.brand.marks, undefined);
    assert.ok(!ref.brand.fonts?.some((f) => f.files));
    assert.deepStrictEqual(ref.brand.voice?.samples, []);
    assert.strictEqual(ref.brand.voice?.headingCase, 'sentence');
    await assert.rejects(fs.access(path.join(workspaceRoot, '.open-design/design-systems/acme-inspired/assets')));
  });
});
