// A Canva design as a design-system source (openspec add-design-system-from-canva):
// link parsing, the export-host allowlist and download, Canva mode in the
// PowerPoint reader, and the canva record in the evidence bundle.

import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { composeCanvaExportInstructions, fetchExportFile, isAllowedExportUrl, parseCanvaUrl } from '../../generation/canvaLink';
import { saveNewBrand } from '../../generation/brandSave';
import { extractFromSources, validateSources } from '../../generation/sourceDraft';
import { readPowerPointTemplate, readSlideText, slideFonts } from '../../generation/templateExtraction';

const EXPORT = 'https://export-download.canva.com/XhUfw/DAHXIhXhUfw/-1/3151915514940061450.pptx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc';

// ── A Canva-style PPTX: stock Office theme, fonts and colours on each run, a logo on every slide ──

const officeTheme = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements>
<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="0E2841"/></a:dk2><a:lt2><a:srgbClr val="E8E8E8"/></a:lt2><a:accent1><a:srgbClr val="156082"/></a:accent1><a:accent2><a:srgbClr val="E97132"/></a:accent2></a:clrScheme>
<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>
</a:themeElements></a:theme>`;

const rels = (items: Array<[string, string, string]>) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`)
    .join('')}</Relationships>`;

const run = (text: string, font: string, sz: number, color: string) =>
  `<a:r><a:rPr lang="en-US" sz="${sz}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${font}"/></a:rPr><a:t>${text}</a:t></a:r>`;

const slide = (runs: string) => `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p>${runs}</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

function png(value: number): Buffer {
  const image = new PNG({ width: 4, height: 4 });
  image.data.fill(value);
  return PNG.sync.write(image);
}

async function canvaPptx(opts: { slides?: number } = {}): Promise<Buffer> {
  const count = opts.slides ?? 3;
  const zip = new JSZip();
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...Array.from({ length: count }, (_, i) => [`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`] as [string, string, string])]),
  );
  zip.file('ppt/theme/theme1.xml', officeTheme);
  zip.file('ppt/slideMasters/slideMaster1.xml', '<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Office"><p:spTree/></p:cSld></p:sldMaster>');
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'theme', '../theme/theme1.xml']]));
  // Canva writes a copy of the logo per slide: same bytes, different part names.
  for (let i = 1; i <= count; i++) {
    zip.file(`ppt/media/logo${i}.png`, png(30));
    zip.file(`ppt/media/photo${i}.png`, png(100 + i));
    zip.file(
      `ppt/slides/slide${i}.xml`,
      slide(run('Spring Exhibition', 'Playfair Display', 6000, '1A1A1A') + run('Opening night with the artists, drinks and music from eight until late.', 'Lato', 1800, '3D3D3D')),
    );
    zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, rels([['rId1', 'image', `../media/logo${i}.png`], ['rId2', 'image', `../media/photo${i}.png`]]));
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A fetch that serves `routes` (URL prefix → response) and records each URL it was asked for. */
function fakeFetch(routes: Record<string, () => Response>): { fetchImpl: typeof fetch; asked: string[] } {
  const asked: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return key ? routes[key]() : new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, asked };
}

describe('Canva links', () => {
  it('parses design, share, short and template links, and nothing else', () => {
    assert.deepStrictEqual(parseCanvaUrl('https://www.canva.com/design/DAHXIhXhUfw/AbCdEf/edit'), { kind: 'design', link: 'https://www.canva.com/design/DAHXIhXhUfw/AbCdEf/edit', designId: 'DAHXIhXhUfw' });
    assert.strictEqual(parseCanvaUrl('https://www.canva.com/d/Q4pHCnOPWwlUFRo')?.kind, 'share');
    assert.strictEqual(parseCanvaUrl('https://canva.link/abc123')?.code, 'abc123');
    assert.strictEqual(parseCanvaUrl('https://www.canva.com/templates/EAFhHk2c8bY-blue-modern-poster/')?.templateId, 'EAFhHk2c8bY');
    assert.strictEqual(parseCanvaUrl('https://www.canva.com/pricing/'), undefined);
    assert.strictEqual(parseCanvaUrl('https://canva.com.evil.example/design/DAHXIhXhUfw/x'), undefined);
    assert.strictEqual(parseCanvaUrl('not a link'), undefined);
  });

  it('allows only https export links on the listed hosts', () => {
    assert.ok(isAllowedExportUrl(EXPORT));
    assert.ok(!isAllowedExportUrl(EXPORT.replace('https:', 'http:')));
    assert.ok(!isAllowedExportUrl('https://export-download.canva.com.evil.example/x.pptx'));
    assert.ok(!isAllowedExportUrl('https://user:pw@export-download.canva.com/x.pptx'));
    assert.ok(!isAllowedExportUrl('https://export-download.canva.com:8443/x.pptx'));
    assert.ok(!isAllowedExportUrl('https://example.com/x.pptx'));
  });
});

describe('Canva export download', () => {
  it('downloads an allowed link without credentials', async () => {
    const { fetchImpl, asked } = fakeFetch({ [EXPORT]: () => new Response(new Uint8Array(Buffer.from('pptx bytes'))) });
    const bytes = await fetchExportFile(EXPORT, { fetchImpl });
    assert.strictEqual(bytes.toString(), 'pptx bytes');
    assert.deepStrictEqual(asked, [EXPORT]);
  });

  it('refuses a redirect to another host before fetching it', async () => {
    const { fetchImpl, asked } = fakeFetch({ [EXPORT]: () => new Response(null, { status: 302, headers: { location: 'https://example.com/steal' } }) });
    await assert.rejects(fetchExportFile(EXPORT, { fetchImpl }), /example\.com is not a Canva export host/);
    assert.deepStrictEqual(asked, [EXPORT]);
  });

  it('stops at the size limit and reports an expired link', async () => {
    const big = fakeFetch({ [EXPORT]: () => new Response(new Uint8Array(2048)) });
    await assert.rejects(fetchExportFile(EXPORT, { fetchImpl: big.fetchImpl, maxBytes: 1024 }), /over/);
    const gone = fakeFetch({ [EXPORT]: () => new Response('expired', { status: 403 }) });
    await assert.rejects(fetchExportFile(EXPORT, { fetchImpl: gone.fetchImpl }), /HTTP 403[\s\S]*export the design again/);
  });
});

describe('Canva sources', () => {
  it('takes fileUrl only for templates and screenshots from an export host', () => {
    assert.ok(validateSources([{ kind: 'template', fileUrl: EXPORT, canva: { design: 'https://www.canva.com/design/DAHXIhXhUfw/x/edit' } }]).ok);
    const other = validateSources([{ kind: 'screenshot', fileUrl: 'https://example.com/page.png' }]) as { error: string };
    assert.match(other.error, /export link from export-download\.canva\.com; example\.com is not one, and nothing was fetched/);
    assert.match((validateSources([{ kind: 'css', fileUrl: EXPORT }]) as { error: string }).error, /fileUrl is for a screenshot or template/);
    assert.match((validateSources([{ kind: 'template', fileUrl: EXPORT, path: 'a.pptx' }]) as { error: string }).error, /exactly one of path, text, data or fileUrl/);
    assert.match((validateSources([{ kind: 'screenshot', fileUrl: EXPORT, canva: { pages: [0] } }]) as { error: string }).error, /page numbers from 1/);
  });

  it('reads fonts from the slides, keeps a stock theme as candidates, and keeps a repeated logo', async () => {
    const t = await readPowerPointTemplate('poster.pptx', await canvaPptx(), { canva: true });
    assert.match(t.draft.tokens['--font-display']!.value, /^"Playfair Display"/);
    assert.match(t.draft.tokens['--font-body']!.value, /^"Lato"/);
    assert.strictEqual(t.draft.tokens['--accent'], undefined, 'a stock theme drafts no colour roles');
    assert.ok(t.draft.candidates.some((c) => c.value === '#156082' && /stock theme/.test(c.label ?? '')));
    assert.ok(t.draft.candidates.some((c) => c.value === '#3d3d3d' && /text colour on the slides/.test(c.label ?? '')));
    assert.deepStrictEqual(t.images.map((i) => i.name), ['template-repeated-logo1.png']);
    assert.ok(t.draft.notes.some((n) => /as Canva exports often do/.test(n)));
  });

  it('without Canva mode, a stock theme still drafts nothing', async () => {
    const t = await readPowerPointTemplate('poster.pptx', await canvaPptx());
    assert.deepStrictEqual(t.draft.tokens, {});
    assert.deepStrictEqual(t.images, []);
  });

  it('keeps no repeated image on a one-page design', async () => {
    const t = await readPowerPointTemplate('poster.pptx', await canvaPptx({ slides: 1 }), { canva: true });
    assert.deepStrictEqual(t.images, []);
    assert.ok(t.draft.tokens['--font-body']);
  });

  it('ranks body by characters and display by large text', () => {
    const use = readSlideText([slide(run('Big', 'Anton', 7200, '000000') + run('Body copy that runs long enough to win', 'Inter', 1600, '222222'))]);
    assert.deepStrictEqual(slideFonts(use), { body: 'Inter', display: 'Anton', bodyChars: 38, displayChars: 3 });
  });

  it('downloads the exports, drafts from them and records the Canva design', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-canva-'));
    const pptx = await canvaPptx();
    const pngUrl = 'https://export-download.canva.com/XhUfw/DAHXIhXhUfw/-1/0/0001.png?X-Amz-Signature=def';
    const { fetchImpl, asked } = fakeFetch({ [EXPORT]: () => new Response(new Uint8Array(pptx)), [pngUrl]: () => new Response(new Uint8Array(png(250))) });
    const design = 'https://www.canva.com/design/DAHXIhXhUfw/x/edit';
    const sources = validateSources([
      { kind: 'template', fileUrl: EXPORT, name: 'Poster.pptx', canva: { design } },
      { kind: 'screenshot', fileUrl: pngUrl, name: 'page 1', canva: { design, pages: [1] } },
    ]);
    assert.ok(sources.ok);
    const result = await extractFromSources({ workspaceRoot: root, outputDir: '.open-design', sources: sources.sources, fetchImpl });
    assert.deepStrictEqual(asked.sort(), [EXPORT, pngUrl].sort());
    assert.match(result.draft?.tokens['--font-body'] ?? '', /Lato/);
    const evidence = JSON.parse(await fs.readFile(path.join(root, result.bundleDir, 'evidence.json'), 'utf8'));
    assert.strictEqual(evidence.canva.source, 'canva');
    assert.strictEqual(evidence.canva.design, design);
    assert.deepStrictEqual(evidence.canva.pages, [1]);
    assert.ok(!JSON.stringify(evidence.sources).includes('X-Amz-Signature'), 'signed links are not kept');
    assert.ok(result.marks.some((m) => m.endsWith('template-repeated-logo1.png')));
    assert.ok(result.notes.some((n) => /Draft from Canva exports of https:\/\/www\.canva\.com\/design\/DAHXIhXhUfw/.test(n)));

    // Saving keeps the record, uses page 1 as the reference and names the design on the review page.
    const saved = await saveNewBrand({ workspaceRoot: root, outputDir: '.open-design', dirRel: '.open-design/design-systems/poster', name: 'Poster', kind: 'own', evidenceDir: result.bundleDir });
    assert.strictEqual(saved.brand.sources?.source, 'canva');
    assert.strictEqual(saved.brand.sources?.canva?.design, design);
    assert.ok(saved.brand.reference, 'page 1 stands in as the reference image');
    assert.match(await fs.readFile(path.join(root, saved.review!), 'utf8'), /From the Canva design https:\/\/www\.canva\.com\/design\/DAHXIhXhUfw\/x\/edit, pages 1/);
  });

  it('reports an export from another host as unreadable instead of fetching it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-canva-'));
    const { fetchImpl, asked } = fakeFetch({});
    const result = await extractFromSources({ workspaceRoot: root, outputDir: '.open-design', sources: [{ kind: 'template', fileUrl: 'https://example.com/x.pptx' }], fetchImpl });
    assert.deepStrictEqual(asked, []);
    assert.ok(result.notes.some((n) => /example\.com is not a Canva export host/.test(n)));
  });
});

describe('Canva export instructions', () => {
  it('names the export steps and the call back for a design link', () => {
    const link = 'https://www.canva.com/design/DAHXIhXhUfw/x/edit';
    const text = composeCanvaExportInstructions({ link, ref: parseCanvaUrl(link)! });
    assert.match(text, /design `DAHXIhXhUfw`/);
    assert.match(text, /"type": "pptx"/);
    assert.match(text, /"type": "png", "pages"/);
    assert.match(text, /"fileUrl": "<the pptx link>"/);
    assert.match(text, /can't read a Brand Kit's colours, fonts or logos/);
  });

  it('resolves a short link, and asks for a design for a public template', () => {
    assert.match(composeCanvaExportInstructions({ link: 'https://canva.link/abc', ref: parseCanvaUrl('https://canva.link/abc')! }), /`resolve-shortlink` with `shortlink_id: "abc"`/);
    const template = 'https://www.canva.com/templates/EAFhHk2c8bY-blue-modern-poster/';
    assert.match(composeCanvaExportInstructions({ link: template, ref: parseCanvaUrl(template)! }), /Customize this template/);
  });

  it('asks for attached files rather than workspace paths on the hosted server', () => {
    const link = 'https://www.canva.com/design/DAHXIhXhUfw/x/edit';
    assert.match(composeCanvaExportInstructions({ link, ref: parseCanvaUrl(link)!, hosted: true }), /attach the files[\s\S]*"data": "<base64>"/);
    assert.match(composeCanvaExportInstructions({ link, ref: parseCanvaUrl(link)! }), /into the workspace/);
  });
});
