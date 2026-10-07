import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentIndex, findBrowser } from '@feimacode/open-design-agent-kit-core';
import * as tools from '../../tools';
import type { ToolContext } from '../../tools';
import { createFileActiveDesignSystemStore } from '../../store';

async function makeAssetsFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcp-assets-'));

  await fs.mkdir(path.join(root, 'skills', 'landing-page'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', 'landing-page', 'SKILL.md'),
    ['---', 'name: landing-page', 'description: Build a landing page.', 'od:', '  mode: prototype', '---', '', 'Workflow body.'].join('\n'),
  );

  await fs.mkdir(path.join(root, 'design-systems', 'acme'), { recursive: true });
  await fs.writeFile(path.join(root, 'design-systems', 'acme', 'DESIGN.md'), '# Acme\n\nTokens here.');
  await fs.writeFile(
    path.join(root, 'design-systems', 'acme', 'manifest.json'),
    JSON.stringify({ id: 'acme', name: 'Acme', category: 'SaaS', description: 'A SaaS brand.' }),
  );

  await fs.mkdir(path.join(root, 'examples', 'holo-hero'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'examples', 'holo-hero', 'SKILL.md'),
    ['---', 'name: holo-hero', 'description: A holographic hero.', 'od:', '  mode: prototype', '---', '', 'Body.'].join('\n'),
  );
  await fs.writeFile(path.join(root, 'examples', 'holo-hero', 'example.html'), '<!doctype html><h1>Holo</h1>');
  await fs.writeFile(
    path.join(root, 'examples', 'holo-hero', 'open-design.json'),
    JSON.stringify({ od: { useCase: { query: { en: 'Build a holographic hero section.' } } } }),
  );

  await fs.mkdir(path.join(root, 'craft'), { recursive: true });

  return root;
}

async function makeContext(): Promise<ToolContext> {
  const assetsRoot = await makeAssetsFixture();
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcp-workspace-'));
  const contentIndex = new ContentIndex(assetsRoot);
  const store = createFileActiveDesignSystemStore(workspaceRoot);
  return { contentIndex, store, workspaceRoot, outputDir: '.open-design', assetsRoot };
}

describe('mcp-server tools', () => {
  it('listSkills returns the fixture catalog', async () => {
    const ctx = await makeContext();
    const result = (await tools.listSkills(ctx, {})) as Array<{ id: string }>;
    const ids = result.map((s) => s.id).sort();
    assert.deepStrictEqual(ids, ['od:prototype:holo-hero', 'od:prototype:landing-page']);
  });

  it('listSkills passes source and remixableOnly through to ContentIndex', async () => {
    const ctx = await makeContext();
    const examples = (await tools.listSkills(ctx, { source: 'example' })) as Array<{ source: string }>;
    assert.deepStrictEqual(examples.map((s) => s.source), ['example']);

    const remixable = (await tools.listSkills(ctx, { remixableOnly: true })) as Array<{ exampleArtifactPath?: string }>;
    assert.strictEqual(remixable.length, 1);
    assert.ok(remixable[0].exampleArtifactPath);
  });

  it('listRemixablePrompts returns exactly the remixable-example set with hyphenated names', async () => {
    const ctx = await makeContext();
    const prompts = await tools.listRemixablePrompts(ctx);
    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].name, 'od-prototype-holo-hero');
    assert.strictEqual(prompts[0].publicId, 'od:prototype:holo-hero');
    assert.strictEqual(prompts[0].examplePrompt, 'Build a holographic hero section.');
  });

  it('buildRemixPromptMessage names the tool and skillId explicitly, avoiding Skill-tool ambiguity', async () => {
    const ctx = await makeContext();
    const [prompt] = await tools.listRemixablePrompts(ctx);
    assert.strictEqual(
      tools.buildRemixPromptMessage(prompt),
      'Remix the Open Design example "holo-hero" — call the open-design MCP server\'s remix_open_design_example tool with skillId "od:prototype:holo-hero". Build a holographic hero section.',
    );
    // Regression guard for the live-observed bug: this phrasing must never read as an instruction to invoke Claude Code's own Skill tool.
    assert.ok(!/\bskill "/i.test(tools.buildRemixPromptMessage(prompt)), 'message must not contain the ambiguous `skill "<id>"` phrasing');
  });

  it('buildRemixPromptMessage omits the trailing brief when examplePrompt is absent', () => {
    const message = tools.buildRemixPromptMessage({ name: 'od-prototype-x', publicId: 'od:prototype:x', displayName: 'X' });
    assert.strictEqual(message, 'Remix the Open Design example "X" — call the open-design MCP server\'s remix_open_design_example tool with skillId "od:prototype:x".');
  });

  it('listDesignSystems marks the active one', async () => {
    const ctx = await makeContext();
    await ctx.store.set('acme');
    const result = (await tools.listDesignSystems(ctx, {})) as Array<{ id: string; active: boolean }>;
    const acme = result.find((d) => d.id === 'acme');
    assert.strictEqual(acme?.active, true);
  });

  it('prepareBrief composes instructions for a known skill and persists an explicit design system', async () => {
    const ctx = await makeContext();
    const raw = await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', designSystemId: 'acme', brief: 'A page for Acme' });
    const payload = JSON.parse(raw);
    assert.ok(payload.instructions.includes('Workflow body.'));
    assert.strictEqual(payload.designSystemId, 'acme');
    assert.strictEqual(await ctx.store.get(), 'acme', 'explicit designSystemId should become sticky');
  });

  it('prepareBrief reports an unknown skillId clearly', async () => {
    const ctx = await makeContext();
    const raw = await tools.prepareBrief(ctx, { skillId: 'nope', brief: 'anything' });
    assert.match(raw, /Unknown skillId "nope"/);
  });

  it('registerArtifact fails when the entry file does not exist yet', async () => {
    const ctx = await makeContext();
    const raw = await tools.registerArtifact(ctx, { entryPath: '.open-design/x/x.html', kind: 'html', title: 'X' });
    assert.match(raw, /Failed to register artifact/);
  });

  it('registerArtifact writes a manifest sidecar once the entry file exists', async () => {
    const ctx = await makeContext();
    const entryAbs = path.join(ctx.workspaceRoot, '.open-design', 'x', 'x.html');
    await fs.mkdir(path.dirname(entryAbs), { recursive: true });
    await fs.writeFile(entryAbs, '<!doctype html><h1>X</h1>');

    const raw = await tools.registerArtifact(ctx, { entryPath: '.open-design/x/x.html', kind: 'html', title: 'X' });
    assert.match(raw, /Artifact registered/);
    assert.match(raw, /no live preview editor/);

    const manifestRaw = await fs.readFile(`${entryAbs}.artifact.json`, 'utf8');
    assert.strictEqual(JSON.parse(manifestRaw).title, 'X');
  });

  it('runs an exploration round trip: prepare → register × N (refreshing compare.html) → compare → choose', async () => {
    const ctx = await makeContext();
    const prepared = JSON.parse(await tools.prepareExploration(ctx, { skillId: 'od:prototype:landing-page', brief: 'Bakery landing page', count: 2 }));
    assert.strictEqual(prepared.explorationId, 'bakery-landing-page');
    assert.strictEqual(prepared.directions.length, 2);

    let registered = '';
    for (const d of prepared.directions) {
      await fs.writeFile(path.join(ctx.workspaceRoot, d.suggestedEntryPath), '<!doctype html><h1>Sketch</h1>');
      registered = await tools.registerArtifact(ctx, {
        entryPath: d.suggestedEntryPath,
        kind: 'html',
        title: d.label,
        explorationId: prepared.explorationId,
        directionId: d.directionId,
      });
    }
    assert.match(registered, /comparison page updated/);
    assert.match(registered, /all registered/);
    const compareHtml = await fs.readFile(path.join(ctx.workspaceRoot, prepared.comparePath), 'utf8');
    assert.strictEqual((compareHtml.match(/<iframe /g) ?? []).length, 2);

    const compared = JSON.parse(await tools.compareExploration(ctx, { explorationId: prepared.explorationId }));
    assert.deepStrictEqual(compared.missing, []);

    const chosen = JSON.parse(
      await tools.chooseDirection(ctx, { explorationId: prepared.explorationId, directionId: prepared.directions[1].directionId, next: 'build-out' }),
    );
    assert.match(chosen.instructions, /Build out the chosen direction/);
  });

  it('registerArtifact warns, but still registers, for an unknown explorationId', async () => {
    const ctx = await makeContext();
    await fs.writeFile(path.join(ctx.workspaceRoot, 'a.html'), '<!doctype html>');
    const result = await tools.registerArtifact(ctx, { entryPath: 'a.html', kind: 'html', title: 'A', explorationId: 'nope', directionId: 'x' });
    assert.match(result, /Artifact registered/);
    assert.match(result, /Warning: No exploration plan/);
  });

  it('builds from sources: read → prepare with sources → register with a number check → stale detection', async () => {
    const ctx = await makeContext();
    await fs.writeFile(path.join(ctx.workspaceRoot, 'CHANGELOG.md'), '# v2.0\n\n- 14 new features\n- 230 bugs fixed\n');

    const read = JSON.parse(await tools.readSource(ctx, { path: 'CHANGELOG.md' }));
    assert.deepStrictEqual(read.sections.map((s: { heading: string }) => s.heading), ['v2.0']);
    assert.strictEqual(read.markdownPath, '.open-design/sources/changelog-md/source.md');

    const prepared = JSON.parse(await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'Release page', sources: ['CHANGELOG.md'] }));
    assert.match(prepared.instructions, /## Source material/);
    assert.match(prepared.instructions, /## Storyline first/);
    assert.strictEqual(prepared.outlinePath, '.open-design/release-page/outline.md');
    assert.match(await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'x', sources: ['nope.docx'] }), /Couldn't read source "nope\.docx"/);

    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', 'release-page'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, prepared.suggestedEntryPath), '<h1>14 features, 230 fixes, 99.9% uptime</h1>');
    const registered = await tools.registerArtifact(ctx, { entryPath: prepared.suggestedEntryPath, kind: 'html', title: 'Release', sources: ['CHANGELOG.md'] });
    assert.match(registered, /Sources recorded: CHANGELOG\.md/);
    assert.match(registered, /- 99\.9% — /);
    assert.match(registered, /"sha256": "[0-9a-f]{64}"/);

    assert.deepStrictEqual(JSON.parse(await tools.getArtifact(ctx, { entryPath: prepared.suggestedEntryPath })).staleSources, []);
    await fs.writeFile(path.join(ctx.workspaceRoot, 'CHANGELOG.md'), '# v2.1\n');
    assert.deepStrictEqual(JSON.parse(await tools.getArtifact(ctx, { entryPath: prepared.suggestedEntryPath })).staleSources, [
      { path: 'CHANGELOG.md', reason: 'changed' },
    ]);
  });

  it('getArtifact returns not-found for a missing entry', async () => {
    const ctx = await makeContext();
    const raw = await tools.getArtifact(ctx, { entryPath: 'nope.html' });
    assert.match(raw, /No artifact found/);
  });

  it('setActiveDesignSystemTool sets, clears, and rejects an unknown id', async () => {
    const ctx = await makeContext();
    assert.match(await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'acme' }), /set to "acme"/);
    assert.strictEqual(await ctx.store.get(), 'acme');
    assert.match(await tools.setActiveDesignSystemTool(ctx, {}), /Cleared/);
    assert.match(await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'nope' }), /Unknown designSystemId/);
  });

  it('remixExample copies the example artifact and registers it', async () => {
    const ctx = await makeContext();
    const raw = await tools.remixExample(ctx, { skillId: 'od:prototype:holo-hero' });
    const payload = JSON.parse(raw);
    assert.strictEqual(payload.entryPath, '.open-design/holo-hero/holo-hero.html');
    const written = await fs.readFile(path.join(ctx.workspaceRoot, payload.entryPath), 'utf8');
    assert.match(written, /Holo/);
  });

  it('remixExample fails clearly for a skill with no rendered artifact', async () => {
    const ctx = await makeContext();
    const raw = await tools.remixExample(ctx, { skillId: 'od:prototype:landing-page' });
    assert.match(raw, /has no remixable starting artifact/);
  });

  it('pullFigmaFrame reports clearly when no token is configured', async () => {
    const ctx = await makeContext();
    const raw = await tools.pullFigmaFrame(ctx, { figmaUrl: 'https://www.figma.com/design/abc123/File?node-id=1-2' });
    assert.match(raw, /No Figma access token configured/);
    assert.match(raw, /OPEN_DESIGN_FIGMA_TOKEN/);
  });

  it('pullFigmaFrame reports clearly for a non-Figma URL', async () => {
    const ctx = { ...(await makeContext()), figmaToken: 'fake-token' };
    const raw = await tools.pullFigmaFrame(ctx, { figmaUrl: 'https://example.com/nope' });
    assert.match(raw, /does not look like a Figma/);
  });

  it('pullFigmaFrame reports clearly when the URL has no node id', async () => {
    const ctx = { ...(await makeContext()), figmaToken: 'fake-token' };
    const raw = await tools.pullFigmaFrame(ctx, { figmaUrl: 'https://www.figma.com/design/abc123/File' });
    assert.match(raw, /no node id/);
  });

  it('prepareBrief requires screenRole when collectionId is given', async () => {
    const ctx = await makeContext();
    const raw = await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'Splash screen', collectionId: 'onboarding' });
    assert.match(raw, /screenRole is required/);
  });

  it('prepareBrief composes a collection-aware entry path and instructions for the first screen', async () => {
    const ctx = await makeContext();
    const raw = await tools.prepareBrief(ctx, {
      skillId: 'od:prototype:landing-page',
      brief: 'Splash screen',
      collectionId: 'onboarding',
      collectionName: 'Onboarding Flow',
      screenRole: 'splash',
      screenTotal: 2,
    });
    const payload = JSON.parse(raw);
    assert.strictEqual(payload.suggestedEntryPath, '.open-design/onboarding/splash.html');
    assert.match(payload.instructions, /Part of a design collection/);
    assert.match(payload.instructions, /screen 1 of 2/);
    assert.match(payload.instructions, /none yet — this is the first screen/);
  });

  it('registerArtifact and findCollectionArtifacts round-trip a two-screen collection in order', async () => {
    const ctx = await makeContext();
    for (const [entry, index, role] of [
      ['.open-design/onboarding/value-prop.html', 1, 'value-prop'],
      ['.open-design/onboarding/splash.html', 0, 'splash'],
    ] as const) {
      const abs = path.join(ctx.workspaceRoot, entry);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, `<!doctype html><h1>${role}</h1>`);
      await tools.registerArtifact(ctx, {
        entryPath: entry,
        kind: 'html',
        title: role,
        collectionId: 'onboarding',
        collectionName: 'Onboarding Flow',
        screenIndex: index,
        screenRole: role,
      });
    }

    const siblingsForNextCall = await tools.prepareBrief(ctx, {
      skillId: 'od:prototype:landing-page',
      brief: 'Checkout screen',
      collectionId: 'onboarding',
      collectionName: 'Onboarding Flow',
      screenRole: 'checkout',
    });
    const payload = JSON.parse(siblingsForNextCall);
    assert.match(payload.instructions, /screen 3 of 3/);
    assert.match(payload.instructions, /\*\*splash\*\* — "splash"/);
    assert.match(payload.instructions, /\*\*value-prop\*\* — "value-prop"/);
  });
});

describe('mcp-server local prompts', () => {
  it('lists local prompts from the assets prompts/ folder and renders the brief (or an ask-the-user fallback)', async () => {
    const ctx = await makeContext();
    await fs.mkdir(path.join(ctx.assetsRoot, 'prompts'), { recursive: true });
    await fs.writeFile(
      path.join(ctx.assetsRoot, 'prompts', 'social-post.md'),
      ['---', 'name: open-design-social-post', 'description: Design a social post', 'placeholder: What should the post say?', '---', '', 'Brief: {{brief}}'].join('\n'),
    );
    const [prompt] = await tools.listLocalPrompts(ctx);
    assert.strictEqual(prompt.name, 'open-design-social-post');
    assert.strictEqual(tools.buildLocalPromptMessage(prompt, 'X post for v2'), 'Brief: X post for v2');
    assert.strictEqual(tools.buildLocalPromptMessage(prompt, undefined), 'Brief: (none given yet — ask the user: "What should the post say?")');
  });

  it('exportArtifact reports a missing artifact without launching a browser', async () => {
    const ctx = await makeContext();
    const text = await tools.exportArtifact(ctx, { entryPath: '.open-design/nope/nope.html' });
    assert.match(text, /^Export failed \(not-found\)/);
  });
});

describe('mcp-server registration exports', () => {
  it('records the accurate export list for a deck', async () => {
    const ctx = await makeContext();
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', 'd'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, '.open-design', 'd', 'd.html'), '<div class="slide"></div>');
    await tools.registerArtifact(ctx, { entryPath: '.open-design/d/d.html', kind: 'deck', title: 'D' });
    const manifest = JSON.parse(await fs.readFile(path.join(ctx.workspaceRoot, '.open-design', 'd', 'd.html.artifact.json'), 'utf8'));
    assert.deepStrictEqual(manifest.exports, ['html', 'standalone', 'site', 'png', 'jpeg', 'pdf', 'pptx']);
  });
});

describe('mcp-server publishing', () => {
  async function registered(ctx: Awaited<ReturnType<typeof makeContext>>): Promise<string> {
    const entryPath = '.open-design/p/p.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', 'p'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entryPath), '<!doctype html><html><head></head><body><h1>Hi</h1></body></html>');
    await tools.registerArtifact(ctx, { entryPath, kind: 'html', title: 'Hi' });
    return entryPath;
  }

  it('exports a standalone file without a browser', async () => {
    const ctx = await makeContext();
    const entryPath = await registered(ctx);
    const text = await tools.exportArtifact(ctx, { entryPath, format: 'standalone' });
    assert.match(text, /^Exported a self-contained HTML file: \.open-design\/p\/exports\/p\.html/);
  });

  it('publishArtifact builds the bundle and returns staged instructions, then records the link', async () => {
    const ctx = await makeContext();
    const entryPath = await registered(ctx);
    const text = await tools.publishArtifact(ctx, { entryPath, provider: 'netlify-temporary' });
    assert.match(text, /## Stage 2 — confirm before anything goes online/);
    assert.match(text, /--allow-anonymous/);
    await fs.access(path.join(ctx.workspaceRoot, '.open-design', 'p', 'exports', 'site', 'index.html'));

    const recorded = await tools.publishArtifact(ctx, {
      entryPath,
      published: { provider: 'netlify-temporary', url: 'https://x.netlify.app', claimUrl: 'https://app.netlify.com/drop/x', expiresAt: '2030-01-01T00:00:00Z' },
    });
    assert.match(recorded, /^Recorded:/);
    const manifest = JSON.parse(await fs.readFile(path.join(ctx.workspaceRoot, `${entryPath}.artifact.json`), 'utf8'));
    assert.strictEqual(manifest.metadata.shares[0].url, 'https://x.netlify.app');
  });
});

describe('mcp-server image content', () => {
  it('maps a plain string to a single text item, as every other tool returns', () => {
    assert.deepStrictEqual(tools.toCallToolContent('done'), [{ type: 'text', text: 'done' }]);
  });

  it('puts the text first, then one base64 image item per image', () => {
    const content = tools.toCallToolContent({ text: 'findings', images: [{ data: Buffer.from([0xff, 0xd8, 0xff]), mime: 'image/jpeg' }] });
    assert.deepStrictEqual(content, [
      { type: 'text', text: 'findings' },
      { type: 'image', data: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), mimeType: 'image/jpeg' },
    ]);
  });
});

describe('check_open_design_artifact (real browser; skipped when none is installed)', function () {
  this.timeout(120000);
  before(async function () {
    if (!(await findBrowser()).ok) this.skip();
  });

  it('returns findings as text and screenshots as JPEG images, writing nothing', async () => {
    const ctx = await makeContext();
    const entryPath = '.open-design/landing/landing.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', 'landing'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entryPath), '<!doctype html><body style="margin:0"><h1>Hi</h1><table style="width:900px"><tr><td>x</td></tr></table></body>');
    await tools.registerArtifact(ctx, { entryPath, kind: 'html', title: 'Landing' });
    const out = await tools.checkArtifact(ctx, { entryPath });
    assert.match(out.text, /ERROR \[horizontal-scroll\] mobile:/);
    const content = tools.toCallToolContent(out);
    assert.strictEqual(content[0].type, 'text');
    assert.deepStrictEqual(content.slice(1).map((c) => (c.type === 'image' ? c.mimeType : c.type)), ['image/jpeg', 'image/jpeg']);
    assert.ok(!(await fs.readdir(path.join(ctx.workspaceRoot, '.open-design', 'landing'))).includes('exports'));
  });
});
