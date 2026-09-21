import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MalformedMcpJsonError, mergeClaudeMcpConfig, writeClaudeSkills } from '../../claudeSetup';

const GENERATED_MARKER = '<!-- generated:open-design-agent-kit -->';

async function makeAssetRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-claude-assets-'));
  await fs.mkdir(path.join(root, 'open-design'), { recursive: true });
  await fs.writeFile(path.join(root, 'open-design', 'SKILL.md'), `---\nname: open-design\n---\n\n${GENERATED_MARKER}\n\nOverview.\n`);
  await fs.mkdir(path.join(root, 'guizang-ppt'), { recursive: true });
  await fs.writeFile(path.join(root, 'guizang-ppt', 'SKILL.md'), `---\nname: guizang-ppt\n---\n\n${GENERATED_MARKER}\n\nCurated.\n`);
  return root;
}

async function makeTargetPath(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-target-'));
}

describe('writeClaudeSkills', () => {
  it('writes every skill from the asset root into .claude/skills/', async () => {
    const target = await makeTargetPath();
    const { writtenCount } = await writeClaudeSkills(target, await makeAssetRoot());
    assert.strictEqual(writtenCount, 2);
    const overview = await fs.readFile(path.join(target, '.claude', 'skills', 'open-design', 'SKILL.md'), 'utf8');
    assert.match(overview, /Overview\./);
  });

  it('removes a stale generated skill directory not present in the current asset root', async () => {
    const target = await makeTargetPath();
    const assetRoot1 = await makeAssetRoot();
    await fs.mkdir(path.join(assetRoot1, 'old-entry'), { recursive: true });
    await fs.writeFile(path.join(assetRoot1, 'old-entry', 'SKILL.md'), `---\nname: old-entry\n---\n\n${GENERATED_MARKER}\n\nOld.\n`);
    await writeClaudeSkills(target, assetRoot1);
    assert.ok(await fs.access(path.join(target, '.claude', 'skills', 'old-entry')).then(() => true, () => false));

    const assetRoot2 = await makeAssetRoot(); // no 'old-entry' this time
    await writeClaudeSkills(target, assetRoot2);
    assert.strictEqual(
      await fs.access(path.join(target, '.claude', 'skills', 'old-entry')).then(() => true, () => false),
      false,
      'a directory carrying our own generated marker, no longer in the source, should be removed',
    );
  });

  it('never deletes a hand-authored skill directory lacking the generated marker', async () => {
    const target = await makeTargetPath();
    await fs.mkdir(path.join(target, '.claude', 'skills', 'my-own-skill'), { recursive: true });
    await fs.writeFile(path.join(target, '.claude', 'skills', 'my-own-skill', 'SKILL.md'), '---\nname: my-own-skill\n---\n\nHand-written.\n');

    await writeClaudeSkills(target, await makeAssetRoot());

    const stillThere = await fs.readFile(path.join(target, '.claude', 'skills', 'my-own-skill', 'SKILL.md'), 'utf8');
    assert.match(stillThere, /Hand-written\./);
  });
});

describe('mergeClaudeMcpConfig', () => {
  it('creates a fresh .mcp.json when none exists', async () => {
    const target = await makeTargetPath();
    const { created } = await mergeClaudeMcpConfig(target);
    assert.strictEqual(created, true);
    const config = JSON.parse(await fs.readFile(path.join(target, '.mcp.json'), 'utf8'));
    assert.deepStrictEqual(config.mcpServers['open-design'], { command: 'npx', args: ['-y', '@feimacode/open-design-agent-kit-mcp'] });
  });

  it('preserves other existing MCP servers when merging', async () => {
    const target = await makeTargetPath();
    await fs.writeFile(
      path.join(target, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'some-other-server': { command: 'foo' } } }, null, 2),
    );

    const { created } = await mergeClaudeMcpConfig(target);
    assert.strictEqual(created, false);
    const config = JSON.parse(await fs.readFile(path.join(target, '.mcp.json'), 'utf8'));
    assert.deepStrictEqual(config.mcpServers['some-other-server'], { command: 'foo' });
    assert.ok(config.mcpServers['open-design']);
  });

  it('throws MalformedMcpJsonError on invalid existing JSON, without overwriting it', async () => {
    const target = await makeTargetPath();
    const mcpJsonPath = path.join(target, '.mcp.json');
    await fs.writeFile(mcpJsonPath, '{ not valid json');

    await assert.rejects(() => mergeClaudeMcpConfig(target), MalformedMcpJsonError);
    const stillBroken = await fs.readFile(mcpJsonPath, 'utf8');
    assert.strictEqual(stillBroken, '{ not valid json');
  });

  it('is idempotent across repeated runs', async () => {
    const target = await makeTargetPath();
    await mergeClaudeMcpConfig(target);
    await mergeClaudeMcpConfig(target);
    const config = JSON.parse(await fs.readFile(path.join(target, '.mcp.json'), 'utf8'));
    assert.strictEqual(Object.keys(config.mcpServers).length, 1);
  });
});
