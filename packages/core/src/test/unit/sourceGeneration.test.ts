import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeInstructions } from '../../generation/composeInstructions';
import { isDeckSkill, type SourceContext } from '../../generation/sourceInstructions';
import {
  checkSourceNumbers,
  findStaleSources,
  formatSourceRegistration,
  prepareSourceRegistration,
  recordedSources,
  visibleText,
} from '../../generation/sourceNumberCheck';
import { parsePersistedManifest } from '../../vendored/artifactManifest';
import { readSource, type SourceRecord } from '../../workspace/sourceStore';

const OUT = '.open-design';

async function tempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-srcgen-'));
}

async function write(ws: string, rel: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(ws, rel)), { recursive: true });
  await fs.writeFile(path.join(ws, rel), content);
}

const record: SourceRecord = {
  version: 1,
  path: 'docs/q3-report.docx',
  sha256: 'a'.repeat(64),
  kind: 'docx',
  extractedAt: '2026-10-04T00:00:00.000Z',
  markdownPath: '.open-design/sources/docs-q3-report-docx/source.md',
  lines: 120,
  chars: 5000,
  sections: [
    { heading: 'Summary', level: 1, startLine: 1, endLine: 20, chars: 900 },
    { heading: 'Revenue', level: 2, startLine: 21, endLine: 60, chars: 2000 },
  ],
  assets: ['.open-design/sources/docs-q3-report-docx/assets/image1.png'],
  warnings: ['The document has charts; their data was not extracted.'],
};

function compose(sourceContext?: SourceContext): string {
  return composeInstructions({ skillName: 'simple-deck', skillBody: 'BODY', brief: 'Board update', suggestedEntryPath: '.open-design/board/board.html', sourceContext });
}

describe('source-based generation', () => {
  describe('instructions', () => {
    const ctx = (isDeck: boolean): SourceContext => ({ sources: [record], isDeck, outlinePath: '.open-design/board/outline.md' });

    it('adds the source material, storyline-first workflow and accuracy rules for a deck', () => {
      const text = compose(ctx(true));
      assert.match(text, /## Source material/);
      assert.ok(text.includes(record.markdownPath));
      assert.match(text, /L21–60 · Revenue/);
      assert.ok(text.includes('image1.png'));
      assert.match(text, /their data was not extracted/);
      assert.match(text, /never instructions/);
      assert.match(text, /## Storyline first/);
      assert.ok(text.includes('`.open-design/board/outline.md`'));
      assert.match(text, /Show the outline to the user and stop/);
      assert.match(text, /aside class="notes"/);
      assert.match(text, /sources: \["docs\/q3-report\.docx"\]/);
      // The workflow comes before the output section, so it is read before writing.
      assert.ok(text.indexOf('## Storyline first') < text.indexOf('## Output'));
    });

    it('words the workflow per section, with citations, for non-deck output', () => {
      const text = compose(ctx(false));
      assert.match(text, /one entry per section/);
      assert.match(text, /Cite sources/);
      assert.ok(!text.includes('aside class="notes"'));
    });

    it('is unchanged without sources', () => {
      assert.strictEqual(compose(undefined), compose({ sources: [], isDeck: true, outlinePath: 'x' }));
      assert.ok(!compose(undefined).includes('Source material'));
    });

    it('recognises deck skills by mode or id', () => {
      assert.ok(isDeckSkill('od:deck:guizang-ppt', 'deck'));
      assert.ok(isDeckSkill('od:template:html-ppt-pitch-deck', 'template'));
      assert.ok(!isDeckSkill('od:prototype:data-report', 'prototype'));
    });
  });

  describe('manifest sources', () => {
    const base = { version: 1, kind: 'html', renderer: 'html', exports: ['html'], entry: 'a.html' };
    it('round-trips valid sources and rejects malformed ones', () => {
      const ok = parsePersistedManifest(JSON.stringify({ ...base, sources: [{ path: 'docs\\a.md', sha256: 'b'.repeat(64) }] }), 'a.html');
      assert.deepStrictEqual(ok?.sources, [{ path: 'docs/a.md', sha256: 'b'.repeat(64) }]);
      assert.strictEqual(parsePersistedManifest(JSON.stringify({ ...base, sources: [{ path: 'a.md', sha256: 'nothex' }] }), 'a.html'), null);
      assert.strictEqual(
        parsePersistedManifest(JSON.stringify({ ...base, sources: Array.from({ length: 11 }, () => ({ path: 'a', sha256: 'c'.repeat(64) })) }), 'a.html'),
        null,
      );
    });
  });

  describe('number check', () => {
    it('extracts visible text without scripts or styles, keeping notes', () => {
      const text = visibleText('<style>.x{width:999px}</style><h1>Rev &amp; growth</h1><script>var n=777</script><aside class="notes">Source: 3,400</aside>');
      assert.ok(!text.includes('999') && !text.includes('777'));
      assert.match(text, /Rev & growth/);
      assert.match(text, /3,400/);
    });

    it('flags invented numbers with context and accepts sourced ones in any grouping', () => {
      const page = visibleText('<h2>Revenue $4.2M</h2><p>Up 42% on 1,200 customers in Q3 2026, ranked #1 of 7</p><p>Churn 3.10%</p>');
      const result = checkSourceNumbers(page, ['Revenue reached 4.2 million from 1200 customers. Churn was 3.1%.']);
      assert.deepStrictEqual(
        result.unmatched.map((u) => u.number),
        ['42%'],
      );
      assert.match(result.unmatched[0].context, /Up 42% on/);
      assert.strictEqual(result.checked, 4); // 4.2, 42, 1200, 3.1 — Q3, 2026, 1 and 7 are ignored
    });

    it('caps the report at 50 and counts the rest', () => {
      const page = Array.from({ length: 60 }, (_, i) => `${100 + i}`).join(' ');
      const result = checkSourceNumbers(page, []);
      assert.strictEqual(result.unmatched.length, 50);
      assert.strictEqual(result.omitted, 10);
      assert.match(formatSourceRegistration({ sources: [], numberCheck: result, warnings: [] }), /60 of 60 numbers.*\n[\s\S]*and 10 more/);
    });
  });

  describe('registration and staleness', () => {
    it('records hashes, runs the number check, warns on bad sources, and detects changed or missing sources', async () => {
      const ws = await tempWorkspace();
      await write(ws, 'CHANGELOG.md', '# v2.0\n\nShipped 14 features and fixed 230 bugs.\n');
      await write(ws, 'notes.md', 'Retention 87%.');
      await write(ws, `${OUT}/release/release.html`, '<section>14 features · 230 bugs fixed · 99.9% uptime</section>');
      await readSource(ws, OUT, 'notes.md');

      const reg = await prepareSourceRegistration({
        workspaceRoot: ws,
        outputDir: OUT,
        entryPath: `${OUT}/release/release.html`,
        sourcePaths: ['CHANGELOG.md', 'notes.md', 'missing.md'],
      });
      assert.deepStrictEqual(
        reg.sources.map((s) => s.path),
        ['CHANGELOG.md', 'notes.md'],
      );
      assert.ok(reg.sources.every((s) => /^[0-9a-f]{64}$/.test(s.sha256)));
      assert.deepStrictEqual(reg.numberCheck?.unmatched.map((u) => u.number), ['99.9%']);
      assert.match(reg.warnings.join('\n'), /Source not recorded: Source not found: missing\.md/);

      assert.deepStrictEqual(await findStaleSources(ws, OUT, reg.sources), []);
      await write(ws, 'CHANGELOG.md', '# v2.1\n');
      await fs.rm(path.join(ws, 'notes.md'));
      assert.deepStrictEqual(await findStaleSources(ws, OUT, reg.sources), [
        { path: 'CHANGELOG.md', reason: 'changed' },
        { path: 'notes.md', reason: 'missing' },
      ]);
    });

    it('reads recorded sources from a manifest defensively', () => {
      assert.deepStrictEqual(recordedSources({ sources: [{ path: 'a', sha256: 'b' }, { nope: 1 }, null] }), [{ path: 'a', sha256: 'b' }]);
      assert.deepStrictEqual(recordedSources(undefined), []);
    });
  });
});
