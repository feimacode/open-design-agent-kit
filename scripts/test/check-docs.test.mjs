import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks, headings, mentions, parseCliSurface, sectionText, slugify } from '../check-docs.mjs';

test('slugify follows GitHub heading anchors', () => {
  assert.equal(slugify('No Chrome, Edge, or Chromium browser was found'), 'no-chrome-edge-or-chromium-browser-was-found');
  assert.equal(slugify('openDesign.export.browserPath'), 'opendesignexportbrowserpath');
  assert.equal(slugify('export_open_design_artifact'), 'export_open_design_artifact');
  assert.equal(slugify('Export failed (not-a-deck)'), 'export-failed-not-a-deck');
});

test('headings strip inline code, skip fenced code, and suffix duplicates', () => {
  const md = '# Title\n\n### `export_open_design_artifact`\n\n```bash\n# not a heading\n```\n\n## Setup\n## Setup\n';
  assert.deepEqual(
    headings(md).map((h) => [h.level, h.text, h.slug]),
    [
      [1, 'Title', 'title'],
      [3, 'export_open_design_artifact', 'export_open_design_artifact'],
      [2, 'Setup', 'setup'],
      [2, 'Setup', 'setup-1'],
    ],
  );
});

test('sectionText ends at the next heading of the same or higher level', () => {
  const md = '## tools\n### a\nuses `x`\n#### detail\nmore\n### b\nuses y\n';
  assert.equal(sectionText(md, 'a', 3), '### a\nuses `x`\n#### detail\nmore');
  assert.equal(sectionText(md, 'missing', 3), undefined);
});

test('extractLinks ignores code spans and fences, keeps images and anchors', () => {
  const md = 'See [guide](guides/a.md#step-2) and ![shot](../s.png).\n`[not](a link)`\n```\n[nor](this)\n```\n[ext](https://example.com)';
  assert.deepEqual(
    extractLinks(md).map((l) => l.target),
    ['guides/a.md#step-2', '../s.png', 'https://example.com'],
  );
});

test('mentions matches whole tokens only', () => {
  assert.ok(mentions('| `maxBytes` | budget |', 'maxBytes'));
  assert.ok(mentions('use --max-bytes 5000000', '--max-bytes'));
  assert.ok(!mentions('use --max-bytes-extra', '--max-bytes'));
  assert.ok(!mentions('deckish', 'deck'));
});

test('parseCliSurface attaches options to their command', () => {
  const src = `program.command('init [path]').option('--tools <list>', 'x');
program.command('export <entryPath>').option('--width <px>', 'w').option('--deck', 'd');
program.command('render-video <dir>').requiredOption('--output <file.mp4>', 'o');`;
  assert.deepEqual(parseCliSurface(src), { init: ['--tools'], export: ['--width', '--deck'], 'render-video': ['--output'] });
});
