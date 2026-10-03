import * as assert from 'node:assert';
import { DESIGN_DIRECTIONS, findDesignDirection, renderDirectionSpec } from '../../vendored/designDirections';
import { DECK_STRUCTURES, PAGE_STRUCTURES, renderStructuralDirectionSpec } from '../../generation/structuralDirections';
import { DEFAULT_VISUAL_DIRECTION_ORDER } from '../../generation/explorationPlan';

describe('direction libraries', () => {
  it('has unique visual direction ids', () => {
    const ids = DESIGN_DIRECTIONS.map((d) => d.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('resolves every id in the default visual order, covering the whole library', () => {
    for (const id of DEFAULT_VISUAL_DIRECTION_ORDER) {
      assert.ok(findDesignDirection(id), `unknown default direction ${id}`);
    }
    assert.deepStrictEqual([...DEFAULT_VISUAL_DIRECTION_ORDER].sort(), DESIGN_DIRECTIONS.map((d) => d.id).sort());
  });

  it('renders a visual spec with a :root palette and font stacks', () => {
    const spec = renderDirectionSpec(findDesignDirection('modern-minimal')!);
    assert.match(spec, /--accent:/);
    assert.match(spec, /--font-display:/);
  });

  it('looks up visual directions case-insensitively', () => {
    assert.strictEqual(findDesignDirection(' Tech-Utility ')?.id, 'tech-utility');
    assert.strictEqual(findDesignDirection('nope'), undefined);
  });

  for (const [name, library] of [
    ['page', PAGE_STRUCTURES],
    ['deck', DECK_STRUCTURES],
  ] as const) {
    it(`has unique ${name} structure ids and renders non-empty specs`, () => {
      const ids = library.map((d) => d.id);
      assert.strictEqual(new Set(ids).size, ids.length);
      assert.ok(library.length >= 4, 'needs at least 4 entries to cover the maximum count');
      for (const d of library) {
        const spec = renderStructuralDirectionSpec(d);
        assert.match(spec, /\*\*Must differ:\*\*/);
        assert.ok(d.cues.length > 0);
      }
    });
  }
});
