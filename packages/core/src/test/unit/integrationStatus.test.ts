import * as assert from 'node:assert';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import {
  integrationGroup,
  integrationStatus,
  matchesConfiguredServer,
  matchesIntegrationTools,
  vscodeInstallLink,
  vscodeMcpSnippet,
  type IntegrationRegistry,
} from '../../integrations';

const ASSETS = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');

describe('integration status', () => {
  let registry: IntegrationRegistry;
  before(async () => {
    registry = await new ContentIndex(ASSETS).getIntegrationRegistry();
  });
  const e = (id: string) => registry.integrations.find((i) => i.id === id)!;

  it('groups by first capability', () => {
    assert.strictEqual(integrationGroup(e('canva')), 'Design');
    assert.strictEqual(integrationGroup(e('notion')), 'Docs & storage');
    assert.strictEqual(integrationGroup(e('google-drive')), 'Docs & storage');
    assert.strictEqual(integrationGroup(e('slack')), 'Team');
    assert.strictEqual(integrationGroup(e('buffer')), 'Social posting');
  });

  it('matches tools by each agent naming scheme', () => {
    assert.ok(matchesIntegrationTools(e('canva'), ['mcp__claude_ai_Canva__export-design'], 'claude-code'));
    assert.ok(matchesIntegrationTools(e('figma'), ['mcp_figma_get_design_context'], 'vscode'));
    assert.ok(matchesIntegrationTools(e('notion'), ['mcp__notion__notion-fetch'], 'codex'));
    assert.ok(matchesIntegrationTools(e('google-drive'), ['mcp_googledrive_search_files'], 'cursor'));
  });

  it('does not match look-alike tools from other servers', () => {
    assert.ok(!matchesIntegrationTools(e('google-drive'), ['mcp__filesystem__create_file', 'create_file'], 'claude-code'));
    assert.ok(!matchesIntegrationTools(e('canva'), ['mcp_other_export-design'], 'vscode'));
    assert.ok(!matchesIntegrationTools(e('figma'), ['mcp__claude_ai_Canva__help'], 'claude-code'));
  });

  it('matches configured servers by URL or name', () => {
    assert.ok(matchesConfiguredServer(e('notion'), { name: 'my-notes', url: 'https://mcp.notion.com/mcp/' }));
    assert.ok(!matchesConfiguredServer(e('notion'), { name: 'notion', url: 'https://example.com/mcp' }));
    assert.ok(matchesConfiguredServer(e('canva'), { name: 'Canva' }));
  });

  it('gives three statuses', () => {
    const base = { configuredServers: [{ name: 'x', url: 'https://mcp.notion.com/mcp' }], agent: 'vscode' as const };
    assert.strictEqual(integrationStatus(e('notion'), { ...base, toolNames: ['mcp_notion_notion-fetch'] }), 'connected');
    assert.strictEqual(integrationStatus(e('notion'), { ...base, toolNames: [] }), 'installed');
    assert.strictEqual(integrationStatus(e('slack'), { ...base, toolNames: [] }), 'not-installed');
  });

  it('builds the native install link and snippet; API keys only as password inputs', () => {
    const link = vscodeInstallLink(e('canva'))!;
    assert.ok(link.startsWith('vscode:mcp/install?'));
    assert.deepStrictEqual(JSON.parse(decodeURIComponent(link.slice('vscode:mcp/install?'.length))), { name: 'canva', type: 'http', url: 'https://mcp.canva.com/mcp' });
    const buffer = JSON.parse(decodeURIComponent(vscodeInstallLink(e('buffer'))!.slice('vscode:mcp/install?'.length)));
    assert.deepStrictEqual(buffer.inputs, [{ id: 'buffer-api-key', type: 'promptString', description: 'Buffer API key', password: true }]);
    assert.strictEqual(buffer.headers.Authorization, 'Bearer ${input:buffer-api-key}');
    assert.match(vscodeMcpSnippet(e('buffer'))!, /"password": true/);
  });

  it('gives no link for manual-only entries', () => {
    assert.strictEqual(vscodeInstallLink(e('x')), undefined);
    assert.strictEqual(vscodeMcpSnippet(e('x')), undefined);
  });
});
