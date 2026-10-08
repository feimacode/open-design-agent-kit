import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ContentIndex } from '../../content/contentIndex';
import { findBrowser } from '../../export/browserDiscovery';
import { checkArtifact } from '../../export/checkArtifact';
import { resolveExplorationDirections } from '../../generation/explorationPlan';
import { chooseDirection, prepareExploration, type ExplorationToolContext } from '../../generation/explorationTools';
import { extractRootTokens, isStyleTileSkill, missingTileTokens, REQUIRED_TILE_TOKENS, tokensCssFromTile } from '../../generation/styleTiles';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import type { ActiveDesignSystemStore } from '../../workspace/activeDesignSystemStore';
import { renderExplorationCompareHtml } from '../../workspace/explorationCompare';
import type { ExplorationPlan } from '../../workspace/explorationStore';

const OUT = '.open-design';
const TILE_ID = 'od:design-system:style-tile';
const fullRoot = REQUIRED_TILE_TOKENS.map((t, i) => `  ${t}: v${i};`).join('\n');
const tileHtml = (root = fullRoot, extra = '') => `<!doctype html><html><head><style>:root {\n${root}\n  --accent: #1f5f8b;\n}\n@media (max-width: 500px) { :root { --text-4xl: 30px; } }${extra}</style></head><body><main data-od-style-tile><h1>Tile</h1></main></body></html>`;

function ctxFor(workspaceRoot: string, active?: string): ExplorationToolContext {
  const skills: Record<string, unknown> = {
    [TILE_ID]: { id: TILE_ID, name: 'Style Tile', description: 'tiles', mode: 'design-system', body: 'STYLE TILE SKILL BODY' },
  };
  const systems: Record<string, unknown> = {
    harbor: { id: 'harbor', name: 'Harbor', summary: 'calm', body: 'HARBOR BODY', craftSuggested: [], tokensCss: ':root { --accent: #1f5f8b; --bg: #f6f4ef; }' },
  };
  let value = active;
  const store = { get: async () => value, set: async (id: string) => void (value = id), clear: async () => void (value = undefined) } as unknown as ActiveDesignSystemStore;
  const contentIndex = {
    getSkill: async (id: string) => skills[id],
    listSkills: async () => Object.values(skills),
    getDesignSystem: async (id: string) => systems[id],
    listDesignSystems: async () => Object.values(systems),
    craftSections: async () => [],
  } as unknown as ContentIndex;
  return { contentIndex, store, workspaceRoot, outputDir: OUT };
}

describe('style tiles: tokens', () => {
  it('recognises the skill by bare or public id', () => {
    assert.ok(isStyleTileSkill('style-tile') && isStyleTileSkill(TILE_ID) && isStyleTileSkill('od:design-system:style-tile:example'));
    assert.ok(!isStyleTileSkill('od:prototype:landing') && !isStyleTileSkill(undefined));
  });

  it('reads base :root tokens only (not media overrides), and lists the required ones that are missing', () => {
    const tokens = extractRootTokens(tileHtml());
    assert.strictEqual(tokens.get('--accent'), '#1f5f8b', 'last declaration wins');
    assert.strictEqual(tokens.get('--text-4xl'), `v${REQUIRED_TILE_TOKENS.indexOf('--text-4xl')}`, 'the media-query :root is ignored');
    assert.deepStrictEqual(missingTileTokens(tokens), []);
    const partial = extractRootTokens(tileHtml(fullRoot.split('\n').filter((l) => !l.includes('--font-display')).join('\n')));
    assert.deepStrictEqual(missingTileTokens(partial), ['--font-display']);
  });

  it('writes tokens.css with contract tokens first, in schema order, then the rest', () => {
    const css = tokensCssFromTile(new Map([['--zz-brand', 'x'], ['--fg', '#111'], ['--bg', '#fff']]));
    assert.strictEqual(css, ':root {\n  --bg: #fff;\n  --fg: #111;\n  --zz-brand: x;\n}\n');
  });
});

describe('style tiles: explorations', () => {
  const base = { hasActiveDesignSystem: false, skillMode: 'design-system' as const, tileMode: true };

  it('defaults to 4 visual tiles, even with an active design system, and allows up to 6 custom ones', () => {
    const def = resolveExplorationDirections({ ...base, hasActiveDesignSystem: true });
    assert.ok(def.ok && def.axis === 'visual' && def.directions.length === 4);
    const six = resolveExplorationDirections({ ...base, axis: 'visual', count: 6 });
    assert.ok(!six.ok && /library has 5 directions.*customDirections/.test(six.error), JSON.stringify(six));
    const custom = resolveExplorationDirections({ ...base, customDirections: Array.from({ length: 6 }, (_, i) => ({ label: `Tile ${i + 1}`, brief: `brief ${i}` })) });
    assert.ok(custom.ok && custom.directions.length === 6);
    const seven = resolveExplorationDirections({ ...base, customDirections: Array.from({ length: 7 }, (_, i) => ({ label: `T${i}`, brief: 'b' })) });
    assert.ok(!seven.ok && /2–6/.test(seven.error));
    const structure = resolveExplorationDirections({ ...base, axis: 'structure' });
    assert.ok(!structure.ok && /vary color and type, not layout/.test(structure.error));
    const notTiles = resolveExplorationDirections({ hasActiveDesignSystem: false, skillMode: 'prototype', count: 5 });
    assert.ok(!notTiles.ok && /2–4/.test(notTiles.error), 'other skills keep the 2–4 range');
  });

  it('adds tile mode to the shared instructions, and evolves from the active system on the custom axis', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'od-tiles-'));
    const visual = JSON.parse(await prepareExploration(ctxFor(ws), { skillId: TILE_ID, brief: 'Fintech brand colors' }));
    assert.strictEqual(visual.directions.length, 4);
    assert.match(visual.sharedInstructions, /## Style tile mode/);
    assert.match(visual.sharedInstructions, /at least \*\*two\*\* of: accent hue family/);
    assert.match(visual.sharedInstructions, /`--font-display`/);
    assert.ok(!/Evolving/.test(visual.sharedInstructions));

    const evolve = JSON.parse(
      await prepareExploration(ctxFor(ws, 'harbor'), {
        skillId: TILE_ID,
        brief: 'Harbor, but warmer',
        axis: 'custom',
        customDirections: [{ label: 'Warm sand', brief: 'warmer neutrals' }, { label: 'Coral accent', brief: 'warmer accent' }],
      }),
    );
    assert.match(evolve.sharedInstructions, /### Evolving "Harbor"/);
    assert.match(evolve.sharedInstructions, /--accent: #1f5f8b; --bg: #f6f4ef;/);
    assert.match(evolve.sharedInstructions, /data-od-changed/);
  });

  it('lays tiles out side by side in taller frames on the comparison page', () => {
    const plan = { version: 1, explorationId: 'x', title: 'X', brief: 'b', skillId: TILE_ID, skillMode: 'design-system', axis: 'visual', createdAt: '', directions: ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id, axis: 'visual', summary: '', spec: '', entryPath: `${OUT}/x/${id}.html` })) } as unknown as ExplorationPlan;
    const html = renderExplorationCompareHtml(plan, [], OUT);
    assert.match(html, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(html, /aspect-ratio: 3 \/ 4/);
  });

  it('saves a chosen tile as a design system with its tokens verbatim, listing any missing ones', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'od-tiles-'));
    const ctx = ctxFor(ws);
    const prepared = JSON.parse(await prepareExploration(ctx, { skillId: TILE_ID, brief: 'Calm fintech' }));
    const d = prepared.directions[0];
    const root = fullRoot.split('\n').filter((l) => !l.includes('--tracking-display')).join('\n');
    await fs.mkdir(path.dirname(path.join(ws, d.suggestedEntryPath)), { recursive: true });
    await fs.writeFile(path.join(ws, d.suggestedEntryPath), tileHtml(root));
    await writeArtifactManifest({ workspaceRoot: ws, entryPath: d.suggestedEntryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: d.label, explorationId: prepared.explorationId, directionId: d.directionId } });
    const chosen = JSON.parse(await chooseDirection(ctx, { explorationId: prepared.explorationId, directionId: d.directionId, next: 'save-design-system' }));
    assert.match(chosen.instructions, /## Tokens from the chosen tile \(use these exactly\)/);
    assert.ok(chosen.instructions.includes(tokensCssFromTile(extractRootTokens(tileHtml(root)))), 'the exact tokens.css body is included');
    assert.match(chosen.instructions, /doesn't declare these required tokens.*`--tracking-display`/s);
  });
});

describe('style tiles: token-missing check (real browser; skipped when none is installed)', function () {
  this.timeout(60000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });

  it('reports each required token a tile leaves out, and nothing for a complete tile', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'od-tiles-check-'));
    const entry = '.open-design/t/t.html';
    await fs.mkdir(path.join(ws, '.open-design', 't'), { recursive: true });
    const root = fullRoot.split('\n').filter((l) => !/--font-display|--muted/.test(l)).join('\n');
    await fs.writeFile(path.join(ws, entry), tileHtml(root));
    await writeArtifactManifest({ workspaceRoot: ws, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'T', sourceSkillId: TILE_ID } });
    const r = await checkArtifact({ workspaceRoot: ws, entryPath: entry, browserPath, maxImages: 0, settleMs: 0 });
    assert.ok(r.ok);
    assert.deepStrictEqual(r.findings.filter((f) => f.check === 'token-missing').map((f) => f.selector).sort(), ['--font-display', '--muted']);
    await fs.writeFile(path.join(ws, entry), tileHtml());
    const ok = await checkArtifact({ workspaceRoot: ws, entryPath: entry, browserPath, maxImages: 0, settleMs: 0 });
    assert.ok(ok.ok && ok.findings.every((f) => f.check !== 'token-missing'));
  });
});
