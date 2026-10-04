import * as assert from 'node:assert';
import JSZip from 'jszip';
import { DocumentExtractError, extractDocument, sourceKindFor } from '../../vendored/documentExtract';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function wPara(text: string, opts: { style?: string; list?: boolean } = {}): string {
  const pPr = opts.style || opts.list ? `<w:pPr>${opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ''}${opts.list ? '<w:numPr><w:ilvl w:val="0"/></w:numPr>' : ''}</w:pPr>` : '';
  // Split the text across two runs to check runs are concatenated without inserted spaces.
  const mid = Math.floor(text.length / 2);
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text.slice(0, mid)}</w:t></w:r><w:r><w:t>${text.slice(mid)}</w:t></w:r></w:p>`;
}

async function zipOf(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function docx(body: string, extra: Record<string, string | Buffer> = {}): Promise<Buffer> {
  return zipOf({ 'word/document.xml': `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`, ...extra });
}

function slideXml(title: string, bullets: string[]): string {
  const sp = (type: string | undefined, paras: string[]) =>
    `<p:sp><p:nvSpPr><p:nvPr>${type ? `<p:ph type="${type}"/>` : '<p:ph idx="1"/>'}</p:nvPr></p:nvSpPr><p:txBody>${paras
      .map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`)
      .join('')}</p:txBody></p:sp>`;
  return `<p:sld><p:cSld><p:spTree>${sp('title', [title])}${sp(undefined, bullets)}</p:spTree></p:cSld></p:sld>`;
}

describe('documentExtract', () => {
  it('maps extensions to kinds and rejects legacy and unknown formats', () => {
    assert.deepStrictEqual(sourceKindFor('a/Report.DOCX'), { kind: 'docx' });
    assert.deepStrictEqual(sourceKindFor('CHANGELOG.md'), { kind: 'markdown' });
    assert.match((sourceKindFor('old.ppt') as { error: string }).error, /Save it as \.pptx/);
    assert.match((sourceKindFor('x.key') as { error: string }).error, /Unsupported source type/);
  });

  it('extracts DOCX headings, lists, tables and paragraphs in order, with images', async () => {
    const body = [
      wPara('Quarterly report', { style: 'Title' }),
      wPara('Revenue', { style: 'Heading2' }),
      wPara('Revenue grew to $4.2M this quarter.'),
      wPara('Enterprise up 30%', { list: true }),
      wPara('Self-serve flat', { list: true }),
      `<w:tbl><w:tr><w:tc>${wPara('Region')}</w:tc><w:tc>${wPara('Revenue')}</w:tc></w:tr><w:tr><w:tc>${wPara('EU')}</w:tc><w:tc>${wPara('1,200')}</w:tc></w:tr></w:tbl>`,
      wPara('Überblick', { style: 'Berschrift1' }).replace('<w:pPr>', '<w:pPr><w:outlineLvl w:val="0"/>'),
      '<w:p/>',
    ].join('');
    const result = await extractDocument('report.docx', await docx(body, { 'word/media/image1.png': Buffer.from([0x89, 0x50]) }));
    assert.strictEqual(
      result.markdown,
      [
        '# Quarterly report',
        '## Revenue',
        'Revenue grew to $4.2M this quarter.',
        '- Enterprise up 30%\n- Self-serve flat',
        '| Region | Revenue |\n| --- | --- |\n| EU | 1,200 |',
        '# Überblick',
      ].join('\n\n'),
    );
    assert.deepStrictEqual(
      result.assets.map((a) => a.name),
      ['image1.png'],
    );
  });

  it('recognises custom heading and bullet styles through styles.xml, and skips the table of contents', async () => {
    const styles = `<w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="OrgHeading2"><w:name w:val="Org Heading 2"/></w:style>
      <w:style w:type="paragraph" w:styleId="OrgSection"><w:name w:val="Org Section"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="OrgSub"><w:name w:val="Org Sub"/><w:basedOn w:val="OrgSection"/></w:style>
      <w:style w:type="paragraph" w:styleId="OrgBullet"><w:name w:val="Org Bullet"/><w:pPr><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
    </w:styles>`;
    const body = [
      wPara('Contents entry', { style: 'TOC1' }),
      wPara('Overview', { style: 'OrgSection' }),
      wPara('Inherited', { style: 'OrgSub' }),
      wPara('Details', { style: 'OrgHeading2' }),
      wPara('First point', { style: 'OrgBullet' }),
    ].join('');
    const result = await extractDocument('custom.docx', await docx(body, { 'word/styles.xml': styles }));
    assert.strictEqual(result.markdown, '# Overview\n\n# Inherited\n\n## Details\n\n- First point');
  });

  it('takes a PPTX title from the first text box when there is no title placeholder', async () => {
    const box = (t: string[]) => `<p:sp><p:txBody>${t.map((x) => `<a:p><a:r><a:t>${x}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
    const buf = await zipOf({ 'ppt/slides/slide1.xml': `<p:sld><p:cSld><p:spTree>${box(['Q3 results', 'subtitle'])}${box(['Revenue $4.2M'])}</p:spTree></p:cSld></p:sld>` });
    assert.strictEqual((await extractDocument('boxes.pptx', buf)).markdown, '## Slide 1: Q3 results\n\n- subtitle\n- Revenue $4.2M');
  });

  it('orders PPTX slides by the presentation, with titles, bullets and notes', async () => {
    const buf = await zipOf({
      'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
      'ppt/_rels/presentation.xml.rels':
        '<Relationships><Relationship Id="rId2" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="x/slide" Target="slides/slide2.xml"/></Relationships>',
      'ppt/slides/slide1.xml': slideXml('Second', ['b1']),
      'ppt/slides/slide2.xml': slideXml('First &amp; foremost', ['a1', 'a2']),
      'ppt/slides/_rels/slide2.xml.rels':
        '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
      'ppt/notesSlides/notesSlide1.xml':
        '<p:notes><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Mention the Q3 dip.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>',
    });
    const result = await extractDocument('deck.pptx', buf);
    assert.strictEqual(result.markdown, '## Slide 1: First & foremost\n\n- a1\n- a2\n\n> Notes: Mention the Q3 dip.\n\n## Slide 2: Second\n\n- b1');
  });

  it('extracts XLSX sheets as aligned tables and caps rows', async () => {
    const rows = [`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>`];
    for (let i = 2; i <= 205; i++) rows.push(`<row r="${i}"><c r="A${i}"><v>${i}</v></c><c r="C${i}"><v>${i * 10}</v></c></row>`);
    const buf = await zipOf({
      'xl/workbook.xml': '<workbook><sheets><sheet name="Revenue" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Month</t></si><si><t>Total</t></si></sst>',
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
    });
    const result = await extractDocument('data.xlsx', buf);
    const lines = result.markdown.split('\n');
    assert.strictEqual(lines[0], '## Sheet: Revenue');
    assert.strictEqual(lines[2], '| Month |  | Total |');
    assert.strictEqual(lines[4], '| 2 |  | 20 |');
    assert.strictEqual(lines.length, 2 + 1 + 200); // heading, blank, separator, 200 rows
    assert.match(result.warnings.join('\n'), /kept the first 200 of 205 rows \(5 left out\)/);
  });

  it('passes Markdown, text and CSV through', async () => {
    const result = await extractDocument('notes.md', Buffer.from('# Title\r\n\r\nBody'));
    assert.strictEqual(result.markdown, '# Title\n\nBody');
    assert.strictEqual((await extractDocument('d.csv', Buffer.from('a,b\n1,2'))).kind, 'csv');
  });

  it('rejects XML entity declarations, broken archives and legacy files', async () => {
    await assert.rejects(extractDocument('evil.docx', await docx('<!DOCTYPE x [<!ENTITY a "b">]>')), DocumentExtractError);
    await assert.rejects(extractDocument('broken.docx', Buffer.from('not a zip')), /couldn't be opened as a zip/);
    await assert.rejects(extractDocument('old.doc', Buffer.from('x')), /Save it as \.docx/);
  });

  it('returns a note instead of failing for a PDF it cannot read', async () => {
    const result = await extractDocument('scan.pdf', Buffer.from('%PDF-1.4 not really a pdf'));
    assert.strictEqual(result.kind, 'pdf');
    assert.ok(result.pdfNote, 'a PDF that yields no text must come with guidance');
    assert.ok(result.warnings.length > 0);
  });
});
