import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentIndex } from '@feimacode/open-design-agent-kit-core';
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
});
