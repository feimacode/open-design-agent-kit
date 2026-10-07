import * as assert from 'node:assert';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import { listSkillsPayload } from '../../content/listSkillsPayload';

const ASSETS = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');

describe('surfaces and stubs (shipped catalog)', () => {
  const index = new ContentIndex(ASSETS);

  it('flags catalog stubs and only them', async () => {
    const all = await index.listSkills();
    const byId = new Map(all.map((s) => [s.id, s]));
    assert.strictEqual(byId.get('od:prototype:threejs')?.stub, true);
    assert.strictEqual(byId.get('od:prototype:diagram')?.stub, undefined);
    const stubs = all.filter((s) => s.stub);
    assert.ok(stubs.length >= 80 && stubs.length <= 90, `${stubs.length} stubs`);
    assert.ok(stubs.every((s) => s.source === 'skill'));
  });

  it('lists ready surfaces only, each resolving to entries', async () => {
    const surfaces = await index.listSurfaces();
    const ids = surfaces.map((s) => s.id);
    assert.ok(ids.includes('diagram') && ids.includes('poster') && ids.includes('wireframe'));
    for (const planned of ['email', 'color-type', '3d']) assert.ok(!ids.includes(planned), planned);
    assert.ok(surfaces.every((s) => s.entryCount > 0));
  });

  it('expands a surface entry to its recipe first, then its example, never a stub', async () => {
    const entries = (await index.surfaceEntries('diagram'))!;
    assert.deepStrictEqual(entries.map((e) => [e.id, e.source]), [
      ['od:prototype:diagram', 'skill'],
      ['od:prototype:diagram:example', 'example'],
    ]);
    for (const s of await index.listSurfaces()) assert.ok((await index.surfaceEntries(s.id))!.every((e) => !e.stub));
    assert.strictEqual(await index.surfaceEntries('email'), undefined);
  });

  it('builds the tool payload for "list", a surface, an unknown surface and a free query', async () => {
    const list = (await listSkillsPayload(index, { surface: 'list' })) as { surfaces: Array<{ id: string; entryCount: number }> };
    assert.ok(list.surfaces.some((s) => s.id === 'poster'));
    const poster = (await listSkillsPayload(index, { surface: 'poster' })) as { surface: { prompt: string; questions: string[] }; entries: unknown[] };
    assert.strictEqual(poster.surface.prompt, 'open-design-poster');
    assert.ok(poster.surface.questions.length > 0 && poster.entries.length > 0);
    const unknown = (await listSkillsPayload(index, { surface: 'nope' })) as { error: string };
    assert.match(unknown.error, /Unknown surface "nope"\. Valid surfaces: .*diagram/);
    const free = (await listSkillsPayload(index, { query: 'threejs' })) as Array<{ id: string; stub?: boolean }>;
    assert.strictEqual(free.find((e) => e.id === 'od:prototype:threejs')?.stub, true);
  });
});
