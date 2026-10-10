// Trusted third-party MCP servers (openspec add-integration-registry). The
// data is content (packages/content/local/integrations.json, copied to the
// assets root); this module types it, drops malformed entries and resolves
// providers in priority order. The build guard
// (packages/content/scripts/integrations.mjs) mirrors TIERS, AUTH_KINDS and
// PLATFORMS: keep the two in step. The capability vocabulary lives in the
// JSON itself, so both sides read it from one place.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const INTEGRATION_TIERS = ['official-platform', 'official-service', 'aggregator'] as const;
export const INTEGRATION_AUTH_KINDS = ['oauth-dcr', 'api-key-header', 'own-oauth-client', 'admin-enabled', 'claude-ai-only'] as const;
export const SOCIAL_PLATFORMS = ['x', 'linkedin', 'instagram', 'facebook', 'threads', 'tiktok', 'youtube', 'pinterest', 'bluesky', 'mastodon'] as const;

export type IntegrationTier = (typeof INTEGRATION_TIERS)[number];
export type IntegrationAuthKind = (typeof INTEGRATION_AUTH_KINDS)[number];

export interface IntegrationAuth {
  kind: IntegrationAuthKind;
  /** api-key-header: the env var the user sets themselves, e.g. BUFFER_API_KEY. */
  envVar?: string;
  header?: string;
  /** e.g. "Bearer"; prefixed to the key in the header value. */
  scheme?: string;
  docsUrl?: string;
}

export interface IntegrationEntry {
  id: string;
  displayName: string;
  vendor: string;
  tier: IntegrationTier;
  platforms: string[];
  /** Capability key → the server's own (bare) tool name, or null when not verified. */
  capabilities: Record<string, string | null>;
  server?: { transport: 'http'; url: string; suggestedName: string };
  auth?: IntegrationAuth;
  /** The connector's name in claude.ai's directory, when it has one. */
  claudeAiConnector?: string;
  installable: boolean;
  manualSetup?: string;
  /** How to finish the step without this integration (shown in lookups, the list and the setup view). */
  manualFallback: string;
  caveats: string[];
  docsUrl?: string;
  /** Wording for the generated integration docs tables. */
  docs?: { summary?: string; signIn?: string; notes?: string };
  verifiedAt: string;
  toolsVerified: boolean;
}

export interface IntegrationRegistry {
  /** Capability key → what it means. */
  capabilities: Record<string, string>;
  integrations: IntegrationEntry[];
}

export const EMPTY_INTEGRATION_REGISTRY: IntegrationRegistry = { capabilities: {}, integrations: [] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Types a parsed integrations.json. Malformed entries are dropped and named in
 * `errors` rather than thrown: a bad entry must not take the rest down at
 * runtime (the content check is where it fails the build).
 */
export function parseIntegrationRegistry(raw: unknown): { registry: IntegrationRegistry; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { registry: EMPTY_INTEGRATION_REGISTRY, errors: ['integrations.json must be an object'] };
  const capabilities: Record<string, string> = {};
  if (isRecord(raw.capabilities)) {
    for (const [k, v] of Object.entries(raw.capabilities)) if (typeof v === 'string') capabilities[k] = v;
  }
  const integrations: IntegrationEntry[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.integrations) ? raw.integrations : []) {
    if (!isRecord(item) || typeof item.id !== 'string') {
      errors.push('an integration has no id');
      continue;
    }
    const id = item.id;
    const problem = entryProblem(item, capabilities);
    if (problem) {
      errors.push(`${id}: ${problem}`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${id}: id used twice`);
      continue;
    }
    seen.add(id);
    const caps: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(item.capabilities as Record<string, unknown>)) caps[k] = typeof v === 'string' ? v : null;
    const server = isRecord(item.server)
      ? { transport: 'http' as const, url: String(item.server.url), suggestedName: String(item.server.suggestedName) }
      : undefined;
    const auth = isRecord(item.auth)
      ? {
          kind: item.auth.kind as IntegrationAuthKind,
          envVar: typeof item.auth.envVar === 'string' ? item.auth.envVar : undefined,
          header: typeof item.auth.header === 'string' ? item.auth.header : undefined,
          scheme: typeof item.auth.scheme === 'string' ? item.auth.scheme : undefined,
          docsUrl: typeof item.auth.docsUrl === 'string' ? item.auth.docsUrl : undefined,
        }
      : undefined;
    integrations.push({
      id,
      displayName: String(item.displayName),
      vendor: String(item.vendor),
      tier: item.tier as IntegrationTier,
      platforms: strings(item.platforms),
      capabilities: caps,
      server,
      auth,
      claudeAiConnector: typeof item.claudeAiConnector === 'string' ? item.claudeAiConnector : undefined,
      installable: item.installable === true,
      manualSetup: typeof item.manualSetup === 'string' ? item.manualSetup : undefined,
      manualFallback: String(item.manualFallback),
      caveats: strings(item.caveats),
      docsUrl: typeof item.docsUrl === 'string' ? item.docsUrl : undefined,
      docs: isRecord(item.docs)
        ? {
            summary: typeof item.docs.summary === 'string' ? item.docs.summary : undefined,
            signIn: typeof item.docs.signIn === 'string' ? item.docs.signIn : undefined,
            notes: typeof item.docs.notes === 'string' ? item.docs.notes : undefined,
          }
        : undefined,
      verifiedAt: String(item.verifiedAt),
      toolsVerified: item.toolsVerified === true,
    });
  }
  return { registry: { capabilities, integrations }, errors };
}

function entryProblem(e: Record<string, unknown>, vocabulary: Record<string, string>): string | undefined {
  if (typeof e.displayName !== 'string' || typeof e.vendor !== 'string') return 'needs a displayName and a vendor';
  if (!(INTEGRATION_TIERS as readonly string[]).includes(String(e.tier))) return `unknown tier "${String(e.tier)}"`;
  if (!isRecord(e.capabilities) || Object.keys(e.capabilities).length === 0) return 'needs at least one capability';
  if (typeof e.manualFallback !== 'string' || !e.manualFallback.trim()) return 'needs a manualFallback';
  for (const key of Object.keys(e.capabilities)) if (!(key in vocabulary)) return `unknown capability "${key}"`;
  if (e.installable === true) {
    if (!isRecord(e.server) || typeof e.server.url !== 'string' || !e.server.url.startsWith('https://')) return 'server.url must be an https:// URL';
    if (typeof e.server.suggestedName !== 'string') return 'server.suggestedName is required';
    if (!isRecord(e.auth) || !(INTEGRATION_AUTH_KINDS as readonly string[]).includes(String(e.auth.kind))) return 'unknown auth.kind';
    if (e.auth.kind === 'api-key-header' && typeof e.auth.envVar !== 'string') return 'api-key-header needs an envVar';
  } else if (typeof e.manualSetup !== 'string') {
    return 'a non-installable integration needs manualSetup steps';
  }
  return undefined;
}

/** Reads `<assetsRoot>/integrations.json`; an absent file is an empty registry. */
export async function loadIntegrationRegistry(assetsRoot: string): Promise<{ registry: IntegrationRegistry; errors: string[] }> {
  let text: string;
  try {
    text = await fs.readFile(path.join(assetsRoot, 'integrations.json'), 'utf8');
  } catch {
    return { registry: EMPTY_INTEGRATION_REGISTRY, errors: [] };
  }
  try {
    return parseIntegrationRegistry(JSON.parse(text));
  } catch (err) {
    return { registry: EMPTY_INTEGRATION_REGISTRY, errors: [`integrations.json is not valid JSON: ${(err as Error).message}`] };
  }
}

export interface IntegrationQuery {
  capability?: string;
  integration?: string;
  platform?: string;
}

export interface ResolvedIntegrations {
  providers: IntegrationEntry[];
  /** More than one aggregator matched: the user should say which service they use. */
  askWhichAggregator: boolean;
}

/** Matching entries, official platform servers first, then official services, then aggregators; registry order within a tier. */
export function resolveIntegrations(registry: IntegrationRegistry, query: IntegrationQuery): ResolvedIntegrations {
  const capability = query.capability?.trim();
  const integration = query.integration?.trim().toLowerCase();
  const platform = query.platform?.trim().toLowerCase();
  const matches = registry.integrations.filter((e) => {
    if (integration && e.id !== integration) return false;
    if (capability && !(capability in e.capabilities)) return false;
    if (platform && !e.platforms.includes(platform)) return false;
    return true;
  });
  const rank = (t: IntegrationTier) => INTEGRATION_TIERS.indexOf(t);
  const providers = matches
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e.tier) - rank(b.e.tier) || a.i - b.i)
    .map(({ e }) => e);
  return { providers, askWhichAggregator: providers.filter((e) => e.tier === 'aggregator').length > 1 };
}
