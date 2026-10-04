import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { readSource, readSourceTool, sourceOutline, sourceSlug } from '../../workspace/sourceStore';

const OUT = '.open-design';

async function tempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-source-'));
}

async function write(ws: string, rel: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(path.join(ws, rel)), { recursive: true });
  await fs.writeFile(path.join(ws, rel), content);
}

describe('sourceStore', () => {
  it('builds slugs from the full path, keeping long ones unique', () => {
    assert.strictEqual(sourceSlug('docs/Q3 Report.docx'), 'docs-q3-report-docx');
    assert.notStrictEqual(sourceSlug('a/report.docx'), sourceSlug('b/report.docx'));
    const long1 = sourceSlug(`${'x/'.repeat(60)}one.md`);
    const long2 = sourceSlug(`${'y/'.repeat(5)}${'x/'.repeat(55)}one.md`);
    assert.ok(long1.length <= 80 && long1 !== long2);
  });

  it('outlines headings outside code fences, with line ranges and a preamble', () => {
    const md = ['Intro line', '', '# One', 'a', '```', '# not a heading', '```', '## Two', 'b', ''].join('\n');
    assert.deepStrictEqual(
      sourceOutline(md).map((s) => [s.heading, s.level, s.startLine, s.endLine]),
      [
        ['(before the first heading)', 0, 1, 2],
        ['One', 1, 3, 7],
        ['Two', 2, 8, 10],
      ],
    );
    assert.deepStrictEqual(sourceOutline('plain text').map((s) => s.heading), ['(whole document)']);
  });

  it('extracts once, reuses the cache while unchanged, and re-extracts after an edit', async () => {
    const ws = await tempWorkspace();
    await write(ws, 'CHANGELOG.md', '# v2.0\n\n- Added explorations\n');
    const first = await readSource(ws, OUT, 'CHANGELOG.md');
    assert.ok(first.ok && !first.cached);
    if (!first.ok) return;
    assert.strictEqual(first.record.markdownPath, `${OUT}/sources/changelog-md/source.md`);
    assert.strictEqual(first.record.sections[0].heading, 'v2.0');

    const second = await readSource(ws, OUT, 'CHANGELOG.md');
    assert.ok(second.ok && second.cached);

    await write(ws, 'CHANGELOG.md', '# v2.1\n');
    const third = await readSource(ws, OUT, 'CHANGELOG.md');
    assert.ok(third.ok && !third.cached && third.record.sections[0].heading === 'v2.1');
  });

  it('writes extracted images under assets/ and replaces stale ones', async () => {
    const ws = await tempWorkspace();
    const makeDocx = async (images: string[]) => {
      const zip = new JSZip();
      zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>');
      for (const img of images) zip.file(`word/media/${img}`, Buffer.from([1, 2, 3]));
      return zip.generateAsync({ type: 'nodebuffer' });
    };
    await write(ws, 'brief.docx', await makeDocx(['logo.png', 'chart.jpeg']));
    const first = await readSource(ws, OUT, 'brief.docx');
    assert.ok(first.ok);
    if (first.ok) assert.deepStrictEqual(first.record.assets.map((a) => path.posix.basename(a)).sort(), ['chart.jpeg', 'logo.png']);

    await write(ws, 'brief.docx', await makeDocx(['logo.png']));
    await readSource(ws, OUT, 'brief.docx');
    assert.deepStrictEqual(await fs.readdir(path.join(ws, OUT, 'sources', 'brief-docx', 'assets')), ['logo.png']);
  });

  it('rejects paths outside the workspace, symlinks out of it, its own extractions and unsupported types', async () => {
    const ws = await tempWorkspace();
    const outside = await tempWorkspace();
    await write(outside, 'secret.md', 'x');
    await fs.symlink(path.join(outside, 'secret.md'), path.join(ws, 'link.md'));
    await write(ws, 'notes.md', '# Notes');
    await readSource(ws, OUT, 'notes.md');
    await write(ws, 'deck.key', 'x');

    for (const [p, pattern] of [
      ['../escape.md', /not found|outside/],
      ['link.md', /outside the workspace/],
      [`${OUT}/sources/notes-md/source.md`, /extracted copy/],
      ['deck.key', /Unsupported source type/],
      ['missing.docx', /not found/],
    ] as const) {
      const r = await readSource(ws, OUT, p);
      assert.ok(!r.ok, p);
      if (!r.ok) assert.match(r.error, pattern, p);
    }
  });

  it('formats the tool result as an outline without the full text', async () => {
    const ws = await tempWorkspace();
    await write(ws, 'docs/rfc.md', `# RFC\n\n${'Long body. '.repeat(500)}\n\n## Decision\n\nShip it.`);
    const result = JSON.parse(await readSourceTool({ workspaceRoot: ws, outputDir: OUT }, { path: 'docs/rfc.md' }));
    assert.deepStrictEqual(
      result.sections.map((s: { heading: string }) => s.heading),
      ['RFC', 'Decision'],
    );
    assert.ok(!JSON.stringify(result).includes('Long body. Long body.'));
    assert.match(result.next, /by line range/);
    assert.match(await readSourceTool({ workspaceRoot: undefined, outputDir: OUT }, { path: 'x' }), /No workspace folder/);
  });
});
