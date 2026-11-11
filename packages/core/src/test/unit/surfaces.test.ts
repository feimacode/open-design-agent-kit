import * as assert from 'node:assert';
import * as path from 'node:path';
import { ContentIndex, normalizeSurfaceQuestions, type SurfaceQuestion } from '../../content/contentIndex';
import { LIST_SKILLS_FULL_LIMIT, LIST_SKILLS_PAGE_SIZE, listSkillsPayload } from '../../content/listSkillsPayload';

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
    assert.ok(ids.includes('color-type') && ids.includes('3d'));
    assert.ok(ids.includes('email'));
    assert.ok(surfaces.every((s) => s.entryCount > 0));
  });

  it('expands a surface entry to its recipe first, then its example, never a stub', async () => {
    const entries = (await index.surfaceEntries('diagram'))!;
    assert.deepStrictEqual(entries.map((e) => [e.id, e.source]), [
      ['od:prototype:diagram', 'skill'],
      ['od:prototype:diagram:example', 'example'],
    ]);
    for (const s of await index.listSurfaces()) assert.ok((await index.surfaceEntries(s.id))!.every((e) => !e.stub));
    assert.deepStrictEqual((await index.surfaceEntries('3d'))!.map((e) => e.id), ['od:prototype:3d-object', 'od:prototype:3d-object:example']);
    assert.strictEqual(await index.surfaceEntries('no-such-surface'), undefined);
    assert.deepStrictEqual((await index.surfaceEntries('email'))!.map((e) => e.id), ['od:prototype:email-campaign', 'od:prototype:email-campaign:example']);
  });

  it('builds the tool payload for "list", a surface, an unknown surface and a free query', async () => {
    const list = (await listSkillsPayload(index, { surface: 'list' })) as { surfaces: Array<{ id: string; entryCount: number }> };
    assert.ok(list.surfaces.some((s) => s.id === 'poster'));
    const poster = (await listSkillsPayload(index, { surface: 'poster' })) as { surface: { prompt: string; questions: SurfaceQuestion[] }; entries: unknown[] };
    assert.strictEqual(poster.surface.prompt, 'open-design-poster');
    assert.ok(poster.surface.questions.length > 0 && poster.entries.length > 0);
    for (const q of poster.surface.questions) {
      assert.ok(q.options && q.options.length >= 2 && q.options.length <= 4, q.id);
      assert.ok(q.default && q.options.includes(q.default), q.id);
      assert.ok(q.changes, q.id);
    }
    const unknown = (await listSkillsPayload(index, { surface: 'nope' })) as { error: string };
    assert.match(unknown.error, /Unknown surface "nope"\. Valid surfaces: .*diagram/);
    const free = (await listSkillsPayload(index, { query: 'threejs' })) as Array<{ id: string; stub?: boolean }>;
    assert.strictEqual(free.find((e) => e.id === 'od:prototype:threejs')?.stub, true);
  });

  it('lists goals with "list" and resolves a goal to its surfaces, the first as default', async () => {
    const list = (await listSkillsPayload(index, { surface: 'list' })) as { goals: Array<{ id: string; surfaces: string[] }> };
    assert.ok(list.goals.some((g) => g.id === 'promote-event' && g.surfaces[0] === 'poster'));
    const hired = (await listSkillsPayload(index, { goal: 'get-hired' })) as { goal: { label: string }; surfaces: Array<{ id: string; default?: boolean }> };
    assert.strictEqual(hired.goal.label, 'Get hired');
    assert.deepStrictEqual(hired.surfaces.map((s) => s.id), ['portfolio', 'resume', 'document', 'social']);
    assert.strictEqual(hired.surfaces[0].default, true);
    assert.strictEqual(hired.surfaces[1].default, undefined);
    const unknown = (await listSkillsPayload(index, { goal: 'nope' })) as { error: string };
    assert.match(unknown.error, /Unknown goal "nope"\. Valid goals: .*get-hired/);
  });

  it('pages the whole catalog compactly, each page small enough for one tool result', async () => {
    type Page = { total: number; offset: number; nextOffset?: number; modes: Record<string, number>; note: string; entries: Array<Record<string, unknown>> };
    const first = (await listSkillsPayload(index, {})) as Page;
    assert.ok(first.total > LIST_SKILLS_PAGE_SIZE);
    assert.strictEqual(first.offset, 0);
    assert.strictEqual(first.entries.length, LIST_SKILLS_PAGE_SIZE);
    assert.strictEqual(first.nextOffset, LIST_SKILLS_PAGE_SIZE);
    assert.strictEqual(Object.values(first.modes).reduce((a, b) => a + b, 0), first.total);
    assert.match(first.note, /query, mode, source or surface/);
    assert.match(first.note, /offset 100/);
    const ids = new Set<unknown>();
    let page: Page | undefined = first;
    while (page) {
      // Claude's limit for one tool result is about 25K tokens, roughly 100K characters of this JSON.
      assert.ok(JSON.stringify(page, null, 2).length < 50_000);
      assert.ok(page.entries.every((e) => !('examplePrompt' in e) && !('description' in e) && !('triggers' in e)));
      assert.ok(page.entries.every((e) => typeof e.summary !== 'string' || e.summary.length <= 91));
      for (const e of page.entries) ids.add(e.id);
      page = page.nextOffset === undefined ? undefined : ((await listSkillsPayload(index, { offset: page.nextOffset })) as Page);
    }
    assert.strictEqual(ids.size, first.total);
    const remixable = (await listSkillsPayload(index, { remixableOnly: true })) as Page;
    assert.ok(remixable.entries.every((e) => e.remixable === true));
  });

  it('loads plain-string questions from older content as questions without options', () => {
    const questions = normalizeSurfaceQuestions(['What is it for?', { id: 'where', text: 'Where?', options: ['Print', 'Screen'], default: 'Both', changes: 'size' }, 7]);
    assert.deepStrictEqual(questions, [
      { id: 'what-is-it-for', text: 'What is it for?' },
      { id: 'where', text: 'Where?', options: ['Print', 'Screen'], changes: 'size' },
    ]);
  });
});
