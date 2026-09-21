import * as assert from 'node:assert';
import type { DesignSystemDetail } from '../../content/contentIndex';
import {
  resolveActiveDesignSystem,
  setActiveDesignSystem,
  type ActiveDesignSystemStore,
} from '../../workspace/activeDesignSystemStore';

function fakeDesignSystem(id: string): DesignSystemDetail {
  return { id, name: id, summary: '', body: '', source: 'built-in' } as DesignSystemDetail;
}

function makeStore(initial?: string): ActiveDesignSystemStore & { value: string | undefined } {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(id) {
      this.value = id;
    },
  };
}

function makeCatalog(...ids: string[]) {
  const known = new Set(ids);
  return async (id: string) => (known.has(id) ? fakeDesignSystem(id) : undefined);
}

describe('resolveActiveDesignSystem', () => {
  it('an explicit valid id wins and becomes the new active one', async () => {
    const store = makeStore(undefined);
    const result = await resolveActiveDesignSystem('acme', store, makeCatalog('acme'));
    assert.strictEqual(result.designSystemId, 'acme');
    assert.strictEqual(result.designSystem?.id, 'acme');
    assert.strictEqual(store.value, 'acme');
  });

  it('an explicit unknown id resolves to unknownExplicitId, without touching the store', async () => {
    const store = makeStore('previous');
    const result = await resolveActiveDesignSystem('nope', store, makeCatalog('previous'));
    assert.strictEqual(result.unknownExplicitId, 'nope');
    assert.strictEqual(result.designSystemId, undefined);
    assert.strictEqual(store.value, 'previous');
  });

  it('falls back to the active store value when no explicit id is given', async () => {
    const store = makeStore('acme');
    const result = await resolveActiveDesignSystem(undefined, store, makeCatalog('acme'));
    assert.strictEqual(result.designSystemId, 'acme');
  });

  it('a stale active id degrades to none, without erroring', async () => {
    const store = makeStore('deleted-one');
    const result = await resolveActiveDesignSystem(undefined, store, makeCatalog());
    assert.strictEqual(result.designSystemId, undefined);
    assert.strictEqual(result.designSystem, undefined);
    assert.strictEqual(result.unknownExplicitId, undefined);
  });

  it('no explicit id and no active one resolves to none', async () => {
    const store = makeStore(undefined);
    const result = await resolveActiveDesignSystem(undefined, store, makeCatalog());
    assert.strictEqual(result.designSystemId, undefined);
  });
});

describe('setActiveDesignSystem', () => {
  it('clears the store when given no id', async () => {
    const store = makeStore('acme');
    const result = await setActiveDesignSystem(undefined, store, makeCatalog('acme'));
    assert.strictEqual(result.outcome, 'cleared');
    assert.strictEqual(store.value, undefined);
  });

  it('clears the store when given an empty/whitespace id', async () => {
    const store = makeStore('acme');
    const result = await setActiveDesignSystem('   ', store, makeCatalog('acme'));
    assert.strictEqual(result.outcome, 'cleared');
  });

  it('sets a known id', async () => {
    const store = makeStore(undefined);
    const result = await setActiveDesignSystem('acme', store, makeCatalog('acme'));
    assert.strictEqual(result.outcome, 'set');
    assert.strictEqual(store.value, 'acme');
  });

  it('reports an unknown id without touching the store', async () => {
    const store = makeStore('previous');
    const result = await setActiveDesignSystem('nope', store, makeCatalog('previous'));
    assert.deepStrictEqual(result, { outcome: 'unknown', unknownId: 'nope' });
    assert.strictEqual(store.value, 'previous');
  });
});
