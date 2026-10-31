import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composePublishCanvaTemplateInstructions, ContentIndex, findBrowser, formatIntegrations, saveCheckRun, writeArtifactComments, writeArtifactManifest, writeCommentCrop } from '@feimacode/open-design-agent-kit-core';
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

    const remixable = (await tools.listSkills(ctx, { remixableOnly: true })) as Array<Record<string, unknown>>;
    assert.strictEqual(remixable.length, 1);
    assert.strictEqual(remixable[0].remixable, true);
    // A path-looking field sent agents searching the disk for the bundled file.
    assert.ok(!JSON.stringify(remixable).includes('example.html'));
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

  it('prepareBrief hints at the recommend tool only when no design system was used', async () => {
    const ctx = await makeContext();
    const without = JSON.parse(await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'A page' }));
    assert.match(without.designSystemHint, /recommend_open_design_design_systems/);
    const withOne = JSON.parse(await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', designSystemId: 'acme', brief: 'A page' }));
    assert.strictEqual(withOne.designSystemHint, undefined);
  });

  it('recommendDesignSystems ranks without changing the active design system', async () => {
    const ctx = await makeContext();
    const result = (await tools.recommendDesignSystems(ctx, { likeBrands: ['Acme'] })) as { recommendations: Array<{ id: string }>; activeDesignSystemId?: string };
    assert.strictEqual(result.recommendations[0].id, 'acme');
    assert.strictEqual(result.activeDesignSystemId, undefined);
    assert.strictEqual(await ctx.store.get(), undefined);
  });

  it('prepareBrief reports an unknown skillId clearly', async () => {
    const ctx = await makeContext();
    const raw = await tools.prepareBrief(ctx, { skillId: 'nope', brief: 'anything' });
    assert.match(raw, /Unknown skillId "nope"/);
  });

  it('carries answers and assumptions from the brief to metadata.brief, and refuses a seventh assumption', async () => {
    const ctx = await makeContext();
    const tooMany = await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'A poster', assumptions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    assert.match(tooMany, /Too many assumptions: 7 given, at most 6/);
    const prepared = JSON.parse(
      await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'A poster for our event', answers: { where: 'Printed' }, assumptions: ['dark theme'] }),
    );
    assert.match(prepared.instructions, /## Build to these decisions[\s\S]*- where: Printed\n- Assumed: dark theme/);
    assert.match(prepared.instructions, /pass `brief`/);
    const entryAbs = path.join(ctx.workspaceRoot, prepared.suggestedEntryPath);
    await fs.mkdir(path.dirname(entryAbs), { recursive: true });
    await fs.writeFile(entryAbs, '<!doctype html><h1>Event</h1>');
    const brief = { text: 'A poster for our event', answers: { where: 'Printed' }, assumptions: ['dark theme'] };
    await tools.registerArtifact(ctx, { entryPath: prepared.suggestedEntryPath, kind: 'html', title: 'Event', brief });
    assert.deepStrictEqual(JSON.parse(await fs.readFile(`${entryAbs}.artifact.json`, 'utf8')).metadata.brief, brief);
    await tools.registerArtifact(ctx, { entryPath: prepared.suggestedEntryPath, kind: 'html', title: 'Event' });
    assert.deepStrictEqual(JSON.parse(await fs.readFile(`${entryAbs}.artifact.json`, 'utf8')).metadata.brief, brief, 'an edit without brief keeps the record');
    assert.match(await tools.registerArtifact(ctx, { entryPath: prepared.suggestedEntryPath, kind: 'html', title: 'Event', brief: { text: 'x'.repeat(501) } }), /at most 500/);
  });

  it('records each registered design in history.json and lists recent ones in the next brief', async () => {
    const ctx = await makeContext();
    const page = (accent: string): string => `<!doctype html><style>:root{--bg:#111;--accent:${accent};--font-display:'Fraunces'}</style><section><h1>Hi</h1></section>`;
    for (const [name, accent] of [['one', '#ff5a1f'], ['two', '#22c55e']]) {
      const entryPath = `.open-design/${name}/${name}.html`;
      await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', name), { recursive: true });
      await fs.writeFile(path.join(ctx.workspaceRoot, entryPath), page(accent));
      await tools.registerArtifact(ctx, { entryPath, kind: 'html', title: `Page ${name}` });
    }
    await tools.registerArtifact(ctx, { entryPath: '.open-design/one/one.html', kind: 'html', title: 'Page one' });
    const history = JSON.parse(await fs.readFile(path.join(ctx.workspaceRoot, '.open-design', 'history.json'), 'utf8'));
    assert.deepStrictEqual(history.entries.map((e: { title: string }) => e.title), ['Page two', 'Page one']);
    assert.strictEqual(history.entries[1].signature.accent, '#ff5a1f');

    const next = JSON.parse(await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'A third page' }));
    assert.match(next.instructions, /## Recent designs in this workspace\n\n- "Page one" \([0-9-]+\): dark theme, centred hero, display font Fraunces, accent #ff5a1f\n- "Page two"/);
    await fs.writeFile(path.join(ctx.workspaceRoot, '.open-design', 'config.json'), JSON.stringify({ variety: false }));
    const off = JSON.parse(await tools.prepareBrief(ctx, { skillId: 'od:prototype:landing-page', brief: 'A fourth page' }));
    assert.ok(!off.instructions.includes('Recent designs'));
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
    assert.match(raw, /open_open_design_preview/);
    assert.doesNotMatch(raw, /no live preview editor/);

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

    assert.deepStrictEqual(JSON.parse((await tools.getArtifact(ctx, { entryPath: prepared.suggestedEntryPath })).text).staleSources, []);
    await fs.writeFile(path.join(ctx.workspaceRoot, 'CHANGELOG.md'), '# v2.1\n');
    assert.deepStrictEqual(JSON.parse((await tools.getArtifact(ctx, { entryPath: prepared.suggestedEntryPath })).text).staleSources, [
      { path: 'CHANGELOG.md', reason: 'changed' },
    ]);
  });

  it('getArtifact returns not-found for a missing entry', async () => {
    const ctx = await makeContext();
    const raw = await tools.getArtifact(ctx, { entryPath: 'nope.html' });
    assert.match(raw.text, /No artifact found/);
  });

  it('getArtifact returns open and sent comments, and attaches up to 4 crops', async () => {
    const ctx = await makeContext();
    const entry = '.open-design/c/index.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design/c'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entry), '<h1>C</h1>');
    await tools.registerArtifact(ctx, { entryPath: entry, kind: 'html', title: 'C' });
    const comments = [];
    for (let i = 0; i < 6; i++) {
      const id = `c-${i}`;
      await writeCommentCrop(ctx.workspaceRoot, entry, id, Buffer.from(`png${i}`));
      comments.push({ id, selector: 'h1', htmlHint: '<h1>', note: `n${i}`, status: i === 5 ? 'resolved' : i === 4 ? 'sent' : 'open', createdAt: `2026-10-19T00:00:0${i}.000Z`, updatedAt: `2026-10-19T00:00:0${i}.000Z`, screenshot: `index.html.comments/${id}.png` } as const);
    }
    await writeArtifactComments(ctx.workspaceRoot, entry, [...comments]);
    const out = await tools.getArtifact(ctx, { entryPath: entry });
    const payload = JSON.parse(out.text);
    assert.deepStrictEqual(payload.openComments.map((c: { id: string }) => c.id), ['c-0', 'c-1', 'c-2', 'c-3', 'c-4']);
    assert.strictEqual(payload.openComments[4].status, 'sent');
    assert.strictEqual(payload.openComments[0].screenshot, '.open-design/c/index.html.comments/c-0.png');
    assert.deepStrictEqual(payload.commentScreenshotsAttached, ['c-4', 'c-3', 'c-2', 'c-1']);
    assert.deepStrictEqual(out.images?.map((i) => [String(i.data), i.mime]), [['png4', 'image/png'], ['png3', 'image/png'], ['png2', 'image/png'], ['png1', 'image/png']]);
    const content = tools.toCallToolContent(out);
    assert.strictEqual(content[0].type, 'text');
    assert.strictEqual(content.length, 5);
  });

  it('registerArtifact marks resolvedCommentIds resolved and reports unknown ids', async () => {
    const ctx = await makeContext();
    const entry = '.open-design/r/index.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design/r'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entry), '<h1>R</h1>');
    await writeArtifactComments(ctx.workspaceRoot, entry, [{ id: 'c-a', selector: 'h1', htmlHint: '<h1>', note: 'x', status: 'sent', createdAt: '2026-10-19T00:00:00.000Z', updatedAt: '2026-10-19T00:00:00.000Z' }]);
    const raw = await tools.registerArtifact(ctx, { entryPath: entry, kind: 'html', title: 'R', resolvedCommentIds: ['c-a', 'c-zz'] });
    assert.match(raw, /Marked 1 comment\(s\) resolved\. No comment with id c-zz\./);
    assert.deepStrictEqual(JSON.parse((await tools.getArtifact(ctx, { entryPath: entry })).text).openComments, []);
  });

  it('registerArtifact records a critique as metadata.critique and rejects an oversized one, leaving the manifest unchanged', async () => {
    const ctx = await makeContext();
    const entry = '.open-design/k/index.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design/k'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entry), '<h1>K</h1>');
    await saveCheckRun(ctx.workspaceRoot, ctx.outputDir, entry, { mode: 'page', findings: [], images: [{ label: 'desktop', data: Buffer.from('jpg'), width: 1, height: 1 }] });
    const raw = await tools.registerArtifact(ctx, {
      entryPath: entry,
      kind: 'html',
      title: 'K',
      designSystemId: 'acme',
      critique: { verdict: 'polish', findings: [{ area: 'copy', where: 'hero button', fix: 'Say "Start free trial"' }] },
    });
    assert.match(raw, /Recorded the critique \(Second look: polish, 1 fix\)/);
    const manifestPath = path.join(ctx.workspaceRoot, `${entry}.artifact.json`);
    const before = await fs.readFile(manifestPath, 'utf8');
    const critique = JSON.parse(before).metadata.critique;
    assert.strictEqual(critique.verdict, 'polish');
    assert.ok(critique.checkRunId, 'defaults to the latest check run');

    const long = 'x'.repeat(1000);
    const rejected = await tools.registerArtifact(ctx, { entryPath: entry, kind: 'html', title: 'Changed', critique: { verdict: 'polish', findings: Array(5).fill({ area: 'copy', problem: long, fix: long }) } });
    assert.match(rejected, /^Failed to register artifact: .*4 KB/);
    assert.strictEqual(await fs.readFile(manifestPath, 'utf8'), before);

    const input = await tools.getArtifact(ctx, { entryPath: entry, critique: true });
    const { critiqueInput } = JSON.parse(input.text.slice(input.text.indexOf('{')));
    assert.strictEqual(critiqueInput.designSystem.designMd.trim().startsWith('# Acme'), true);
    assert.strictEqual(critiqueInput.lastCritique.verdict, 'polish');
    assert.strictEqual(input.images?.length, 1);
  });

  it('getArtifact with critique asks for a check first when there is no saved run', async () => {
    const ctx = await makeContext();
    const entry = '.open-design/n/index.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design/n'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entry), '<h1>N</h1>');
    await tools.registerArtifact(ctx, { entryPath: entry, kind: 'html', title: 'N' });
    assert.match((await tools.getArtifact(ctx, { entryPath: entry, critique: true })).text, /call check_open_design_artifact first/);
  });

  it('openPreview refuses unregistered entries and honours OPEN_DESIGN_PREVIEW=off', async () => {
    const ctx = await makeContext();
    await fs.writeFile(path.join(ctx.workspaceRoot, 'loose.html'), '<p>x</p>');
    assert.match(await tools.openPreview(ctx, { entryPath: 'loose.html' }), /isn't registered yet/);
    const before = process.env.OPEN_DESIGN_PREVIEW;
    process.env.OPEN_DESIGN_PREVIEW = 'off';
    try {
      assert.match(await tools.openPreview(ctx, {}), /turned off/);
    } finally {
      if (before === undefined) delete process.env.OPEN_DESIGN_PREVIEW;
      else process.env.OPEN_DESIGN_PREVIEW = before;
    }
  });

  it('openPreview with open: false starts the server and returns the URL', async () => {
    const ctx = await makeContext();
    try {
      const text = await tools.openPreview(ctx, { open: false });
      assert.match(text, /wasn't opened\. Open this URL in a browser on this machine: http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\//);
      const url = /http:\/\/127\.0\.0\.1:\S+/.exec(text)![0];
      assert.strictEqual((await fetch(url)).status, 200);
    } finally {
      await tools.closePreviews();
    }
  });

  it('setActiveDesignSystemTool sets, clears, and rejects an unknown id', async () => {
    const ctx = await makeContext();
    assert.match(await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'acme' }), /set to "acme"/);
    assert.strictEqual(await ctx.store.get(), 'acme');
    assert.match(await tools.setActiveDesignSystemTool(ctx, {}), /Cleared/);
    assert.match(await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'nope' }), /Unknown designSystemId/);
  });

  it('setActiveDesignSystemTool writes a project DESIGN.md only when asked and only once (add-impeccable-interop)', async () => {
    const ctx = await makeContext();
    const designMd = path.join(ctx.workspaceRoot, 'DESIGN.md');
    await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'acme' });
    await assert.rejects(fs.access(designMd));
    assert.match(await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'acme', writeProjectDesignMd: true }), /Wrote DESIGN\.md/);
    const first = await fs.readFile(designMd, 'utf8');
    assert.match(first, /^---\nname: /);
    assert.match(await tools.setActiveDesignSystemTool(ctx, { designSystemId: 'acme', writeProjectDesignMd: true }), /Kept your existing DESIGN\.md/);
    assert.strictEqual(await fs.readFile(designMd, 'utf8'), first);
    assert.match(await tools.setActiveDesignSystemTool({ ...ctx, managedWorkspace: true }, { designSystemId: 'acme', writeProjectDesignMd: true }), /managed designs folder/);
  });

  it('prepareBrief adds PRODUCT.md context and a project DESIGN.md notice (add-impeccable-interop)', async () => {
    const ctx = await makeContext();
    await fs.writeFile(path.join(ctx.workspaceRoot, 'PRODUCT.md'), '## Users\n\nNeighbourhood café regulars.\n');
    await fs.writeFile(path.join(ctx.workspaceRoot, 'DESIGN.md'), '# Our look\n');
    const skillId = (await ctx.contentIndex.listSkills())[0].id;
    const payload = JSON.parse(await tools.prepareBrief(ctx, { skillId, brief: 'a poster' }));
    assert.match(payload.instructions, /## Product context[\s\S]*Neighbourhood café regulars\./);
    assert.match(payload.instructions, /## Project DESIGN\.md found/);
    const managed = JSON.parse(await tools.prepareBrief({ ...ctx, managedWorkspace: true }, { skillId, brief: 'a poster' }));
    assert.doesNotMatch(managed.instructions, /## Product context/);
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

  it('pullFigmaFrame works without a token: connector-first instructions, token as the fallback', async () => {
    const ctx = await makeContext();
    const raw = await tools.pullFigmaFrame(ctx, { figmaUrl: 'https://www.figma.com/design/abc123/File?node-id=1-2' });
    const { instructions, suggestedEntryPath } = JSON.parse(raw);
    assert.match(instructions, /`get_design_context`/);
    assert.match(instructions, /`fileKey: "abc123"` and `nodeId: "1:2"`/);
    assert.match(instructions, /OPEN_DESIGN_FIGMA_TOKEN/);
    assert.match(suggestedEntryPath, /figma\/frame-1-2\.html$/);
  });

  it('pullFigmaFrame reports clearly for a non-Figma URL', async () => {
    const ctx = { ...(await makeContext()), figmaToken: 'fake-token' };
    const raw = await tools.pullFigmaFrame(ctx, { figmaUrl: 'https://example.com/nope' });
    assert.match(raw, /does not look like a Figma/);
  });

  it('pullFigmaFrame reports clearly when the URL has no node id', async () => {
    const ctx = { ...(await makeContext()), figmaToken: 'fake-token' };
    const raw = await tools.pullFigmaFrame(ctx, { figmaUrl: 'https://www.figma.com/design/abc123/File' });
    assert.match(raw, /not a frame[\s\S]*Copy link to selection/);
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
    const { text } = await tools.publishArtifact(ctx, { entryPath, provider: 'netlify-temporary' });
    assert.match(text, /## Stage 2 — confirm before anything goes online/);
    assert.match(text, /--allow-anonymous/);
    await fs.access(path.join(ctx.workspaceRoot, '.open-design', 'p', 'exports', 'site', 'index.html'));

    const { text: recorded } = await tools.publishArtifact(ctx, {
      entryPath,
      published: { provider: 'netlify-temporary', url: 'https://x.netlify.app', claimUrl: 'https://app.netlify.com/drop/x', expiresAt: '2030-01-01T00:00:00Z' },
    });
    assert.match(recorded, /^Recorded:/);
    const manifest = JSON.parse(await fs.readFile(path.join(ctx.workspaceRoot, `${entryPath}.artifact.json`), 'utf8'));
    assert.strictEqual(manifest.metadata.shares[0].url, 'https://x.netlify.app');
  });
});

describe('mcp-server artifact preview hints', () => {
  async function write(ctx: ToolContext): Promise<string> {
    const entryPath = '.open-design/v/v.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', 'v'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entryPath), '<!doctype html><html><body><h1>V</h1></body></html>');
    return entryPath;
  }

  it('suggests the artifact preview to Claude clients only, until one is recorded', async () => {
    const claude = { ...(await makeContext()), clientName: 'claude-code' };
    const entryPath = await write(claude);
    assert.match(await tools.registerArtifact(claude, { entryPath, kind: 'html', title: 'V' }), /Artifact preview: .*provider "claude-artifact"/);

    const codex = { ...(await makeContext()), clientName: 'codex-mcp-client' };
    const codexEntry = await write(codex);
    assert.ok(!/Artifact preview/.test(await tools.registerArtifact(codex, { entryPath: codexEntry, kind: 'html', title: 'V' })));

    await tools.publishArtifact(claude, { entryPath, published: { provider: 'claude-artifact', url: 'https://claude.ai/artifact/abc' } });
    assert.ok(!/Artifact preview/.test(await tools.registerArtifact(claude, { entryPath, kind: 'html', title: 'V' })));
  });

  it('getArtifact returns the newest artifact link as previewUrl', async () => {
    const ctx = await makeContext();
    const entryPath = await write(ctx);
    await tools.registerArtifact(ctx, { entryPath, kind: 'html', title: 'V' });
    assert.strictEqual(JSON.parse((await tools.getArtifact(ctx, { entryPath })).text).previewUrl, undefined);
    await tools.publishArtifact(ctx, { entryPath, published: { provider: 'claude-artifact', url: 'https://claude.ai/artifact/abc' } });
    assert.strictEqual(JSON.parse((await tools.getArtifact(ctx, { entryPath })).text).previewUrl, 'https://claude.ai/artifact/abc');
  });

  it('keeps claude-only prompt text for MCP clients', async () => {
    const ctx = await makeContext();
    await fs.mkdir(path.join(ctx.assetsRoot, 'prompts'), { recursive: true });
    await fs.writeFile(
      path.join(ctx.assetsRoot, 'prompts', 'p.md'),
      ['---', 'name: p', 'description: P', '---', '', 'Brief: {{brief}}', '<!-- claude-only -->', 'Preview it.', '<!-- /claude-only -->', 'Done.'].join('\n'),
    );
    const [prompt] = await tools.listLocalPrompts(ctx);
    assert.match(tools.buildLocalPromptMessage(prompt, 'x'), /Preview it\./);
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

describe('list_open_design_integrations (shipped registry)', () => {
  const assetsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');
  const ctxFor = (clientName?: string): ToolContext => ({
    contentIndex: new ContentIndex(assetsRoot),
    store: createFileActiveDesignSystemStore(os.tmpdir()),
    workspaceRoot: os.tmpdir(),
    outputDir: '.open-design',
    assetsRoot,
    clientName,
  });

  it('infers the agent from the MCP client name', async () => {
    const codex = await tools.listIntegrations(ctxFor('codex-mcp-client'), { integration: 'canva' });
    assert.match(codex, /Install steps are for: \*\*codex\*\*/);
    assert.match(codex, /codex mcp add canva --url https:\/\/mcp\.canva\.com\/mcp/);
    const claude = await tools.listIntegrations(ctxFor('claude-code'), { integration: 'canva' });
    assert.match(claude, /claude\.ai\/customize\/connectors/);
    const desktop = await tools.listIntegrations(ctxFor('local-agent-mode-plugin:open-design:open-design'), { integration: 'canva' });
    assert.match(desktop, /Install steps are for: \*\*claude-desktop\*\*/);
    assert.match(desktop, /Settings > Connectors/);
    assert.ok(tools.isClaudeClient('local-agent-mode-plugin:open-design:open-design'));
    assert.ok(!tools.isClaudeClient('codex-mcp-client'));
    // ChatGPT desktop (add-chatgpt-desktop-plugin): its clients aren't Claude, so Claude-only handoffs stay out.
    assert.ok(!tools.isClaudeClient('openai-mcp'));
    assert.ok(!tools.isClaudeClient('chatgpt'));
  });

  it('falls back to generic for an unknown client, and an explicit agent wins', async () => {
    assert.match(await tools.listIntegrations(ctxFor('mystery-client'), { integration: 'notion' }), /\*\*generic\*\*/);
    assert.match(await tools.listIntegrations(ctxFor('claude-code'), { integration: 'notion', agent: 'cursor' }), /~\/\.cursor\/mcp\.json/);
  });

  it('returns exactly what the VS Code tool returns for the same input and agent', async () => {
    const input = { capability: 'social.post', platform: 'linkedin', agent: 'vscode' };
    const registry = await new ContentIndex(assetsRoot).getIntegrationRegistry();
    assert.strictEqual(await tools.listIntegrations(ctxFor('claude-code'), input), formatIntegrations(registry, input, 'vscode'));
  });
});

describe('publish_open_design_artifact_to_canva', () => {
  it('composes the connector-aware Canva flow from the artifact, like the VS Code tool', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcp-canva-'));
    const entryPath = '.open-design/poster/poster.html';
    await fs.mkdir(path.join(root, '.open-design/poster'), { recursive: true });
    await fs.writeFile(path.join(root, entryPath), '<!doctype html><h1>Poster</h1>');
    await writeArtifactManifest({
      workspaceRoot: root,
      entryPath,
      artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Poster', metadata: { format: 'a3' } },
    });
    const ctx = { workspaceRoot: root, outputDir: '.open-design' } as ToolContext;
    const text = await tools.publishToCanva(ctx, { entryPath });
    assert.match(text, /intended_design_type: "poster"/);
    assert.match(text, /list_open_design_integrations/);
    assert.strictEqual(
      text,
      composePublishCanvaTemplateInstructions({ artifactEntryPath: entryPath, artifactContent: '<!doctype html><h1>Poster</h1>', manifestTitle: 'Poster', manifestKind: 'html', manifestFormat: 'a3' }),
    );
    assert.match(await tools.publishToCanva(ctx, { entryPath: '.open-design/nope/nope.html' }), /No artifact found/);

    // Route B: the server sends the bytes, but only with both inputs and only to canva.com.
    assert.match(await tools.publishToCanva(ctx, { entryPath, uploadUrl: 'https://www.canva.com/_blob/upload' }), /needs both uploadUrl[\s\S]*Nothing was uploaded/);
    assert.match(
      await tools.publishToCanva(ctx, { entryPath, filePath: '.open-design/poster/exports/poster.pdf', uploadUrl: 'https://example.com/upload' }),
      /canva\.com URL[\s\S]*Nothing was uploaded/,
    );
  });
});

describe('push_open_design_artifact_to_figma', () => {
  it('reuses a fresh capture, writes the parts and returns the push instructions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcp-figma-'));
    const entryPath = '.open-design/card/card.html';
    await fs.mkdir(path.join(root, '.open-design/card'), { recursive: true });
    await fs.writeFile(path.join(root, entryPath), '<h1>Card</h1>');
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(
      path.join(root, `${entryPath}.od-figma.json`),
      JSON.stringify({ version: 1, source: { url: 'x', title: 'Card', capturedAt: 0, viewport: { width: 400, height: 300 }, dpr: 1 }, fonts: [], root: { type: 'FRAME', name: 'body', x: 0, y: 0, width: 400, height: 300, children: [] } }),
    );
    const text = await tools.pushToFigma({ workspaceRoot: root, outputDir: '.open-design' } as ToolContext, { entryPath });
    assert.match(text, /# Push/);
    assert.match(text, /part-01\.js/);
    await fs.access(path.join(root, '.open-design/card/exports/figma/manifest.json'));
  });
});

describe('prepare_open_design_component_library', () => {
  async function withDesign(pkg: unknown): Promise<ToolContext> {
    const ctx = await makeContext();
    await fs.writeFile(path.join(ctx.workspaceRoot, 'package.json'), JSON.stringify(pkg));
    const entryPath = '.open-design/p/p.html';
    await fs.mkdir(path.join(ctx.workspaceRoot, '.open-design', 'p'), { recursive: true });
    await fs.writeFile(path.join(ctx.workspaceRoot, entryPath), '<style>:root{--bg:#fff;--fg:#111;--accent:#2563eb}</style><body><div class="card"></div><div class="card"></div></body>');
    await writeArtifactManifest({ workspaceRoot: ctx.workspaceRoot, entryPath, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'P' } });
    return ctx;
  }

  it('returns instructions and writes no app code', async () => {
    const ctx = await withDesign({ dependencies: { react: '^19.0.0', '@mui/material': '^7.0.0' } });
    const text = await tools.prepareComponentLibrary(ctx, { entryPaths: ['.open-design/p/p.html'] });
    assert.match(text, /Material UI \(MUI\), themed to Material 3/);
    assert.match(text, /div\.card` ×2/);
    assert.deepStrictEqual((await fs.readdir(ctx.workspaceRoot)).sort(), ['.open-design', 'package.json']);
  });

  it('prefixes errors with their code', async () => {
    const ctx = await withDesign({ dependencies: { vue: '^3.0.0' } });
    assert.match(await tools.prepareComponentLibrary(ctx, { entryPaths: ['.open-design/p/p.html'] }), /^Component set not prepared \(unsupported-framework\)/);
    assert.match(await tools.prepareComponentLibrary(ctx, { entryPaths: ['.open-design/p/p.html'], library: 'vuetify' }), /^Component set not prepared \(unsupported-library\)/);
  });
});
