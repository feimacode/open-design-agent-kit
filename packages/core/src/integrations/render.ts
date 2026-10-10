// Per-agent install steps and tool-name hints for registry entries (openspec
// add-integration-registry, D4). Everything here is text for the agent to show
// or run after the user says yes: nothing is executed and no secret value ever
// appears, only env var or secret-input references.
//
// Naming rules behind the hints (verified 2026-10-07):
//   Claude Code  mcp__claude_ai_<Connector>__<tool> (claude.ai connector) or mcp__<name>__<tool>
//   Codex        mcp__<name>__<tool>
//   VS Code      mcp_<server name, lowercased, max 13 chars>_<tool>
//   Cursor and other clients: unverified, so only "a tool named <tool>".
// Client names (MCP initialize, captured 2026-10-10): "claude-code",
// "codex-mcp-client", VS Code's product name ("Visual Studio Code"), Cursor
// assumed to contain "cursor".
import type { IntegrationEntry } from './registry';

export const INTEGRATION_AGENTS = ['claude-code', 'codex', 'vscode', 'cursor', 'generic'] as const;
export type IntegrationAgent = (typeof INTEGRATION_AGENTS)[number];

export function isIntegrationAgent(v: unknown): v is IntegrationAgent {
  return typeof v === 'string' && (INTEGRATION_AGENTS as readonly string[]).includes(v);
}

/** Maps the client name an MCP client sends in its initialize handshake to an agent. */
export function agentFromClientName(name: string | undefined): IntegrationAgent {
  const n = (name ?? '').toLowerCase();
  if (n.includes('claude-code') || n === 'claude code') return 'claude-code';
  if (n.includes('codex')) return 'codex';
  if (n.includes('cursor')) return 'cursor';
  if (n.includes('visual studio code') || n.includes('vscode')) return 'vscode';
  return 'generic';
}

/** Patterns the agent can look for in its own tool list (hints, not authority). */
export function toolNameHints(entry: IntegrationEntry, agent: IntegrationAgent): string[] {
  const tools = [...new Set(Object.values(entry.capabilities).filter((t): t is string => !!t))];
  const name = entry.server?.suggestedName ?? entry.id;
  const sample = tools[0];
  const hints: string[] = [];
  const connector = entry.claudeAiConnector?.replace(/[^A-Za-z0-9_-]+/g, '_');
  switch (agent) {
    case 'claude-code':
      if (connector) hints.push(`mcp__claude_ai_${connector}__*`);
      hints.push(`mcp__${name}__*`, `mcp__plugin_*_${name}__*`);
      break;
    case 'codex':
      hints.push(`mcp__${name}__*`);
      break;
    case 'vscode':
      hints.push(`mcp_${name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 13)}*_*`);
      break;
    default:
      break;
  }
  if (sample) hints.push(`any tool whose name ends with \`${sample}\``);
  else hints.push(`any ${entry.displayName} tool (match by its description)`);
  return hints;
}

export interface InstallTemplate {
  /** Markdown steps, in order. */
  steps: string[];
  /** True when there is nothing for the agent to run; the user follows the steps. */
  manualOnly: boolean;
}

const RELOAD = {
  'claude-code': 'New MCP servers load when a session starts: if the tools are not listed afterwards, ask the user to restart Claude Code or start a new session.',
  codex: 'Restart Codex (a new session) so it loads the server.',
  vscode: 'Start the server from the MCP Servers view (or run "MCP: List Servers" → Start); reload the window if its tools do not appear.',
  cursor: "Open Cursor Settings → MCP and make sure the server is enabled; restart Cursor if its tools do not appear.",
  generic: 'Restart the agent (or reload its MCP servers) so it loads the new server.',
} as const;

function verifyStep(entry: IntegrationEntry, agent: IntegrationAgent): string {
  return `Verify: list your tools and confirm one matches ${toolNameHints(entry, agent).map((h) => (h.startsWith('any ') ? h : `\`${h}\``)).join(' or ')}.`;
}

function secretSetup(entry: IntegrationEntry): string | undefined {
  const auth = entry.auth;
  if (auth?.kind !== 'api-key-header' || !auth.envVar) return undefined;
  return `Ask the user to create a ${entry.displayName} API key${auth.docsUrl ? ` (${auth.docsUrl})` : ''} and set it themselves as the environment variable \`${auth.envVar}\` in their shell profile, then restart the agent from that shell. Never ask for the key in chat and never write it into a file.`;
}

function headerValue(entry: IntegrationEntry, ref: string): string {
  const scheme = entry.auth?.scheme ? `${entry.auth.scheme} ` : '';
  return `${scheme}${ref}`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Install steps for one entry on one agent. */
export function renderInstall(entry: IntegrationEntry, agent: IntegrationAgent): InstallTemplate {
  const docs = entry.docsUrl ? ` Docs: ${entry.docsUrl}` : '';

  if (!entry.installable || !entry.server || !entry.auth) {
    return { steps: [entry.manualSetup ?? `Follow ${entry.vendor}'s setup instructions.${docs}`, verifyStep(entry, agent)], manualOnly: true };
  }

  const { url, suggestedName: name } = entry.server;
  const auth = entry.auth;
  const steps: string[] = [];
  const connectorStep = entry.claudeAiConnector
    ? `Connect **${entry.claudeAiConnector}** at https://claude.ai/customize/connectors (signed in with the same claude.ai account Claude Code uses). It then appears in every Claude app, including this session after a restart.`
    : undefined;

  if (auth.kind === 'claude-ai-only') {
    if (agent === 'claude-code' && connectorStep) return { steps: [connectorStep, RELOAD['claude-code'], verifyStep(entry, agent)], manualOnly: true };
    return { steps: [`${entry.displayName} is only available as a claude.ai connector; it can't be installed in this agent.${docs}`], manualOnly: true };
  }

  if (auth.kind === 'admin-enabled') {
    steps.push(`An admin of the user's ${entry.vendor} organization may need to enable MCP access first${auth.docsUrl ? ` (${auth.docsUrl})` : ''}.`);
  }

  const secret = secretSetup(entry);
  const envVar = auth.envVar;

  switch (agent) {
    case 'claude-code': {
      let runPrefix = 'Run';
      if (connectorStep && auth.kind !== 'api-key-header') {
        steps.push(`Preferred: ${connectorStep}`);
        if (auth.kind === 'own-oauth-client') {
          steps.push(`A local install instead needs the user's own OAuth client (${auth.docsUrl ?? entry.docsUrl ?? 'see the vendor docs'}); recommend the claude.ai connector unless the user isn't signed in with claude.ai.`);
          break;
        }
        runPrefix = 'Alternative, for this machine only: run';
      }
      if (secret) steps.push(secret);
      const header = auth.kind === 'api-key-header' && envVar ? ` --header '${auth.header ?? 'Authorization'}: ${headerValue(entry, `\${${envVar}}`)}'` : '';
      steps.push(`${runPrefix}: \`claude mcp add --transport http --scope user ${name} ${url}${header}\`${header ? ' (keep the single quotes: Claude Code stores the variable name and reads its value when it connects)' : ''}`);
      if (auth.kind !== 'api-key-header') steps.push(`Sign in: run \`/mcp\`, pick \`${name}\` and choose Authenticate; the user completes ${entry.vendor}'s sign-in in the browser.`);
      steps.push(RELOAD['claude-code']);
      break;
    }
    case 'codex': {
      if (secret) steps.push(secret);
      if (auth.kind === 'own-oauth-client') steps.push(`The user creates their own OAuth client first: ${auth.docsUrl ?? entry.docsUrl ?? 'see the vendor docs'}.`);
      const extra = auth.kind === 'api-key-header' && envVar ? ` --bearer-token-env-var ${envVar}` : auth.kind === 'own-oauth-client' ? ' --oauth-client-id <the user\'s client id>' : '';
      steps.push(`Run: \`codex mcp add ${name} --url ${url}${extra}\` (adds it to the user's ~/.codex/config.toml).`);
      if (auth.kind !== 'api-key-header') steps.push(`Sign in: run \`codex mcp login ${name}\`; the user completes ${entry.vendor}'s sign-in in the browser.`);
      steps.push(RELOAD.codex);
      break;
    }
    case 'vscode': {
      if (auth.kind === 'api-key-header' && envVar) {
        const inputId = `${name}-api-key`;
        steps.push(`Ask the user to run **MCP: Open User Configuration** and add this (VS Code asks for the key once and stores it securely; it is never written to the file):\n\`\`\`json\n${json({
          inputs: [{ id: inputId, type: 'promptString', description: `${entry.displayName} API key`, password: true }],
          servers: { [name]: { type: 'http', url, headers: { [auth.header ?? 'Authorization']: headerValue(entry, `\${input:${inputId}}`) } } },
        })}\n\`\`\``);
      } else {
        if (auth.kind === 'own-oauth-client') steps.push(`The user creates their own OAuth client first: ${auth.docsUrl ?? entry.docsUrl ?? 'see the vendor docs'}; VS Code asks for the client id when it signs in.`);
        steps.push(`Run: \`code --add-mcp '${JSON.stringify({ name, type: 'http', url })}'\` (adds it to the user profile). If \`code\` isn't on PATH, the user can run **MCP: Add Server** → HTTP and paste \`${url}\` with the name \`${name}\`, choosing Global.`);
        steps.push(`Sign in: VS Code prompts for ${entry.vendor}'s sign-in the first time the server starts.`);
      }
      steps.push(RELOAD.vscode);
      break;
    }
    case 'cursor': {
      if (secret) steps.push(secret);
      if (auth.kind === 'own-oauth-client') steps.push(`The user creates their own OAuth client first: ${auth.docsUrl ?? entry.docsUrl ?? 'see the vendor docs'}.`);
      const server: Record<string, unknown> = { url };
      if (auth.kind === 'api-key-header' && envVar) server.headers = { [auth.header ?? 'Authorization']: headerValue(entry, `\${env:${envVar}}`) };
      steps.push(`Add this entry to the user's \`~/.cursor/mcp.json\` (merge into an existing \`mcpServers\` object):\n\`\`\`json\n${json({ mcpServers: { [name]: server } })}\n\`\`\``);
      if (auth.kind !== 'api-key-header') steps.push(`Sign in: in Cursor Settings → MCP, select \`${name}\` and log in; the user completes ${entry.vendor}'s sign-in.`);
      steps.push(RELOAD.cursor);
      break;
    }
    default: {
      if (secret) steps.push(secret);
      const server: Record<string, unknown> = { type: 'http', url };
      if (auth.kind === 'api-key-header' && envVar) server.headers = { [auth.header ?? 'Authorization']: headerValue(entry, `<value of ${envVar}, using your client's env var syntax>`) };
      steps.push(`Add this server to the agent's user-level MCP configuration (not a file committed to the project):\n\`\`\`json\n${json({ mcpServers: { [name]: server } })}\n\`\`\``);
      if (auth.kind !== 'api-key-header') steps.push(`Sign in through the client's MCP settings; the user completes ${entry.vendor}'s sign-in.`);
      steps.push(RELOAD.generic);
      break;
    }
  }
  steps.push(verifyStep(entry, agent));
  return { steps, manualOnly: false };
}
