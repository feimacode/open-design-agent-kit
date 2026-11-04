// Design systems from other sources (openspec add-brand-from-screenshot-or-css):
// CSS, Tailwind, W3C tokens, page source, brand guides, PowerPoint templates
// and screenshots, merged by confidence.
import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { buildDesignSystemTokensCss } from '../../generation/designSystemImport';
import { extractSite } from '../../generation/siteExtraction';
import { extractFromSources, validateSources } from '../../generation/sourceDraft';
import { cmykToHex, colorToHex, parseBrandGuideText, parseCssSource, parseHtmlSource, parseStyleSource, roleForName } from '../../generation/sourceExtraction';
import { readPowerPointTemplate } from '../../generation/templateExtraction';
import { screenshotPalette } from '../../generation/screenshotPalette';

const BRAND_CSS = `
:root {
  --color-primary: #e4002b;
  --color-background: #ffffff;
  --color-text: #1a1a1a;
  --font-heading: "Montserrat", sans-serif;
  --rausch: #ff385c;
}
body { font-family: "Open Sans", Arial, sans-serif; }
`;

const GUIDE = `# Acme brand guidelines

## Colour

Primary red
CMYK 0 100 80 5

Secondary blue
HEX #0057b8

Background — #faf7f2

Accent gold: Pantone 7406 C

## Typography

Headings: Montserrat
Body copy: Open Sans
`;

// ── A PowerPoint template, built in memory ──

const theme = (name: string, accent1: string, major: string, minor: string) => `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements>
<a:clrScheme name="${name}">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F2A44"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2>
<a:accent1><a:srgbClr val="${accent1}"/></a:accent1><a:accent2><a:srgbClr val="0057B8"/></a:accent2>
<a:accent3><a:srgbClr val="FFB81C"/></a:accent3><a:accent4><a:srgbClr val="00A3AD"/></a:accent4>
<a:accent5><a:srgbClr val="6D2077"/></a:accent5><a:accent6><a:srgbClr val="43B02A"/></a:accent6>
<a:hlink><a:srgbClr val="0057B8"/></a:hlink><a:folHlink><a:srgbClr val="6D2077"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="${name}"><a:majorFont><a:latin typeface="${major}"/></a:majorFont><a:minorFont><a:latin typeface="${minor}"/></a:minorFont></a:fontScheme>
</a:themeElements></a:theme>`;

const master = (name: string, bg?: string) => `<?xml version="1.0"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="${name}">${bg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill></p:bgPr></p:bg>` : ''}<p:spTree/></p:cSld>
<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"/></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr><a:lvl2pPr><a:defRPr sz="1600"/></a:lvl2pPr></p:bodyStyle></p:txStyles>
</p:sldMaster>`;

const rels = (items: Array<[string, string, string]>) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`)
    .join('')}</Relationships>`;

function tinyPng(): Buffer {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(200);
  return PNG.sync.write(png);
}

async function template(opts: { stock?: boolean; twoMasters?: boolean } = {}): Promise<Buffer> {
  const zip = new JSZip();
  const masters = opts.twoMasters ? 2 : 1;
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels', rels(Array.from({ length: masters }, (_, i) => [`rId${i + 1}`, 'slideMaster', `slideMasters/slideMaster${i + 1}.xml`] as [string, string, string])));
  zip.file('ppt/theme/theme1.xml', opts.stock ? theme('Office Theme', '156082', 'Aptos Display', 'Aptos') : theme('Acme', 'E4002B', 'Montserrat', 'Open Sans'));
  zip.file('ppt/theme/theme2.xml', theme('Acme Dark', '00A3AD', 'Montserrat', 'Open Sans'));
  zip.file('ppt/media/image1.png', tinyPng());
  for (let i = 1; i <= masters; i++) {
    zip.file(`ppt/slideMasters/slideMaster${i}.xml`, master(i === 1 ? 'Acme Light' : 'Acme Dark', i === 2 ? '101820' : undefined));
    zip.file(`ppt/slideMasters/_rels/slideMaster${i}.xml.rels`, rels([['rId1', 'theme', `../theme/theme${i}.xml`], ...(i === 1 ? [['rId2', 'image', '../media/image1.png'] as [string, string, string]] : [])]));
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ── A screenshot: white page, near-black text lines, a red button, a noisy photo ──

function screenshot(): Buffer {
  const w = 400;
  const h = 300;
  const png = new PNG({ width: w, height: h });
  const set = (x: number, y: number, [r, g, b]: number[]) => {
    const i = (y * w + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = [255, 255, 255];
      if (y >= 40 && y < 120 && x >= 20 && x < 300 && y % 16 < 8) c = [26, 26, 26];
      if (y >= 140 && y < 180 && x >= 20 && x < 140) c = [228, 0, 43];
      if (y >= 200 && y < 290 && x >= 220 && x < 390) c = [rand(), rand(), rand()];
      set(x, y, c);
    }
  return PNG.sync.write(png);
}

const hexOf = (c?: { rgb: number[] }) => (c ? `#${c.rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` : undefined);

describe('design system from sources', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-sources-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reads colours in hex, rgb and hsl, and maps role names only', () => {
    assert.strictEqual(colorToHex('rgb(228, 0, 43)'), '#e4002b');
    assert.strictEqual(colorToHex('hsl(0 0% 100%)'), '#ffffff');
    assert.strictEqual(colorToHex('0 0% 100%'), '#ffffff');
    assert.strictEqual(roleForName('--color-primary'), '--accent');
    assert.strictEqual(roleForName('--rausch'), undefined);
  });

  it('drafts declared tokens from CSS custom properties and rules', () => {
    const d = parseCssSource(BRAND_CSS, 'brand.css');
    assert.strictEqual(d.confidence, 'declared');
    assert.strictEqual(d.tokens['--accent']?.value, '#e4002b');
    assert.strictEqual(d.tokens['--bg']?.value, '#ffffff');
    assert.strictEqual(d.tokens['--fg']?.value, '#1a1a1a');
    assert.match(d.tokens['--font-display']?.value ?? '', /Montserrat/);
    assert.match(d.tokens['--font-body']?.value ?? '', /Open Sans/);
    assert.ok(d.candidates.some((c) => c.value === '#ff385c'), 'an unnamed colour is a candidate, not a role');
  });

  it('reads a Tailwind theme and W3C design tokens', () => {
    const tw = parseStyleSource(`module.exports = { theme: { extend: { colors: { primary: '#e4002b', background: '#ffffff' }, fontFamily: { sans: ['Open Sans', 'sans-serif'] } } } }`, 'tailwind.config.js');
    assert.strictEqual(tw.tokens['--accent']?.value, '#e4002b');
    assert.strictEqual(tw.tokens['--bg']?.value, '#ffffff');
    const w3c = parseStyleSource(JSON.stringify({ color: { primary: { $type: 'color', $value: '#e4002b' }, text: { $type: 'color', $value: '#1a1a1a' } } }), 'tokens.json');
    assert.strictEqual(w3c.tokens['--accent']?.value, '#e4002b');
    assert.strictEqual(w3c.tokens['--fg']?.value, '#1a1a1a');
  });

  it('reads page source: style blocks, Google Fonts links and theme-color', () => {
    const d = parseHtmlSource(
      `<html><head><meta name="theme-color" content="#e4002b"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Open+Sans" rel="stylesheet"><link rel="stylesheet" href="/site.css"><style>${BRAND_CSS}</style></head><body></body></html>`,
      'page source',
    );
    assert.strictEqual(d.tokens['--accent']?.value, '#e4002b');
    assert.deepStrictEqual(d.stylesheets, ['/site.css']);
    assert.ok(d.notes.some((n) => /Montserrat/.test(n)) || /Montserrat/.test(d.tokens['--font-display']?.value ?? ''));
  });

  it('reads a brand guide: labelled CMYK converted with a note, hex, Pantone as a note, fonts', () => {
    assert.strictEqual(cmykToHex(0, 100, 80, 5), '#f20030');
    const d = parseBrandGuideText(GUIDE, 'guide.md');
    assert.strictEqual(d.confidence, 'stated');
    assert.strictEqual(d.tokens['--accent']?.value, cmykToHex(0, 100, 80, 5));
    assert.match(d.tokens['--accent']?.note ?? '', /converted from CMYK 0 100 80 5/);
    assert.strictEqual(d.tokens['--bg']?.value, '#faf7f2');
    assert.ok(d.candidates.some((c) => c.value === '#0057b8'), 'Secondary is a candidate');
    assert.ok(d.notes.some((n) => /Pantone 7406 C/.test(n)));
    assert.match(d.tokens['--font-display']?.value ?? '', /Montserrat/);
    assert.match(d.tokens['--font-body']?.value ?? '', /Open Sans/);
  });

  it('reads a branded PowerPoint template: theme colours, fonts, sizes, chart palette, master logo', async () => {
    const t = await readPowerPointTemplate('acme.potx', await template());
    assert.strictEqual(t.draft.confidence, 'declared');
    assert.strictEqual(t.draft.tokens['--accent']?.value, '#e4002b');
    assert.strictEqual(t.draft.tokens['--bg']?.value, '#ffffff');
    assert.strictEqual(t.draft.tokens['--fg']?.value, '#000000');
    assert.strictEqual(t.draft.tokens['--surface']?.value, '#f2f2f2');
    assert.match(t.draft.tokens['--font-display']?.value ?? '', /Montserrat/);
    assert.match(t.draft.tokens['--font-body']?.value ?? '', /Open Sans/);
    assert.ok(t.draft.tokens['--text-base'], 'body size anchors the type scale');
    assert.deepStrictEqual(t.chartPalette, ['#e4002b', '#0057b8', '#ffb81c', '#00a3ad', '#6d2077', '#43b02a']);
    assert.deepStrictEqual(t.images.map((i) => i.name), ['template-image1.png']);
    assert.ok(t.draft.notes.some((n) => /13\.33 × 7\.5 in/.test(n)));
  });

  it('drafts nothing from the stock Office theme, and refuses a legacy .ppt', async () => {
    const t = await readPowerPointTemplate('Presentation1.pptx', await template({ stock: true }));
    assert.deepStrictEqual(Object.keys(t.draft.tokens), []);
    assert.ok(t.draft.notes.some((n) => /stock Office theme/.test(n)));
    await assert.rejects(readPowerPointTemplate('old.ppt', Buffer.from('x')), /legacy binary PowerPoint file/);
    await assert.rejects(readPowerPointTemplate('notes.pptx', Buffer.from('not a zip')), /isn't a PowerPoint file/);
  });

  it('drafts the first of two masters and lists the second as conflicts', async () => {
    const t = await readPowerPointTemplate('acme.pptx', await template({ twoMasters: true }));
    assert.strictEqual(t.draft.tokens['--accent']?.value, '#e4002b');
    assert.ok(t.conflicts.some((c) => c.token === '--accent' && c.value === '#00a3ad' && c.master === 'Acme Dark'));
    assert.ok(t.conflicts.some((c) => c.token === '--bg' && c.value === '#101820'));
  });

  it('samples a screenshot: edge background, high-contrast text, saturated accent, photo skipped', () => {
    const p = screenshotPalette(screenshot());
    assert.strictEqual(hexOf(p.roles['--bg']), '#ffffff');
    assert.strictEqual(hexOf(p.roles['--fg']), '#1a1a1a');
    assert.strictEqual(hexOf(p.roles['--accent']), '#e4002b');
  });

  it('validates sources and their limits', () => {
    assert.strictEqual(validateSources([{ kind: 'css', text: 'a{}' }]).ok, true);
    assert.match((validateSources([{ kind: 'logo', path: 'x' }]) as { error: string }).error, /kind must be one of/);
    assert.match((validateSources([{ kind: 'brandGuide', text: 'x' }]) as { error: string }).error, /text is for css and html/);
    assert.match((validateSources(Array.from({ length: 7 }, () => ({ kind: 'css', text: 'a{}' }))) as { error: string }).error, /6/);
  });

  it('merges sources by confidence, lists disagreements as conflicts, and writes the bundle', async () => {
    await fs.writeFile(path.join(root, 'guide.md'), GUIDE.replace('CMYK 0 100 80 5', 'HEX #c8102e'));
    await fs.writeFile(path.join(root, 'acme.potx'), await template());
    const result = await extractFromSources({
      workspaceRoot: root,
      outputDir: '.open-design',
      sources: [
        { kind: 'brandGuide', path: 'guide.md' },
        { kind: 'css', text: BRAND_CSS, name: 'site CSS' },
        { kind: 'screenshot', data: screenshot().toString('base64'), name: 'home' },
        { kind: 'template', path: 'acme.potx' },
      ],
    });
    assert.strictEqual(result.status, 'ok');
    assert.match(result.bundleDir, /\.open-design\/\.extract\/sources-guide$/);
    // CSS and the template are declared; the guide is stated; the screenshot sampled.
    assert.strictEqual(result.draft?.tokens['--accent'], '#e4002b');
    assert.strictEqual(result.draft?.sources['--accent']?.confidence, 'declared');
    const accentConflicts = result.draft?.conflicts.filter((c) => c.token === '--accent') ?? [];
    assert.ok(accentConflicts.some((c) => c.value === '#c8102e' && c.confidence === 'stated'), 'the guide disagrees with the site');
    assert.strictEqual(result.draft?.sources['--font-display']?.confidence, 'declared');
    assert.deepStrictEqual(result.chartPalette?.[0], '#e4002b');
    assert.ok(result.marks.some((m) => m.endsWith('template-image1.png')));
    assert.ok(result.screenshots.some((s) => s.endsWith('source-3.png')));
    assert.ok(result.notes.some((n) => /Sources disagree on/.test(n)));
    const evidence = JSON.parse(await fs.readFile(path.join(root, result.bundleDir, 'evidence.json'), 'utf8'));
    assert.deepStrictEqual(evidence.sources.map((s: { kind: string }) => s.kind), ['brandGuide', 'css', 'screenshot', 'template']);
    assert.ok(result.draftCss?.includes('--accent: #e4002b'));
  });

  it('refuses a source outside the workspace, reporting it instead of throwing', async () => {
    const result = await extractFromSources({ workspaceRoot: root, outputDir: '.open-design', sources: [{ kind: 'css', path: '../secret.css' }] });
    assert.notStrictEqual(result.status, 'ok');
    assert.ok(result.notes.some((n) => /outside the workspace/.test(n)));
  });

  it('with no browser, reads the page and its stylesheets as html and css sources', async () => {
    const result = await extractSite({
      url: 'https://acme.example/',
      workspaceRoot: root,
      outputDir: '.open-design',
      browserPath: path.join(root, 'no-such-browser'),
      resolveHost: async () => ['93.184.216.34'],
      fetchSiteTexts: async (url) => ({ base: new URL(url), html: '<html><head><style>body{font-family:"Open Sans",sans-serif}</style></head></html>', stylesheets: [{ url: 'https://acme.example/brand.css', text: BRAND_CSS }], warnings: [] }),
    });
    assert.strictEqual(result.status, 'partial');
    if (!('bundleDir' in result)) throw new Error('expected a bundle');
    assert.strictEqual(result.draft?.tokens['--accent'], '#e4002b');
    assert.strictEqual(result.draft?.sources['--accent']?.source, 'brand.css');
    assert.ok(result.notes.some((n) => /No Chrome, Edge or Chromium/.test(n)));
  });

  it('VS Code import maps readable role names into tokens.css', () => {
    const css = buildDesignSystemTokensCss(BRAND_CSS, 'brand.css')!;
    assert.match(css, /--accent: #e4002b; \/\* from --color-primary \*\//);
    assert.doesNotMatch(css, /rausch/);
  });
});
