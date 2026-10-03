import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ContentIndex } from '../../content/contentIndex';
import { resolveExplorationDirections } from '../../generation/explorationPlan';
import { chooseDirection, compareExploration, prepareExploration, type ExplorationToolContext } from '../../generation/explorationTools';
import { composeInstructions, sketchFidelityText } from '../../generation/composeInstructions';
import { parsePersistedManifest } from '../../vendored/artifactManifest';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import type { ActiveDesignSystemStore } from '../../workspace/activeDesignSystemStore';
import { renderExplorationCompareHtml, refreshExplorationCompare } from '../../workspace/explorationCompare';
import {
  allocateExplorationId,
  explorationTitleFromBrief,
  listExplorations,
  readExplorationPlan,
  writeExplorationPlan,
  type ExplorationPlan,
} from '../../workspace/explorationStore';

const OUT = '.open-design';

function fakeContentIndex(): ContentIndex {
  const skills: Record<string, { id: string; name: string; description: string; mode: string; body: string }> = {
    'od:prototype:landing': { id: 'od:prototype:landing', name: 'landing', description: 'Landing page', mode: 'prototype', body: 'LANDING SKILL BODY' },
    'od:deck:pitch': { id: 'od:deck:pitch', name: 'pitch', description: 'Pitch deck', mode: 'deck', body: 'DECK SKILL BODY' },
  };
  const designSystems: Record<string, { id: string; name: string; summary: string; body: string; craftSuggested: string[] }> = {
    acme: { id: 'acme', name: 'Acme', summary: 'Acme brand', body: 'ACME DESIGN SYSTEM BODY', craftSuggested: [] },
  };
  return {
    getSkill: async (id: string) => skills[id],
    listSkills: async () => Object.values(skills),
    getDesignSystem: async (id: string) => designSystems[id],
    listDesignSystems: async () => Object.values(designSystems),
    craftSections: async () => [{ id: 'color', body: 'CRAFT COLOR' }],
  } as unknown as ContentIndex;
}

function memoryStore(initial?: string): ActiveDesignSystemStore {
  let value = initial;
  return {
    get: async () => value,
    set: async (id: string) => {
      value = id;
    },
    clear: async () => {
      value = undefined;
    },
  } as ActiveDesignSystemStore;
}

async function tempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-exploration-'));
}

async function registerDirection(workspaceRoot: string, entryPath: string, explorationId: string, directionId?: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(workspaceRoot, entryPath)), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, entryPath), `<!doctype html><h1>${directionId ?? 'full'}</h1>`);
  await writeArtifactManifest({
    workspaceRoot,
    entryPath,
    artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: directionId ?? 'Full', explorationId, directionId },
  });
}

function ctxFor(workspaceRoot: string | undefined, activeDesignSystem?: string): ExplorationToolContext {
  return { contentIndex: fakeContentIndex(), store: memoryStore(activeDesignSystem), workspaceRoot, outputDir: OUT };
}

describe('explorations', () => {
  describe('resolveExplorationDirections', () => {
    it('defaults to 3 visual directions in the fixed order with no design system', () => {
      const r = resolveExplorationDirections({ hasActiveDesignSystem: false, skillMode: 'prototype' });
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.strictEqual(r.axis, 'visual');
      assert.deepStrictEqual(
        r.directions.map((d) => d.id),
        ['modern-minimal', 'human-approachable', 'tech-utility'],
      );
      assert.strictEqual(r.designSystemSetAside, false);
    });

    it('defaults to the structural axis when a design system is active', () => {
      const r = resolveExplorationDirections({ hasActiveDesignSystem: true, skillMode: 'prototype' });
      assert.ok(r.ok && r.axis === 'structure' && r.directions[0].id === 'classic-hero-grid');
    });

    it('uses deck narrative arcs for structural deck explorations', () => {
      const r = resolveExplorationDirections({ hasActiveDesignSystem: true, skillMode: 'deck', count: 2 });
      assert.ok(r.ok);
      if (r.ok) assert.deepStrictEqual(r.directions.map((d) => d.id), ['problem-solution', 'narrative-journey']);
    });

    it('flags the design system as set aside for an explicit visual axis', () => {
      const r = resolveExplorationDirections({ hasActiveDesignSystem: true, skillMode: 'prototype', axis: 'visual' });
      assert.ok(r.ok && r.designSystemSetAside);
    });

    it('honours directionIds in order', () => {
      const r = resolveExplorationDirections({ hasActiveDesignSystem: false, skillMode: 'prototype', directionIds: ['brutalist-experimental', 'editorial-monocle'] });
      assert.ok(r.ok);
      if (r.ok) assert.deepStrictEqual(r.directions.map((d) => d.id), ['brutalist-experimental', 'editorial-monocle']);
    });

    it('builds custom directions with slug ids', () => {
      const r = resolveExplorationDirections({
        hasActiveDesignSystem: false,
        skillMode: 'prototype',
        customDirections: [
          { label: 'Video hero', brief: 'A looping product video fills the hero.' },
          { label: 'Quote hero', brief: 'A customer quote is the hero.' },
        ],
      });
      assert.ok(r.ok && r.axis === 'custom');
      if (r.ok) assert.deepStrictEqual(r.directions.map((d) => d.id), ['video-hero', 'quote-hero']);
    });

    for (const [name, input, pattern] of [
      ['count too high', { count: 5 }, /2–4/],
      ['count too low', { count: 1 }, /2–4/],
      ['unknown axis', { axis: 'colour' }, /Unknown axis/],
      ['unknown direction id', { directionIds: ['modern-minimal', 'nope'] }, /Unknown visual direction/],
      ['repeated direction ids', { directionIds: ['modern-minimal', 'modern-minimal'] }, /must not repeat/],
      ['custom without directions', { axis: 'custom' }, /needs customDirections/],
      [
        'repeated custom labels',
        { customDirections: [{ label: 'A', brief: 'x' }, { label: 'a', brief: 'y' }] },
        /distinct/,
      ],
      ['count mismatch', { count: 3, directionIds: ['modern-minimal', 'tech-utility'] }, /doesn't match/],
    ] as const) {
      it(`rejects ${name}`, () => {
        const r = resolveExplorationDirections({ hasActiveDesignSystem: false, skillMode: 'prototype', ...(input as object) });
        assert.ok(!r.ok);
        if (!r.ok) assert.match(r.error, pattern);
      });
    }
  });

  describe('composeInstructions with an exploration context', () => {
    it('names siblings, sketch fidelity and the register ids, and drops the generic output section', () => {
      const r = resolveExplorationDirections({ hasActiveDesignSystem: false, skillMode: 'prototype' });
      assert.ok(r.ok);
      if (!r.ok) return;
      const [d, ...others] = r.directions;
      const text = composeInstructions({
        skillName: 'landing',
        skillBody: 'BODY',
        brief: 'A landing page',
        suggestedEntryPath: '.open-design/x/modern-minimal.html',
        explorationContext: {
          explorationId: 'x',
          explorationTitle: 'X',
          direction: d,
          siblings: others.map((o) => ({ id: o.id, label: o.label })),
          index: 1,
          total: 3,
          fidelity: 'sketch',
          skillMode: 'prototype',
        },
      });
      for (const o of others) assert.ok(text.includes(o.label), `missing sibling ${o.label}`);
      assert.ok(text.includes(sketchFidelityText('prototype')));
      assert.match(text, /directionId `modern-minimal`/);
      assert.ok(!text.includes('Semantic output file names'));
    });

    it('describes deck sketches as a cover plus two slides', () => {
      assert.match(sketchFidelityText('deck'), /cover slide plus two content slides/);
    });
  });

  describe('plan store', () => {
    it('derives a title and allocates suffixed ids on collision', async () => {
      const ws = await tempWorkspace();
      assert.strictEqual(explorationTitleFromBrief('Pricing page\nmore detail'), 'Pricing page');
      assert.strictEqual(await allocateExplorationId(ws, OUT, 'Pricing page'), 'pricing-page');
      await fs.mkdir(path.join(ws, OUT, 'pricing-page'), { recursive: true });
      assert.strictEqual(await allocateExplorationId(ws, OUT, 'Pricing page'), 'pricing-page-2');
    });

    it('round-trips a plan and rejects path-like ids', async () => {
      const ws = await tempWorkspace();
      const plan: ExplorationPlan = {
        version: 1,
        explorationId: 'demo',
        title: 'Demo',
        brief: 'Demo brief',
        skillId: 'od:prototype:landing',
        skillMode: 'prototype',
        axis: 'visual',
        createdAt: new Date().toISOString(),
        directions: [],
      };
      await writeExplorationPlan(ws, OUT, plan);
      assert.deepStrictEqual(await readExplorationPlan(ws, OUT, 'demo'), plan);
      assert.strictEqual(await readExplorationPlan(ws, OUT, '../demo'), undefined);
      await assert.rejects(writeExplorationPlan(ws, OUT, { ...plan, explorationId: '../escape' }));
    });

    it('round-trips the exploration manifest fields', () => {
      const parsed = parsePersistedManifest(
        JSON.stringify({ version: 1, kind: 'html', renderer: 'html', exports: ['html'], entry: 'a.html', explorationId: 'demo', directionId: 'tech-utility' }),
        'a.html',
      );
      assert.strictEqual(parsed?.explorationId, 'demo');
      assert.strictEqual(parsed?.directionId, 'tech-utility');
    });
  });

  describe('comparison page', () => {
    const plan: ExplorationPlan = {
      version: 1,
      explorationId: 'demo',
      title: 'Demo <script>',
      brief: 'A & B',
      skillId: 'od:prototype:landing',
      skillMode: 'prototype',
      axis: 'visual',
      createdAt: '2026-10-03T00:00:00.000Z',
      directions: [
        { id: 'a', label: 'Alpha', axis: 'visual', summary: 'First', spec: '', entryPath: '.open-design/demo/a.html' },
        { id: 'b', label: 'Beta', axis: 'visual', summary: 'Second', spec: '', entryPath: '.open-design/demo/b.html' },
        { id: 'c', label: 'Gamma', axis: 'visual', summary: 'Third', spec: '', entryPath: '.open-design/demo/c.html' },
      ],
    };

    it('shows iframes for registered directions and a placeholder for missing ones, escaping text', () => {
      const html = renderExplorationCompareHtml(
        plan,
        [
          { entryPath: '.open-design/demo/a.html', title: 'A', directionId: 'a' },
          { entryPath: '.open-design/demo/b.html', title: 'B', directionId: 'b' },
        ],
        OUT,
      );
      assert.strictEqual((html.match(/<iframe /g) ?? []).length, 2);
      assert.match(html, /src="a\.html"/);
      assert.strictEqual((html.match(/Not generated yet/g) ?? []).length, 1);
      assert.ok(!html.includes('<script>'));
      assert.ok(html.includes('Demo &lt;script&gt;'));
      assert.ok(html.includes('A &amp; B'));
    });

    it('marks the chosen direction and lists built-out versions', () => {
      const html = renderExplorationCompareHtml(
        { ...plan, chosen: { directionId: 'b', next: 'build-out', chosenAt: 'now' } },
        [
          { entryPath: '.open-design/demo/b.html', title: 'B', directionId: 'b' },
          { entryPath: '.open-design/demo/b-full.html', title: 'Beta full' },
        ],
        OUT,
      );
      assert.match(html, /class="card chosen" data-direction="b"/);
      assert.match(html, /Built from this exploration/);
      assert.match(html, /href="b-full\.html"/);
    });

    it('returns a warning, not an error, when the plan is missing', async () => {
      const ws = await tempWorkspace();
      const r = await refreshExplorationCompare(ws, OUT, 'nope');
      assert.ok(!r.ok);
      if (!r.ok) assert.match(r.warning, /No exploration plan/);
    });
  });

  describe('tool round trip', () => {
    it('prepare → register × 3 → compare → choose (build-out)', async () => {
      const ws = await tempWorkspace();
      const ctx = ctxFor(ws);
      const prepared = JSON.parse(await prepareExploration(ctx, { skillId: 'od:prototype:landing', brief: 'Landing page for a coffee app' }));
      assert.strictEqual(prepared.explorationId, 'landing-page-for-a-coffee-app');
      assert.strictEqual(prepared.directions.length, 3);
      assert.match(prepared.sharedInstructions, /LANDING SKILL BODY/);
      assert.ok(!prepared.sharedInstructions.includes('## Output'));
      assert.match(prepared.directions[0].instructions, /## Output/);
      assert.ok(await fs.stat(path.join(ws, prepared.comparePath)));

      for (const d of prepared.directions) await registerDirection(ws, d.suggestedEntryPath, prepared.explorationId, d.directionId);
      const compared = JSON.parse(await compareExploration(ctx, { explorationId: prepared.explorationId }));
      assert.deepStrictEqual(compared.missing, []);
      assert.strictEqual(compared.registered.length, 3);

      const chosen = JSON.parse(
        await chooseDirection(ctx, { explorationId: prepared.explorationId, directionId: 'tech-utility', next: 'build-out', notes: 'warmer copy' }),
      );
      assert.strictEqual(chosen.suggestedEntryPath, `${OUT}/${prepared.explorationId}/tech-utility-full.html`);
      assert.match(chosen.instructions, /full fidelity/);
      assert.match(chosen.instructions, /tech-utility\.html/);
      assert.match(chosen.instructions, /warmer copy/);
      const plan = await readExplorationPlan(ws, OUT, prepared.explorationId);
      assert.strictEqual(plan?.chosen?.directionId, 'tech-utility');
      const compareHtml = await fs.readFile(path.join(ws, chosen.comparePath), 'utf8');
      assert.match(compareHtml, /class="card chosen" data-direction="tech-utility"/);
    });

    it('applies the active design system on the structural axis and sets it aside on an explicit visual axis', async () => {
      const ws = await tempWorkspace();
      const structural = JSON.parse(await prepareExploration(ctxFor(ws, 'acme'), { skillId: 'od:prototype:landing', brief: 'Pricing page' }));
      assert.strictEqual(structural.axis, 'structure');
      assert.match(structural.sharedInstructions, /ACME DESIGN SYSTEM BODY/);

      const visual = JSON.parse(await prepareExploration(ctxFor(ws, 'acme'), { skillId: 'od:prototype:landing', brief: 'Pricing page', axis: 'visual' }));
      assert.strictEqual(visual.explorationId, 'pricing-page-2');
      assert.ok(!visual.sharedInstructions.includes('ACME DESIGN SYSTEM BODY'));
      assert.match(visual.designSystemSetAside, /deliberately NOT applied/);
    });

    it('rejects choosing an unregistered direction and invalid merges without changing the plan', async () => {
      const ws = await tempWorkspace();
      const ctx = ctxFor(ws);
      const prepared = JSON.parse(await prepareExploration(ctx, { skillId: 'od:prototype:landing', brief: 'Signup page' }));
      const id = prepared.explorationId;
      assert.match(await chooseDirection(ctx, { explorationId: id, directionId: 'modern-minimal', next: 'build-out' }), /hasn't been generated/);

      const [a, b] = prepared.directions;
      await registerDirection(ws, a.suggestedEntryPath, id, a.directionId);
      assert.match(await chooseDirection(ctx, { explorationId: id, directionId: a.directionId, next: 'merge' }), /needs mergeFrom/);
      assert.match(
        await chooseDirection(ctx, { explorationId: id, directionId: a.directionId, next: 'merge', mergeFrom: [{ directionId: b.directionId, aspect: 'hero' }] }),
        /hasn't been registered/,
      );
      assert.match(await chooseDirection(ctx, { explorationId: id, directionId: 'nope', next: 'build-out' }), /Unknown directionId/);
      assert.match(await chooseDirection(ctx, { explorationId: id, directionId: a.directionId, next: 'ship-it' }), /Unknown next/);
      assert.strictEqual((await readExplorationPlan(ws, OUT, id))?.chosen, undefined);
    });

    it('merge and save-design-system return their own instructions', async () => {
      const ws = await tempWorkspace();
      const ctx = ctxFor(ws);
      const prepared = JSON.parse(await prepareExploration(ctx, { skillId: 'od:prototype:landing', brief: 'About page', count: 2 }));
      const [a, b] = prepared.directions;
      await registerDirection(ws, a.suggestedEntryPath, prepared.explorationId, a.directionId);
      await registerDirection(ws, b.suggestedEntryPath, prepared.explorationId, b.directionId);

      const merged = JSON.parse(
        await chooseDirection(ctx, {
          explorationId: prepared.explorationId,
          directionId: a.directionId,
          next: 'merge',
          mergeFrom: [{ directionId: b.directionId, aspect: 'hero' }],
        }),
      );
      assert.strictEqual(merged.suggestedEntryPath, `${OUT}/${prepared.explorationId}/merged.html`);
      assert.match(merged.instructions, /\*\*hero\*\* from/);

      const saved = JSON.parse(await chooseDirection(ctx, { explorationId: prepared.explorationId, directionId: b.directionId, next: 'save-design-system' }));
      assert.strictEqual(saved.id, `user:${prepared.explorationId}-${b.directionId}`);
      assert.match(saved.instructions, /DESIGN\.md/);
      assert.match(saved.instructions, new RegExp(b.suggestedEntryPath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
    });

    it('lists explorations with their registered sketches and built-out versions', async () => {
      const ws = await tempWorkspace();
      const ctx = ctxFor(ws);
      const prepared = JSON.parse(await prepareExploration(ctx, { skillId: 'od:prototype:landing', brief: 'Gallery page', count: 2 }));
      const [a, b] = prepared.directions;
      await registerDirection(ws, b.suggestedEntryPath, prepared.explorationId, b.directionId);
      await registerDirection(ws, a.suggestedEntryPath, prepared.explorationId, a.directionId);
      await registerDirection(ws, `${OUT}/${prepared.explorationId}/${a.directionId}-full.html`, prepared.explorationId);
      await fs.mkdir(path.join(ws, OUT, 'not-an-exploration'), { recursive: true });

      const list = await listExplorations(ws, OUT);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].plan.explorationId, prepared.explorationId);
      assert.deepStrictEqual(
        list[0].artifacts.map((x) => x.directionId),
        [a.directionId, b.directionId, undefined],
      );
      assert.strictEqual(list[0].comparePath, prepared.comparePath);
      assert.deepStrictEqual(await listExplorations(ws, 'missing-dir'), []);
    });

    it('needs a workspace', async () => {
      assert.match(await prepareExploration(ctxFor(undefined), { skillId: 'od:prototype:landing', brief: 'x' }), /No workspace folder/);
    });
  });
});
