// The integration registry guard (openspec add-integration-registry,
// "Registry Content Guard"). Mirrors the validation in packages/core's
// src/integrations/registry.ts (keep TIERS, AUTH_KINDS and PLATFORMS in step);
// the capability vocabulary lives in integrations.json itself, so both read it
// from the same place.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const TIERS = ['official-platform', 'official-service', 'aggregator'];
export const AUTH_KINDS = ['oauth-dcr', 'api-key-header', 'own-oauth-client', 'admin-enabled', 'claude-ai-only'];
export const PLATFORMS = ['x', 'linkedin', 'instagram', 'facebook', 'threads', 'tiktok', 'youtube', 'pinterest', 'bluesky', 'mastodon'];
export const STALE_DAYS = 180;

// Token shapes that must never appear in the registry: real secrets belong in
// env vars or the agent's secret input, referenced by name.
const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bBearer\s+(?!\$\{)[A-Za-z0-9._~+/-]{16,}/,
];

function* strings(value, at = '') {
  if (typeof value === 'string') yield [at, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${at}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, at ? `${at}.${k}` : k);
}

/** Problems with a parsed registry: `{ errors, warnings }` as human-readable strings. */
export function validateIntegrations(registry, now = new Date()) {
  const errors = [];
  const warnings = [];
  if (!registry || typeof registry !== 'object') return { errors: ['integrations.json must be an object'], warnings };
  const vocabulary = registry.capabilities && typeof registry.capabilities === 'object' ? registry.capabilities : {};
  if (Object.keys(vocabulary).length === 0) errors.push('integrations.json needs a "capabilities" vocabulary');
  const list = Array.isArray(registry.integrations) ? registry.integrations : [];
  if (!Array.isArray(registry.integrations)) errors.push('integrations.json needs an "integrations" array');

  const ids = new Set();
  for (const e of list) {
    if (!e || typeof e.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) {
      errors.push('an integration has no id, or an id that is not kebab-case');
      continue;
    }
    const id = e.id;
    if (ids.has(id)) errors.push(`${id}: id used twice`);
    ids.add(id);
    if (typeof e.displayName !== 'string' || typeof e.vendor !== 'string') errors.push(`${id}: needs a displayName and a vendor`);
    if (!TIERS.includes(e.tier)) errors.push(`${id}: tier must be one of ${TIERS.join(', ')}`);
    if (typeof e.installable !== 'boolean') errors.push(`${id}: installable must be true or false`);

    const caps = e.capabilities && typeof e.capabilities === 'object' ? e.capabilities : {};
    if (Object.keys(caps).length === 0) errors.push(`${id}: needs at least one capability`);
    for (const [key, tool] of Object.entries(caps)) {
      if (!(key in vocabulary)) errors.push(`${id}: unknown capability "${key}"`);
      if (tool !== null && (typeof tool !== 'string' || !tool)) errors.push(`${id}: capability "${key}" must map to a tool name or null`);
    }
    for (const p of Array.isArray(e.platforms) ? e.platforms : []) {
      if (!PLATFORMS.includes(p)) errors.push(`${id}: unknown platform "${p}"`);
    }
    if (e.tier === 'aggregator' && !(Array.isArray(e.platforms) && e.platforms.length > 0)) errors.push(`${id}: an aggregator must list its platforms`);

    if (e.installable) {
      const server = e.server ?? {};
      if (server.transport !== 'http') errors.push(`${id}: server.transport must be "http"`);
      if (typeof server.url !== 'string' || !server.url.startsWith('https://')) errors.push(`${id}: server.url must be an https:// URL`);
      if (typeof server.suggestedName !== 'string' || !/^[a-z0-9-]+$/.test(server.suggestedName)) errors.push(`${id}: server.suggestedName must be kebab-case`);
      const auth = e.auth ?? {};
      if (!AUTH_KINDS.includes(auth.kind)) errors.push(`${id}: auth.kind must be one of ${AUTH_KINDS.join(', ')}`);
      if (auth.kind === 'api-key-header') {
        if (typeof auth.envVar !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(auth.envVar)) errors.push(`${id}: api-key-header needs an UPPER_SNAKE envVar`);
        if (typeof auth.header !== 'string' || !auth.header) errors.push(`${id}: api-key-header needs a header name`);
      }
      if (auth.kind === 'claude-ai-only' && typeof e.claudeAiConnector !== 'string') errors.push(`${id}: claude-ai-only needs claudeAiConnector`);
    } else if (typeof e.manualSetup !== 'string' || !e.manualSetup.trim()) {
      errors.push(`${id}: a non-installable integration needs manualSetup steps`);
    }

    if (typeof e.manualFallback !== 'string' || !e.manualFallback.trim()) errors.push(`${id}: needs a manualFallback (how to finish the step without this integration)`);

    if (e.docs !== undefined) {
      if (!e.docs || typeof e.docs !== 'object' || Array.isArray(e.docs)) errors.push(`${id}: docs must be an object`);
      else for (const k of ['summary', 'signIn', 'notes']) if (e.docs[k] !== undefined && typeof e.docs[k] !== 'string') errors.push(`${id}: docs.${k} must be a string`);
    }

    for (const [at, value] of strings(e)) {
      if (CREDENTIAL_PATTERNS.some((re) => re.test(value))) errors.push(`${id}: ${at} looks like a literal credential; reference an env var instead`);
    }

    const verified = typeof e.verifiedAt === 'string' ? new Date(`${e.verifiedAt}T00:00:00Z`) : null;
    if (!verified || Number.isNaN(verified.getTime())) errors.push(`${id}: verifiedAt must be a YYYY-MM-DD date`);
    else if ((now.getTime() - verified.getTime()) / 86_400_000 > STALE_DAYS) warnings.push(`${id}: last verified ${e.verifiedAt}, over ${STALE_DAYS} days ago; re-check its URL, auth and tool names`);
    if (e.toolsVerified !== true) warnings.push(`${id}: tool names not verified against the live server or vendor docs`);
  }
  return { errors, warnings };
}

/** Problems with `<assetsRoot>/integrations.json` (none when the file is absent). */
export async function checkIntegrations(assetsRoot, now = new Date()) {
  const file = path.join(assetsRoot, 'integrations.json');
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { errors: [], warnings: [] };
  }
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (err) {
    return { errors: [`integrations.json is not valid JSON: ${err.message}`], warnings: [] };
  }
  return validateIntegrations(registry, now);
}

/** Marker phrase of the shared integration block (openspec add-integration-registry, D6). */
export const INTEGRATION_BLOCK_MARKER = 'hand work to another service';

function allowedTools(skillMd) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(skillMd)?.[1] ?? '';
  const line = /^allowed-tools:\s*(.*)$/m.exec(fm);
  if (!line) return [];
  let value = line[1].trim();
  if (!value) {
    // YAML list form on the following lines.
    const after = fm.slice(fm.indexOf(line[0]) + line[0].length).split('\n');
    const items = [];
    for (const l of after.slice(1)) {
      const m = /^\s*-\s*(.+)$/.exec(l);
      if (!m) break;
      items.push(m[1].trim());
    }
    return items;
  }
  return value.replace(/^\[|\]$/g, '').split(/[\s,]+/).map((t) => t.replace(/^["']|["']$/g, '')).filter(Boolean);
}

/**
 * Third-party tools must keep the agent's per-call approval: no generated
 * skill may pre-approve a registry tool, and every overview must carry the
 * shared integration block. `skills` is a list of { file, content }.
 */
export function checkIntegrationUsage(registry, skills, overviews) {
  const problems = [];
  const names = new Set();
  const servers = [];
  for (const e of Array.isArray(registry?.integrations) ? registry.integrations : []) {
    for (const t of Object.values(e.capabilities ?? {})) if (typeof t === 'string') names.add(t);
    if (e.server?.suggestedName) servers.push(e.server.suggestedName.toLowerCase());
    if (e.claudeAiConnector) servers.push(`claude_ai_${e.claudeAiConnector.replace(/[^A-Za-z0-9_-]+/g, '_')}`.toLowerCase());
  }
  for (const { file, content } of skills) {
    for (const tool of allowedTools(content)) {
      const lower = tool.toLowerCase();
      const bare = tool.split('__').pop();
      if (names.has(bare) || servers.some((s) => lower.startsWith(`mcp__${s}__`) || lower.includes(`_${s}__`))) {
        problems.push(`${file}: allowed-tools pre-approves the third-party tool "${tool}"; leave it to the agent's per-call approval`);
      }
    }
  }
  for (const { file, content } of overviews) {
    if (!content.includes(INTEGRATION_BLOCK_MARKER) || !content.includes('list_open_design_integrations')) {
      problems.push(`${file}: missing the shared integration block`);
    }
  }
  return problems;
}
