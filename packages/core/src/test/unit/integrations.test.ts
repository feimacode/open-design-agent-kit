import * as assert from 'node:assert';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import {
  agentFromClientName,
  formatIntegrations,
  INTEGRATION_AGENTS,
  INTEGRATION_CONSENT_RULES,
  parseIntegrationRegistry,
  renderInstall,
  resolveIntegrations,
  type IntegrationRegistry,
} from '../../integrations';

const ASSETS = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');

describe('integration registry', () => {
  let registry: IntegrationRegistry;
  before(async () => {
    registry = await new ContentIndex(ASSETS).getIntegrationRegistry();
  });
  const entry = (id: string) => {
    const e = registry.integrations.find((i) => i.id === id);
    assert.ok(e, id);
    return e;
  };

  it('loads the shipped entries', () => {
    const ids = registry.integrations.map((e) => e.id);
    for (const id of ['canva', 'figma', 'notion', 'google-drive', 'slack', 'buffer', 'metricool', 'x']) assert.ok(ids.includes(id), id);
    assert.strictEqual(entry('x').tier, 'official-platform');
    assert.strictEqual(entry('x').installable, false);
  });

  it('drops an entry with an unknown capability and names it', () => {
    const { registry: r, errors } = parseIntegrationRegistry({
      capabilities: { 'design.import': 'd' },
      integrations: [
        { id: 'bad', displayName: 'Bad', vendor: 'B', tier: 'official-service', installable: false, manualSetup: 'x', capabilities: { 'design.teleport': 'y' }, verifiedAt: '2026-10-10' },
      ],
    });
    assert.strictEqual(r.integrations.length, 0);
    assert.match(errors.join('\n'), /bad: unknown capability "design\.teleport"/);
  });

  it('puts the official X server before every aggregator for social.post on x', () => {
    const { providers } = resolveIntegrations(registry, { capability: 'social.post', platform: 'x' });
    assert.strictEqual(providers[0].id, 'x');
    assert.ok(providers.slice(1).every((p) => p.tier === 'aggregator'));
  });

  it('says to ask which service when several aggregators match', () => {
    const r = resolveIntegrations(registry, { capability: 'social.post', platform: 'instagram' });
    assert.deepStrictEqual(r.providers.map((p) => p.id), ['buffer', 'metricool']);
    assert.strictEqual(r.askWhichAggregator, true);
    assert.match(formatIntegrations(registry, { capability: 'social.post', platform: 'instagram' }, 'codex'), /ask the user which one they use/);
  });

  it('Buffer on Codex uses bearer_token_env_var and never a literal key', () => {
    const text = renderInstall(entry('buffer'), 'codex').steps.join('\n');
    assert.match(text, /codex mcp add buffer --url https:\/\/mcp\.buffer\.com\/mcp --bearer-token-env-var BUFFER_API_KEY/);
    assert.match(text, /Never ask for the key in chat/);
  });

  it('Buffer on Claude Code keeps the env var reference single-quoted', () => {
    const text = renderInstall(entry('buffer'), 'claude-code').steps.join('\n');
    assert.ok(text.includes("--header 'Authorization: Bearer ${BUFFER_API_KEY}'"), text);
  });

  it('Buffer on VS Code uses a password input, Cursor an env reference', () => {
    assert.match(renderInstall(entry('buffer'), 'vscode').steps.join('\n'), /"password": true[\s\S]*Bearer \$\{input:buffer-api-key\}/);
    assert.ok(renderInstall(entry('buffer'), 'cursor').steps.join('\n').includes('Bearer ${env:BUFFER_API_KEY}'));
  });

  it('Canva on Claude Code offers the claude.ai connector first, then a user-scope add', () => {
    const steps = renderInstall(entry('canva'), 'claude-code').steps;
    assert.match(steps[0], /claude\.ai\/customize\/connectors/);
    assert.ok(steps.some((s) => s.includes('claude mcp add --transport http --scope user canva https://mcp.canva.com/mcp')));
  });

  it('X is manual-only on every agent', () => {
    for (const agent of INTEGRATION_AGENTS) {
      const t = renderInstall(entry('x'), agent);
      assert.strictEqual(t.manualOnly, true);
      assert.ok(!t.steps.join('\n').match(/claude mcp add|codex mcp add|code --add-mcp/));
    }
  });

  it('no template targets a project-committed config file or carries a credential', () => {
    for (const e of registry.integrations) {
      for (const agent of INTEGRATION_AGENTS) {
        const text = renderInstall(e, agent).steps.join('\n');
        assert.ok(!/--scope (project|local)\b/.test(text), `${e.id}/${agent}`);
        assert.ok(!/(^|\s)\.vscode\/mcp\.json|(^|\s)\.mcp\.json/.test(text), `${e.id}/${agent}`);
        assert.ok(!/Bearer [A-Za-z0-9]{16,}/.test(text), `${e.id}/${agent}`);
      }
    }
  });

  it('every filtered result carries the consent rules; the catalog lists capabilities', () => {
    const text = formatIntegrations(registry, { integration: 'notion' }, 'generic');
    for (const rule of INTEGRATION_CONSENT_RULES) assert.ok(text.includes(rule), rule);
    assert.match(text, /only after the user says yes/);
    const cat = formatIntegrations(registry, {}, 'generic');
    assert.match(cat, /`design\.import`/);
    assert.match(cat, /\*\*Canva\*\*/);
  });

  it('rejects unknown filter values with the valid ones', () => {
    assert.match(formatIntegrations(registry, { capability: 'design.teleport' }, 'generic'), /Known: design\.import/);
    assert.match(formatIntegrations(registry, { agent: 'emacs', integration: 'canva' }, 'generic'), /Unknown agent "emacs"/);
  });

  it('maps MCP client names to agents', () => {
    assert.strictEqual(agentFromClientName('claude-code'), 'claude-code');
    assert.strictEqual(agentFromClientName('codex-mcp-client'), 'codex');
    assert.strictEqual(agentFromClientName('Visual Studio Code'), 'vscode');
    assert.strictEqual(agentFromClientName('Visual Studio Code - Insiders'), 'vscode');
    assert.strictEqual(agentFromClientName('Cursor'), 'cursor');
    assert.strictEqual(agentFromClientName('some-other-client'), 'generic');
    assert.strictEqual(agentFromClientName(undefined), 'generic');
  });

  it('gives VS Code hints in its naming scheme and Claude Code the connector form', () => {
    const vs = formatIntegrations(registry, { integration: 'canva' }, 'vscode');
    assert.match(vs, /`mcp_canva\*_\*`/);
    const cc = formatIntegrations(registry, { integration: 'canva' }, 'claude-code');
    assert.match(cc, /`mcp__claude_ai_Canva__\*`/);
  });
});
