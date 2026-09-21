import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CODEX_CONFIG_SNIPPET, ensureCodexMcpConfig, writeCodexSkills } from '../../codexSetup';

const GENERATED_MARKER = '<!-- generated:open-design-agent-kit -->';

async function makeAssetRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-codex-assets-'));
  await fs.mkdir(path.join(root, 'open-design'), { recursive: true });
  await fs.writeFile(path.join(root, 'open-design', 'SKILL.md'), `---\nname: open-design\n---\n\n${GENERATED_MARKER}\n\nOverview.\n`);
  await fs.mkdir(path.join(root, 'guizang-ppt', 'agents'), { recursive: true });
  await fs.writeFile(path.join(root, 'guizang-ppt', 'SKILL.md'), `---\nname: guizang-ppt\n---\n\n${GENERATED_MARKER}\n\nCurated.\n`);
  await fs.writeFile(path.join(root, 'guizang-ppt', 'agents', 'openai.yaml'), '# generated:open-design-agent-kit\npolicy:\n  allow_implicit_invocation: false\n');
  return root;
}

async function makeTargetPath(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-target-'));
}

describe('writeCodexSkills', () => {
  it('writes every skill, including sibling agents/openai.yaml sidecars', async () => {
    const target = await makeTargetPath();
    const { writtenCount } = await writeCodexSkills(target, await makeAssetRoot());
    assert.strictEqual(writtenCount, 2);
    const policy = await fs.readFile(path.join(target, '.agents', 'skills', 'guizang-ppt', 'agents', 'openai.yaml'), 'utf8');
    assert.match(policy, /allow_implicit_invocation: false/);
  });
});

describe('ensureCodexMcpConfig', () => {
  it('creates a fresh .codex/config.toml when none exists', async () => {
    const target = await makeTargetPath();
    const result = await ensureCodexMcpConfig(target);
    assert.strictEqual(result.outcome, 'created');
    const written = await fs.readFile(path.join(target, '.codex', 'config.toml'), 'utf8');
    assert.strictEqual(written, CODEX_CONFIG_SNIPPET);
  });

  it('never rewrites an existing config.toml, byte-for-byte', async () => {
    const target = await makeTargetPath();
    const configPath = path.join(target, '.codex', 'config.toml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    const original = '# my hand-written config\n[mcp_servers.other]\ncommand = "foo"\n';
    await fs.writeFile(configPath, original);

    const result = await ensureCodexMcpConfig(target);
    assert.strictEqual(result.outcome, 'needs-manual-edit');
    const stillThere = await fs.readFile(configPath, 'utf8');
    assert.strictEqual(stillThere, original, 'an existing config.toml must never be modified');
  });

  it('reports already-registered without rewriting, when open-design is already present', async () => {
    const target = await makeTargetPath();
    const configPath = path.join(target, '.codex', 'config.toml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    const original = '[mcp_servers.open-design]\ncommand = "npx"\nargs = ["-y", "@feimacode/open-design-agent-kit-mcp"]\n';
    await fs.writeFile(configPath, original);

    const result = await ensureCodexMcpConfig(target);
    assert.strictEqual(result.outcome, 'already-registered');
    const stillThere = await fs.readFile(configPath, 'utf8');
    assert.strictEqual(stillThere, original);
  });

  it('is idempotent: re-running after creating reports already-registered', async () => {
    const target = await makeTargetPath();
    await ensureCodexMcpConfig(target);
    const second = await ensureCodexMcpConfig(target);
    assert.strictEqual(second.outcome, 'already-registered');
  });
});
