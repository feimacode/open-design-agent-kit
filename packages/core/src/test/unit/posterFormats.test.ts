import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { resolveExportSize } from '../../export/exportSize';
import { composeInstructions } from '../../generation/composeInstructions';
import { checkDataAgainstFields, loadDataTable, parseCsv, rowFileSuffixes, scanBoundFields } from '../../poster/data';
import { bleedBox, composeCanvasSection, composeFluidCanvasSection, FORMAT_IDS, FORMATS, getFormat, isFluidHtml, posterRegistrationMetadata, resolveBriefCanvas, unknownFormatError } from '../../poster/formats';

describe('poster formats', () => {
  it('keeps the social-post sizes and budgets', () => {
    const rows: Array<[string, number, number, number | undefined, string]> = [
      ['x-image', 1600, 900, 5_000_000, 'od:prototype:card-twitter'],
      ['ig-square', 1080, 1080, 8_000_000, 'od:prototype:social-carousel'],
      ['ig-portrait', 1080, 1350, 8_000_000, 'od:prototype:poster-hero'],
      ['story', 1080, 1920, 8_000_000, 'od:prototype:poster-hero'],
      ['xhs-card', 1080, 1440, undefined, 'od:prototype:card-xiaohongshu'],
      ['yt-thumbnail', 1280, 720, 2_000_000, 'od:prototype:social-youtube-thumbnail'],
    ];
    for (const [id, w, h, bytes, skill] of rows) {
      const f = FORMATS[id];
      assert.deepStrictEqual([f.medium, f.width, f.height, f.unit, f.maxBytes, f.skillHint], ['screen', w, h, 'px', bytes, skill], id);
    }
  });

  it('carries print parameters and computes the bleed box', () => {
    const a3 = getFormat('a3')!;
    assert.deepStrictEqual([a3.medium, a3.width, a3.height, a3.unit, a3.bleed], ['print', 297, 420, 'mm', 3]);
    assert.ok(a3.minTypePt && a3.safeInset > 0);
    assert.deepStrictEqual(bleedBox(a3), { width: 303, height: 426, bleed: 3 });
    assert.deepStrictEqual(bleedBox(a3, 0), { width: 297, height: 420, bleed: 0 });
    assert.deepStrictEqual(bleedBox(getFormat('letter')!), { width: 222.25, height: 285.75, bleed: 3.175 });
    for (const id of ['a4', 'a2', 'a1', 'a0', 'tabloid', 'poster-18x24', 'poster-24x36']) assert.strictEqual(FORMATS[id].medium, 'print', id);
  });

  it('lists valid ids for an unknown one', () => {
    assert.strictEqual(getFormat('a7'), undefined);
    const message = unknownFormatError('a7');
    for (const id of FORMAT_IDS) assert.ok(message.includes(id), id);
  });

  it('writes a print canvas section with bleed, trim, safe area and type size', () => {
    const text = composeCanvasSection(getFormat('a3')!);
    for (const needle of ['303mm × 426mm', '297×420 mm', '3 mm', '8 mm** inside', '10 pt', 'never** viewport units', 'data-od-card', 'data-od-field', 'data-od-qr', 'checkOnly: true']) {
      assert.ok(text.includes(needle), needle);
    }
  });

  it('writes a screen canvas section without bleed', () => {
    const text = composeCanvasSection(getFormat('story')!);
    assert.ok(text.includes('1080×1920 px'));
    assert.ok(text.includes('48px'));
    assert.ok(!/bleed/i.test(text));
  });

  it('adds the canvas only when a format is given', () => {
    const base = { skillName: 'poster-hero', skillBody: 'Make a poster.', brief: 'Meetup poster', suggestedEntryPath: '.open-design/meetup/meetup.html' };
    const without = composeInstructions(base);
    assert.ok(!without.includes('## Canvas'));
    const withFormat = composeInstructions({ ...base, canvasFormat: getFormat('a2') });
    assert.ok(withFormat.includes('## Canvas — A2'));
    assert.ok(withFormat.includes('`format: "a2"`'));
  });
});

describe('export size with a canvas format', () => {
  it('orders explicit > preset/recorded > skill hint', () => {
    const story = getFormat('story')!;
    assert.strictEqual(resolveExportSize({ width: 100, height: 100, canvas: { format: story, source: 'preset' } }).source, 'explicit');
    const preset = resolveExportSize({ aspectHint: '1600×900', canvas: { format: story, source: 'preset' } });
    assert.deepStrictEqual([preset.source, preset.viewport], ['preset', { width: 1080, height: 1920 }]);
    const recorded = resolveExportSize({ aspectHint: '1600×900', canvas: { format: story, source: 'recorded-format' } });
    assert.strictEqual(recorded.source, 'recorded-format');
  });

  it('sizes a print viewport to the bleed box in CSS px', () => {
    const a3 = resolveExportSize({ canvas: { format: getFormat('a3')!, source: 'preset', bleed: 3 } });
    assert.deepStrictEqual(a3.viewport, { width: Math.ceil((303 * 96) / 25.4), height: Math.ceil((426 * 96) / 25.4) });
    assert.match(a3.detail, /303×426 mm/);
  });
});

describe('bulk-export data', () => {
  it('parses RFC 4180 CSV', () => {
    assert.deepStrictEqual(parseCsv('﻿name,quote\r\n"Ada, L.","She said ""hi""\nthen left"\r\nBob,\n\n'), [
      ['name', 'quote'],
      ['Ada, L.', 'She said "hi"\nthen left'],
      ['Bob', ''],
    ]);
  });

  it('loads CSV, JSON and XLSX', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-data-'));
    await fs.writeFile(path.join(root, 'a.csv'), 'name,title\nAda,Engineer\n');
    await fs.writeFile(path.join(root, 'a.json'), JSON.stringify([{ name: 'Ada', n: 3 }, { name: 'Bob', extra: null }]));
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="People" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/sharedStrings.xml', '<sst><si><t>name</t></si><si><t>Ada</t></si></sst>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>age</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>36</v></c></row></sheetData></worksheet>');
    await fs.writeFile(path.join(root, 'a.xlsx'), await zip.generateAsync({ type: 'nodebuffer' }));

    assert.deepStrictEqual(await loadDataTable(root, 'a.csv'), { columns: ['name', 'title'], rows: [{ name: 'Ada', title: 'Engineer' }] });
    assert.deepStrictEqual(await loadDataTable(root, 'a.json'), {
      columns: ['name', 'n', 'extra'],
      rows: [
        { name: 'Ada', n: '3', extra: '' },
        { name: 'Bob', n: '', extra: '' },
      ],
    });
    assert.deepStrictEqual(await loadDataTable(root, 'a.xlsx'), { columns: ['name', 'age'], rows: [{ name: 'Ada', age: '36' }] });
    await assert.rejects(loadDataTable(root, 'a.xlsx', 'Nope'), /No sheet named "Nope"/);
    await assert.rejects(loadDataTable(root, '../x.csv'), /outside the workspace/);
    await assert.rejects(loadDataTable(root, 'missing.csv'), /No data file/);
  });

  it('checks fields against columns before rendering', () => {
    const table = { columns: ['name', 'title', 'unused'], rows: [{ name: 'Ada', title: '', unused: 'x' }] };
    const bound = scanBoundFields(`<h1 data-od-field="name">x</h1><p data-od-field='title'></p><div data-od-qr-field="url"></div>`);
    assert.deepStrictEqual(bound, { fields: ['name', 'title'], qrFields: ['url'] });
    const missing = checkDataAgainstFields(table, bound, 'people.csv');
    assert.ok(!missing.ok && /"url"/.test(missing.error) && /name, title, unused/.test(missing.error));
    const ok = checkDataAgainstFields(table, { fields: ['name', 'title'], qrFields: [] }, 'people.csv');
    assert.ok(ok.ok);
    assert.ok(ok.warnings.some((w) => /unused/.test(w)));
    assert.ok(ok.warnings.some((w) => /Row 1: empty title/.test(w)));
    const tooMany = checkDataAgainstFields({ columns: ['name'], rows: Array.from({ length: 201 }, () => ({ name: 'a' })) }, { fields: ['name'], qrFields: [] }, 'big.csv');
    assert.ok(!tooMany.ok && /at most 200/.test(tooMany.error));
    const noFields = checkDataAgainstFields(table, { fields: [], qrFields: [] }, 'people.csv');
    assert.ok(!noFields.ok);
  });

  it('names rows by slug, unique, else by number', () => {
    const table = { columns: ['name'], rows: [{ name: 'Ada Lovelace' }, { name: 'Ada  lovelace' }, { name: 'ada-lovelace-2' }, { name: '' }, { name: 'Zoë' }] };
    assert.deepStrictEqual(rowFileSuffixes(table, 'name'), ['ada-lovelace', 'ada-lovelace-2', 'ada-lovelace-2-2', '04', 'zoe']);
    assert.deepStrictEqual(rowFileSuffixes({ columns: [], rows: [{}, {}] }), ['01', '02']);
  });
});

describe('fluid briefs', () => {
  it('defaults print to fluid and screen to fixed, and A3 for fluid without a format', () => {
    assert.deepStrictEqual(resolveBriefCanvas('a2', undefined), { format: getFormat('a2'), fluid: true });
    assert.deepStrictEqual(resolveBriefCanvas('x-image', undefined), { format: getFormat('x-image'), fluid: false });
    assert.deepStrictEqual(resolveBriefCanvas('story', true), { format: getFormat('story'), fluid: true });
    assert.deepStrictEqual(resolveBriefCanvas('a3', false), { format: getFormat('a3'), fluid: false });
    assert.deepStrictEqual(resolveBriefCanvas(undefined, true), { format: getFormat('a3'), fluid: true });
    assert.deepStrictEqual(resolveBriefCanvas(undefined, undefined), { fluid: false });
    assert.ok('error' in resolveBriefCanvas('a7', true));
  });

  it('writes the fluid contract with the format as the default shape', () => {
    const a2 = composeFluidCanvasSection(getFormat('a2')!);
    for (const needle of ['data-od-fluid', '--od-w: 420mm; --od-h: 594mm', '--od-bleed', 'container-type: size', 'aspect-ratio > 1.2', 'aspect-ratio < 0.6', 'data-od-priority', 'object-position', 'max(14pt, 2.4cqmin)', 'build at the trim size', 'checkOnly: true']) {
      assert.ok(a2.includes(needle), needle);
    }
    assert.ok(!a2.includes('426mm') && !a2.includes('426 mm'), 'no bleed in the card size');
    const story = composeFluidCanvasSection(getFormat('story')!);
    assert.ok(story.includes('--od-w: 1080px; --od-h: 1920px'));
    assert.ok(!story.includes('build at the trim size'));
    const brief = composeInstructions({ skillName: 's', skillBody: 'b', brief: 'x', suggestedEntryPath: 'a.html', canvasFormat: getFormat('a2'), fluid: true });
    assert.ok(brief.includes('## Canvas — fluid poster'));
  });

  it('detects a fluid card in HTML', () => {
    assert.ok(isFluidHtml('<div class="p" data-od-card data-od-fluid>'));
    assert.ok(isFluidHtml('<section data-od-fluid="" data-od-card="">'));
    assert.ok(!isFluidHtml('<div data-od-card>'));
    assert.ok(!isFluidHtml('<div data-od-card></div><div data-od-fluid></div>'));
    assert.ok(!isFluidHtml('<div data-od-cardx data-od-fluid>'));
  });

  it('records format and fluid at registration', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-fluid-'));
    await fs.writeFile(path.join(root, 'a.html'), '<div data-od-card data-od-fluid></div>');
    await fs.writeFile(path.join(root, 'b.html'), '<div data-od-card></div>');
    assert.deepStrictEqual(await posterRegistrationMetadata(root, 'a.html', 'a3'), { format: 'a3', fluid: true });
    assert.deepStrictEqual(await posterRegistrationMetadata(root, 'a.html', undefined), { fluid: true });
    assert.deepStrictEqual(await posterRegistrationMetadata(root, 'b.html', 'story'), { format: 'story' });
    assert.strictEqual(await posterRegistrationMetadata(root, 'b.html', undefined), undefined);
  });

  it('keeps earlier metadata when an artifact is registered again', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-rereg-'));
    await fs.writeFile(path.join(root, 'p.html'), '<div data-od-card data-od-fluid></div>');
    const earlier = { format: 'poster-18x24', fluid: true, exports: [{ path: 'exports/p.pdf' }], shares: { netlify: { url: 'https://x' } }, remixedFrom: 'od:x' };
    await fs.writeFile(path.join(root, 'p.html.artifact.json'), JSON.stringify({ kind: 'html', metadata: earlier }));
    assert.deepStrictEqual(await posterRegistrationMetadata(root, 'p.html', undefined), earlier, 'the default shape chosen in the preview survives');
    assert.deepStrictEqual((await posterRegistrationMetadata(root, 'p.html', 'a1'))?.format, 'a1', 'a new format replaces it');
    await fs.writeFile(path.join(root, 'p.html'), '<div data-od-card></div>');
    const fixed = await posterRegistrationMetadata(root, 'p.html', undefined);
    assert.deepStrictEqual([fixed?.fluid, fixed?.format, fixed?.shares], [undefined, 'poster-18x24', earlier.shares], 'fluid follows the HTML');
  });
});
