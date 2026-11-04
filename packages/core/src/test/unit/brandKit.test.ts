import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import { ownBrandHint } from '../../content/designSystemMatching';
import { brandTokensFromCss, loadOwnBrandContext } from '../../export/brandChecks';
import { compareBrandSample, expectedFromEvidence, renderBrandReviewPage } from '../../export/brandReview';
import { critiqueBrand } from '../../workspace/critique';
import { diffBrand, formatRefreshResult, refreshUrls, rootTokens } from '../../generation/brandRefresh';
import { doAndDont, exportDesignSystemForClaude, fontsNote } from '../../generation/designSystemExport';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact, type CheckArtifactResult } from '../../export/checkArtifact';
import { designMdHeading, parseBrandRecord, readBrandRecord, writeBrandRecord } from '../../generation/brandKit';
import { composeCustomDesignSystemInstructions } from '../../generation/customDesignSystemInstructions';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ASSETS = path.resolve(__dirname, '../../../../content/assets/open-design');

const TOKENS = `:root {
  --bg: #ffffff;
  --surface: #f6f6f4;
  --fg: #141414;
  --muted: #6b6b6b;
  --border: #e4e4e0;
  --accent: #6366f1;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --elev-raised: 0 1px 2px rgba(0,0,0,0.08);
}`;

async function brandWorkspace(kind: 'own' | 'reference' = 'own', slug = 'acme'): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-brand-'));
  const dir = path.join(root, '.open-design', 'design-systems', slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'DESIGN.md'), `${designMdHeading('Acme', kind)}\n\nWarm and plain.\n`);
  await fs.writeFile(path.join(dir, 'tokens.css'), TOKENS);
  await writeBrandRecord(dir, { kind, name: 'Acme', marks: [{ role: 'logo', path: 'assets/logo.svg' }] });
  return root;
}

describe('brand records (connect-brand-design-systems)', () => {
  it('parses a record, rejects non-records, and merges later writes into earlier ones', async () => {
    assert.strictEqual(parseBrandRecord('{"kind":"other"}'), undefined);
    assert.strictEqual(parseBrandRecord('not json'), undefined);
    assert.deepStrictEqual(parseBrandRecord('{"kind":"own","descriptor":{"moods":["calm",3]}}')?.descriptor?.moods, ['calm']);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-brand-rec-'));
    await writeBrandRecord(dir, { kind: 'own', name: 'Acme', sources: { urls: ['https://acme.example'] } });
    await writeBrandRecord(dir, { kind: 'own', fonts: [{ family: 'Inter', weights: ['400'], source: 'google' }] });
    const rec = await readBrandRecord(dir);
    assert.strictEqual(rec?.name, 'Acme');
    assert.deepStrictEqual(rec?.sources?.urls, ['https://acme.example']);
    assert.strictEqual(rec?.fonts?.[0].family, 'Inter');
  });

  it('names an own brand by its name and a reference as inspired by it', () => {
    assert.strictEqual(designMdHeading('Acme', 'own'), '# Acme Design System');
    assert.strictEqual(designMdHeading('Acme Design System', 'own'), '# Acme Design System');
    assert.strictEqual(designMdHeading('Stripe inspired', 'reference'), '# Design System Inspired by Stripe');
    assert.strictEqual(designMdHeading('Stripe', undefined), '# Design System Inspired by Stripe');
  });

  it('tells the agent to head DESIGN.md by kind', () => {
    const own = composeCustomDesignSystemInstructions({ name: 'Acme', kind: 'own', brief: 'Our own brand', id: 'user:acme', suggestedEntryPath: '.open-design/design-systems/acme/DESIGN.md' } as Parameters<typeof composeCustomDesignSystemInstructions>[0]);
    assert.match(own, /# Acme Design System/);
    assert.doesNotMatch(own, /Inspired by Acme/);
  });

  it('reads brand colours and fonts from tokens.css, skipping shadows', () => {
    const { colors, fonts } = brandTokensFromCss(TOKENS);
    assert.ok(colors.some((c) => c.name === '--accent' && c.hex === '#6366f1'));
    assert.ok(!colors.some((c) => c.name === '--elev-raised'));
    assert.ok(fonts.includes('fraunces') && fonts.includes('inter'));
  });

  it('loads an own-brand context only for own brands', async () => {
    const own = await brandWorkspace('own');
    const ctx = await loadOwnBrandContext(own, '.open-design', 'user:acme');
    assert.strictEqual(ctx?.accent, '#6366f1');
    assert.strictEqual(ctx?.hasLogo, true);
    const ref = await brandWorkspace('reference');
    assert.strictEqual(await loadOwnBrandContext(ref, '.open-design', 'user:acme'), undefined);
    assert.strictEqual(await loadOwnBrandContext(own, '.open-design', 'stripe'), undefined);
  });

  it('puts the own brand first in recommendations and lists it for briefs', async () => {
    const root = await brandWorkspace('own');
    const index = new ContentIndex(ASSETS, () => path.join(root, '.open-design', 'design-systems'));
    const none = await index.recommendDesignSystems(undefined);
    assert.strictEqual(none.recommendations[0].id, 'user:acme');
    const bold = await index.recommendDesignSystems({ moods: ['bold'], industries: ['finance'] });
    assert.strictEqual(bold.recommendations[0].id, 'user:acme');
    assert.match(bold.recommendations[0].reason, /your own brand/);
    const own = await index.ownBrandDesignSystems();
    assert.deepStrictEqual(own.map((d) => d.id), ['user:acme']);
  });

  it('hints at the own brand only when a brief does not use it', () => {
    const brands = [{ id: 'user:acme', name: 'Acme' }];
    assert.match(ownBrandHint(brands, undefined) ?? '', /designSystemId "user:acme"/);
    assert.match(ownBrandHint(brands, { id: 'stripe', name: 'Stripe' }) ?? '', /uses Stripe instead/);
    assert.strictEqual(ownBrandHint(brands, { id: 'user:acme', name: 'Acme' }), undefined);
    assert.strictEqual(ownBrandHint([], undefined), undefined);
  });
});

describe('brand review fidelity', () => {
  it('reports differing colours, fonts and radii with both values, and treats pills alike', () => {
    const site = expectedFromEvidence({
      pages: [
        {
          roles: { accent: { value: 'rgb(11, 95, 255)' }, fg: { value: 'rgb(20, 20, 20)' }, bg: { value: 'rgb(255, 255, 255)' } },
          textRoles: [{ role: 'h1', fontFamily: '"Fraunces", serif' }, { role: 'body', fontFamily: 'Inter, sans-serif' }],
          radii: [{ px: 999, count: 9, kind: 'button' }, { px: 12, count: 4, kind: 'card' }],
        },
      ],
    });
    const same = compareBrandSample(site, { accent: 'rgb(11, 95, 255)', fg: 'rgb(20, 20, 20)', bg: 'rgb(255, 255, 255)', headingFont: 'Fraunces', bodyFont: 'inter', buttonRadius: 9999, cardRadius: 12 });
    assert.deepStrictEqual(same, []);
    const off = compareBrandSample(site, { accent: 'rgb(0, 71, 224)', fg: 'rgb(20, 20, 20)', bg: 'rgb(255, 255, 255)', headingFont: 'Georgia', bodyFont: 'Inter', buttonRadius: 8, cardRadius: 12 });
    assert.ok(off.every((f) => f.check === 'brand-fidelity' && f.severity === 'warning'));
    assert.ok(off.some((f) => /Primary button colour: the site has #0b5fff, the design system gives #0047e0/.test(f.message)));
    assert.ok(off.some((f) => /Heading font: the site has Fraunces/.test(f.message)));
    assert.ok(off.some((f) => /Button radius: the site has 999px, the design system gives 8px/.test(f.message)));
  });

  it('writes a review page that links tokens.css and its evidence', () => {
    const html = renderBrandReviewPage({ name: 'Acme <Co>', evidence: '../../.extract/acme/evidence.json', reference: 'reference.png' });
    assert.match(html, /data-od-brand-review="\.\.\/\.\.\/\.extract\/acme\/evidence\.json"/);
    assert.match(html, /<link rel="stylesheet" href="tokens.css">/);
    assert.match(html, /Acme &lt;Co&gt;/);
    assert.match(html, /data-od-sample="button"/);
  });

  it('gives the critic the own brand reference, components and voice', async () => {
    const root = await brandWorkspace('own');
    const dir = path.join(root, '.open-design', 'design-systems', 'acme');
    await fs.writeFile(path.join(dir, 'reference.png'), 'png');
    await writeBrandRecord(dir, {
      kind: 'own',
      reference: 'reference.png',
      voice: { samples: [{ page: '/', kind: 'h1', text: 'Banking that stays out of the way' }, { page: '/', kind: 'nav', text: 'Pricing' }], headingCase: 'sentence', exclamations: 0 },
    });
    const brand = await critiqueBrand(root, '.open-design', 'user:acme');
    assert.strictEqual(brand?.reference, '.open-design/design-systems/acme/reference.png');
    assert.deepStrictEqual(brand?.voice?.samples, ['Banking that stays out of the way']);
    assert.strictEqual(brand?.voice?.headingCase, 'sentence');
    assert.strictEqual(await critiqueBrand(await brandWorkspace('reference'), '.open-design', 'user:acme'), undefined);
  });
});

describe('design system export and refresh', () => {
  it('exports an own brand for Claude Design with its logo, a fonts note and brand.html', async () => {
    const root = await brandWorkspace('own');
    const dir = path.join(root, '.open-design', 'design-systems', 'acme');
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await fs.writeFile(path.join(dir, 'assets', 'notes.txt'), 'not an asset');
    await fs.appendFile(path.join(dir, 'DESIGN.md'), "\n## Do\n- Lead with the product\n\n## Don't\n- Use gradients\n");
    await writeBrandRecord(dir, { kind: 'own', fonts: [{ family: 'Fraunces', weights: ['600'], source: 'google' }], voice: { samples: [{ page: '/', kind: 'h1', text: 'Plain banking' }], headingCase: 'sentence' } });
    const index = new ContentIndex(ASSETS, () => path.join(root, '.open-design', 'design-systems'));
    const detail = (await index.getDesignSystem('user:acme'))!;
    const out = await exportDesignSystemForClaude({ workspaceRoot: root, outputDir: '.open-design', detail });
    assert.strictEqual(out.dir, '.open-design/claude-design/acme');
    for (const f of ['project/design-system.json', 'project/tokens.json', 'project/README.md', 'project/assets/logo.svg']) assert.ok(out.files.includes(`${out.dir}/${f}`), f);
    assert.ok(!out.files.some((f) => f.endsWith('notes.txt')));
    const readme = await fs.readFile(path.join(root, out.dir, 'project/README.md'), 'utf8');
    assert.match(readme, /## Fonts[\s\S]*Fraunces/);
    const page = await fs.readFile(path.join(root, out.brandPage), 'utf8');
    assert.match(page, /project\/assets\/logo\.svg/);
    assert.match(page, /Plain banking/);
    assert.match(page, /Use gradients/);
  });

  it('exports no marks for a reference system', async () => {
    const root = await brandWorkspace('reference');
    const dir = path.join(root, '.open-design', 'design-systems', 'acme');
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const index = new ContentIndex(ASSETS, () => path.join(root, '.open-design', 'design-systems'));
    const out = await exportDesignSystemForClaude({ workspaceRoot: root, outputDir: '.open-design', detail: (await index.getDesignSystem('user:acme'))! });
    assert.ok(!out.files.some((f) => f.includes('/assets/')));
    assert.ok(out.notes.some((n) => /reference/.test(n)));
  });

  it('reads do and don\'t bullets and writes a fonts note', () => {
    const { dos, donts } = doAndDont("## Do\n- One accent\n## Avoid\n- Neon\n## Layout\n- Never centre body text\n");
    assert.deepStrictEqual(dos, ['One accent']);
    assert.deepStrictEqual(donts, ['Neon', 'Never centre body text']);
    assert.match(fontsNote({ version: 1, kind: 'own', fonts: [{ family: 'Brand Sans', weights: [], source: 'self-hosted', licence: 'unknown', freeMatch: 'Inter' }] }) ?? '', /licence not confirmed, use Inter/);
    assert.strictEqual(fontsNote(undefined), undefined);
  });

  it('diffs a fresh extraction against the saved system without touching it', () => {
    assert.deepStrictEqual(rootTokens(':root{--accent:#0b5fff; /* x */ --bg: #fff}[data-theme=dark]{--bg:#000}'), { '--accent': '#0b5fff', '--bg': '#fff' });
    const diff = diffBrand({
      compareTo: 'user:acme',
      previousTokensCss: ':root{--accent:#0b5fff;--bg:#ffffff;--radius-sm:8px;--fg:var(--ink)}',
      previousBrand: { version: 1, kind: 'own', fonts: [{ family: 'Inter', weights: [], source: 'google' }], marks: [{ role: 'logo', path: 'assets/logo.svg' }], components: { button: { primary: { radius: 8, selector: 'a' } } } },
      draftTokens: { '--accent': '#0047e0', '--bg': '#FFFFFF', '--surface': '#f5f5f5', '--fg': '#111111' },
      unmeasured: ['--radius-sm'],
      fonts: ['Inter', 'Fraunces'],
      components: { button: { primary: { radius: 999, selector: 'b' } } },
      marks: ['.open-design/.extract/acme/logo.svg', '.open-design/.extract/acme/icon.png'],
    });
    assert.deepStrictEqual(diff.tokens.changed, [{ name: '--accent', from: '#0b5fff', to: '#0047e0' }]);
    assert.deepStrictEqual(diff.tokens.added.map((t) => t.name), ['--surface']);
    assert.deepStrictEqual(diff.tokens.removed, [{ name: '--radius-sm', from: '8px' }]);
    assert.deepStrictEqual(diff.fonts, { added: ['fraunces'], removed: [] });
    assert.deepStrictEqual(diff.components, [{ name: 'button.primary.radius', from: '8', to: '999' }]);
    assert.deepStrictEqual(diff.marks, { added: ['icon.png'], removed: [] });
    assert.strictEqual(diff.same, false);
    const text = JSON.parse(formatRefreshResult(JSON.stringify({ status: 'ok', next: 'write' }), diff));
    assert.match(text.next, /comparison only: user:acme is unchanged/);
    assert.strictEqual(text.refresh.compareTo, 'user:acme');
  });

  it('refreshes only user systems with recorded URLs', () => {
    assert.strictEqual(refreshUrls(undefined, 'user:x').ok, false);
    const detail = { id: 'user:acme', brand: { version: 1, kind: 'own', sources: { urls: ['https://acme.example/', 'https://acme.example/pricing'] } } } as unknown as Parameters<typeof refreshUrls>[0];
    assert.deepStrictEqual(refreshUrls(detail, 'user:acme'), { ok: true, url: 'https://acme.example/', extraUrls: ['https://acme.example/pricing'] });
    assert.match((refreshUrls({ ...detail!, brand: undefined } as typeof detail, 'user:acme') as { error: string }).error, /no source URLs/);
  });
});

describe('brand checks (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });

  const ENTRY = '.open-design/check/poster.html';
  async function check(root: string, html: string): Promise<Extract<CheckArtifactResult, { ok: true }>> {
    await fs.mkdir(path.join(root, '.open-design', 'check'), { recursive: true });
    await fs.writeFile(path.join(root, ENTRY), html);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Brand', designSystemId: 'user:acme' } });
    const result = await checkArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, maxImages: 0 });
    assert.ok(result.ok, JSON.stringify(result));
    return result as Extract<CheckArtifactResult, { ok: true }>;
  }
  const page = (body: string, style = '') => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    ${TOKENS}
    body{margin:0;font:18px/1.5 'Inter',sans-serif;color:var(--fg);background:var(--bg)}
    main{padding:24px}
    .cta{font:inherit;background:var(--accent);color:#fff;padding:12px 20px;border:0;border-radius:6px}
    ${style}
  </style></head><body><main data-od-card data-od-format="ig-portrait" style="width:1080px;height:1350px;overflow:hidden"><h1>Spring sale</h1><p>Plain words.</p><button class="cta">Shop</button>${body}</main></body></html>`;

  it('flags an off-palette band, an off-brand font and a missing logo, and spares the brand indigo', async () => {
    const root = await brandWorkspace('own');
    const r = await check(root, page('<section class="band"><p class="odd">Hello</p></section>', '.band{background:#16a34a;height:400px}.odd{font-family:"Comic Sans MS",cursive}'));
    const codes = r.findings.map((f) => f.check);
    assert.ok(codes.includes('brand-off-palette'), JSON.stringify(r.findings));
    assert.ok(r.findings.some((f) => f.check === 'brand-font' && /comic sans/i.test(f.message)));
    assert.ok(codes.includes('brand-mark-missing'));
    assert.ok(!r.findings.some((f) => f.check === 'slop-glow' && /#6366f1/.test(f.message)), JSON.stringify(r.findings));
  });

  it('accepts brand tints, a shown logo and data-od-allow', async () => {
    const root = await brandWorkspace('own');
    const r = await check(
      root,
      page('<img alt="Acme logo" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2220%22/%3E"><section class="tint"></section><section class="odd" data-od-allow="brand-off-palette"></section>', '.tint{background:#c7c8fa;height:300px}.odd{background:#16a34a;height:300px}'),
    );
    assert.deepStrictEqual(r.findings.filter((f) => f.check.startsWith('brand-')), []);
  });

  it('reports brand-fidelity on a review page whose sample differs from the site', async () => {
    const root = await brandWorkspace('reference');
    const dir = path.join(root, '.open-design', 'design-systems', 'acme');
    await fs.mkdir(path.join(root, '.open-design', '.extract', 'acme'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.open-design', '.extract', 'acme', 'evidence.json'),
      JSON.stringify({ version: 2, pages: [{ roles: { accent: { value: 'rgb(99, 102, 241)' } }, textRoles: [{ role: 'body', fontFamily: 'Inter' }], radii: [{ px: 999, count: 5, kind: 'button' }] }] }),
    );
    await fs.appendFile(path.join(dir, 'tokens.css'), ':root{--radius-sm:8px}');
    const entry = '.open-design/design-systems/acme/review.html';
    await fs.writeFile(path.join(root, entry), renderBrandReviewPage({ name: 'Acme', evidence: '../../.extract/acme/evidence.json' }));
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Review' } });
    const r = await checkArtifact({ workspaceRoot: root, entryPath: entry, browserPath, settleMs: 0, maxImages: 0 });
    assert.ok(r.ok, JSON.stringify(r));
    const fidelity = (r as Extract<CheckArtifactResult, { ok: true }>).findings.filter((f) => f.check === 'brand-fidelity');
    assert.deepStrictEqual(fidelity.map((f) => f.selector), ['--radius-sm'], JSON.stringify(fidelity));
    assert.match(fidelity[0].message, /999px.*8px/);
  });

  it('runs no brand checks for a reference design system', async () => {
    const root = await brandWorkspace('reference');
    const r = await check(root, page('<section class="band"></section>', '.band{background:#16a34a;height:400px}'));
    assert.ok(!r.findings.some((f) => f.check.startsWith('brand-')));
    assert.ok(r.findings.some((f) => f.check === 'slop-glow'), 'the indigo accent is still flagged for a reference system');
  });
});
