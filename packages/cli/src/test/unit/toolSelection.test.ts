import * as assert from 'node:assert';
import { buildToolChoices, InvalidToolsArgError, parseToolsArg } from '../../toolSelection';

describe('parseToolsArg', () => {
  it('parses "all" to every tool id', () => {
    assert.deepStrictEqual(parseToolsArg('all'), ['claude', 'codex']);
    assert.deepStrictEqual(parseToolsArg('ALL'), ['claude', 'codex']);
  });

  it('parses a single tool id', () => {
    assert.deepStrictEqual(parseToolsArg('claude'), ['claude']);
  });

  it('parses a comma-separated list, trimming whitespace and case', () => {
    assert.deepStrictEqual(parseToolsArg(' Claude , codex '), ['claude', 'codex']);
  });

  it('de-duplicates repeated ids', () => {
    assert.deepStrictEqual(parseToolsArg('claude,claude,codex'), ['claude', 'codex']);
  });

  it('throws InvalidToolsArgError on an unknown id, without silently ignoring it', () => {
    assert.throws(() => parseToolsArg('claude,cursor'), InvalidToolsArgError);
  });
});

describe('buildToolChoices', () => {
  it('offers both tools, both pre-checked', () => {
    const choices = buildToolChoices();
    assert.strictEqual(choices.length, 2);
    assert.ok(choices.every((c) => c.checked));
    assert.deepStrictEqual(
      choices.map((c) => c.value).sort(),
      ['claude', 'codex'],
    );
  });
});
