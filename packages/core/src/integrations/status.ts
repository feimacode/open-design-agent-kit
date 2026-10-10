// Integration status for the integrations list (openspec add-integrations-list):
// three values only — connected (its tools are available), installed (it's
// configured but its tools aren't), not-installed — plus the purpose group
// and VS Code's native install link / mcp.json snippet for the setup view.
import type { IntegrationEntry } from './registry';
import { toolNameHints, type IntegrationAgent } from './render';

export type IntegrationStatus = 'connected' | 'installed' | 'not-installed';
export type IntegrationGroup = 'Design' | 'Docs & storage' | 'Team' | 'Social posting';
export const INTEGRATION_GROUPS: IntegrationGroup[] = ['Design', 'Docs & storage', 'Team', 'Social posting'];

/** The group an entry is listed under, from its first capability. */
export function integrationGroup(entry: IntegrationEntry): IntegrationGroup {
  const first = Object.keys(entry.capabilities)[0] ?? '';
  const area = first.split('.')[0];
  if (area === 'docs' || area === 'storage') return 'Docs & storage';
  if (area === 'team') return 'Team';
  if (area === 'social') return 'Social posting';
  return 'Design';
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function globToRegex(glob: string): RegExp {
  return new RegExp(`^${glob.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
}

/** Names an entry's server can go by: its suggested config name, id and claude.ai connector name. */
function serverSlugs(entry: IntegrationEntry): string[] {
  return [...new Set([entry.server?.suggestedName, entry.id, entry.claudeAiConnector].filter((s): s is string => !!s).map(normalize))];
}

/**
 * True when one of `toolNames` belongs to this integration on `agent`: it
 * matches the entry's hint patterns, or it ends with one of the entry's tool
 * names AND carries the server's name (so a generic `create_file` from some
 * other server doesn't make Google Drive look connected).
 */
export function matchesIntegrationTools(entry: IntegrationEntry, toolNames: readonly string[], agent: IntegrationAgent): boolean {
  const patterns = toolNameHints(entry, agent)
    .filter((h) => h.startsWith('mcp'))
    .map(globToRegex);
  const tools = Object.values(entry.capabilities).filter((t): t is string => !!t);
  const slugs = serverSlugs(entry);
  return toolNames.some((name) => {
    if (patterns.some((re) => re.test(name))) return true;
    const lower = name.toLowerCase();
    if (!tools.some((t) => lower.endsWith(t.toLowerCase()) && lower.length > t.length)) return false;
    const prefix = normalize(name.slice(0, name.length - tools.find((t) => lower.endsWith(t.toLowerCase()))!.length));
    return slugs.some((s) => prefix.includes(s));
  });
}

export interface ConfiguredServer {
  name: string;
  url?: string;
}

function urlKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

/** True when a configured MCP server is this integration: same URL host and path, or the same name. */
export function matchesConfiguredServer(entry: IntegrationEntry, server: ConfiguredServer): boolean {
  const mine = urlKey(entry.server?.url);
  const theirs = urlKey(server.url);
  if (mine && theirs) return mine === theirs;
  return serverSlugs(entry).includes(normalize(server.name));
}

export function integrationStatus(
  entry: IntegrationEntry,
  input: { toolNames: readonly string[]; configuredServers: readonly ConfiguredServer[]; agent: IntegrationAgent },
): IntegrationStatus {
  if (matchesIntegrationTools(entry, input.toolNames, input.agent)) return 'connected';
  if (input.configuredServers.some((s) => matchesConfiguredServer(entry, s))) return 'installed';
  return 'not-installed';
}

/** Whether an entry can be added on this agent by configuration (otherwise its manual setup applies). */
export function installableOn(entry: IntegrationEntry, agent: IntegrationAgent): boolean {
  if (!entry.installable || !entry.server || !entry.auth) return false;
  if (entry.auth.kind === 'claude-ai-only') return agent === 'claude-code';
  return true;
}

export interface VsCodeServerConfig {
  name: string;
  /** The server entry for mcp.json's `servers` map. */
  server: { type: 'http'; url: string; headers?: Record<string, string> };
  /** mcp.json `inputs`, for API keys (VS Code asks once and stores them securely). */
  inputs?: Array<{ id: string; type: 'promptString'; description: string; password: true }>;
}

/** VS Code's configuration for an installable entry, or undefined (manual-only, claude.ai-only). */
export function vscodeServerConfig(entry: IntegrationEntry): VsCodeServerConfig | undefined {
  if (!installableOn(entry, 'vscode') || !entry.server || !entry.auth) return undefined;
  const name = entry.server.suggestedName;
  if (entry.auth.kind === 'api-key-header' && entry.auth.envVar) {
    const id = `${name}-api-key`;
    const scheme = entry.auth.scheme ? `${entry.auth.scheme} ` : '';
    return {
      name,
      server: { type: 'http', url: entry.server.url, headers: { [entry.auth.header ?? 'Authorization']: `${scheme}\${input:${id}}` } },
      inputs: [{ id, type: 'promptString', description: `${entry.displayName} API key`, password: true }],
    };
  }
  return { name, server: { type: 'http', url: entry.server.url } };
}

/** A `vscode:mcp/install` link that opens VS Code's own install page for the entry, or undefined. */
export function vscodeInstallLink(entry: IntegrationEntry): string | undefined {
  const config = vscodeServerConfig(entry);
  if (!config) return undefined;
  const payload: Record<string, unknown> = { name: config.name, ...config.server };
  if (config.inputs) payload.inputs = config.inputs;
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}

/** The mcp.json snippet for adding the entry by hand (user configuration), or undefined. */
export function vscodeMcpSnippet(entry: IntegrationEntry): string | undefined {
  const config = vscodeServerConfig(entry);
  if (!config) return undefined;
  const json: Record<string, unknown> = {};
  if (config.inputs) json.inputs = config.inputs;
  json.servers = { [config.name]: config.server };
  return JSON.stringify(json, null, 2);
}
