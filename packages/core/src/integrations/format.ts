// The text list_open_design_integrations returns, identical on every host
// (openspec add-integration-registry, D5/D7).
import { resolveIntegrations, SOCIAL_PLATFORMS, type IntegrationEntry, type IntegrationQuery, type IntegrationRegistry } from './registry';
import { installableOn, integrationGroup, INTEGRATION_GROUPS } from './status';
import { INTEGRATION_AGENTS, isIntegrationAgent, renderInstall, toolNameHints, type IntegrationAgent } from './render';

/** Repeated in every result so it applies even when the overview instructions aren't loaded. */
export const INTEGRATION_CONSENT_RULES = [
  'Use an installed integration when one matches; refer to its tools by their server-defined names.',
  'Before deciding one is missing, check your tool list, including deferred or on-demand tools you can search for.',
  'Offer setup at most once per conversation, only when a step needs it. Install only after the user says yes in this conversation, never silently.',
  "Install at user level, never into a file committed to the project (.mcp.json, .vscode/mcp.json, .codex/config.toml in the repo).",
  "Never ask for an API key in chat or write one into a file: the user sets the env var or secret input themselves.",
  'Anything that publishes, sends or posts on the user\'s account still needs their go-ahead first.',
  'If the user declines or setup fails, continue with the workflow\'s manual path.',
];

export interface ListIntegrationsInput extends IntegrationQuery {
  agent?: string;
}

const TIER_LABEL: Record<IntegrationEntry['tier'], string> = {
  'official-platform': 'Official server from the platform itself',
  'official-service': "The vendor's official server",
  aggregator: 'Posting service covering several networks',
};

function capabilityLines(entry: IntegrationEntry, registry: IntegrationRegistry, only?: string): string[] {
  return Object.entries(entry.capabilities)
    .filter(([key]) => !only || key === only)
    .map(([key, tool]) => `  - \`${key}\` (${registry.capabilities[key] ?? key}): ${tool ? `tool \`${tool}\`` : `tool name not verified: pick ${entry.displayName}'s tool for this by its description`}`);
}

function catalog(registry: IntegrationRegistry, agent: IntegrationAgent): string {
  const lines = [
    '# Open Design integrations',
    '',
    `Trusted third-party MCP servers Open Design workflows can use, grouped by purpose, with hints for **${agent}**. Call again with \`capability\`, \`integration\` and/or \`platform\` for priority order and setup steps.`,
    '',
    'To show the user a status for each, check your own tools (including deferred ones) against the hints: a match means connected. If you have a shell, `claude mcp list` (Claude Code) or `codex mcp list` (Codex) also shows servers that are configured but not connected.',
  ];
  for (const group of INTEGRATION_GROUPS) {
    const entries = registry.integrations.filter((e) => integrationGroup(e) === group);
    if (!entries.length) continue;
    lines.push('', `## ${group}`);
    for (const e of entries) {
      const what = e.docs?.summary ?? Object.keys(e.capabilities).map((k) => registry.capabilities[k] ?? k).join('; ');
      lines.push(
        '',
        `### ${e.displayName} (\`${e.id}\`)`,
        `- What it does: ${what}${e.platforms.length ? ` (${e.platforms.join(', ')})` : ''}`,
        `- Kind: ${TIER_LABEL[e.tier].toLowerCase()}`,
        `- Connected if your tools include: ${toolNameHints(e, agent).map((h) => (h.startsWith('any ') ? h : `\`${h}\``)).join(', ')}`,
        `- Setup here: ${installableOn(e, agent) ? 'can be added on this agent' : 'manual only on this agent'}`,
        `- Without it: ${e.manualFallback}`,
      );
    }
  }
  return lines.join('\n');
}

/** The tool result: the catalog with no filters, otherwise providers in priority order with install steps for `agent`. */
export function formatIntegrations(registry: IntegrationRegistry, input: ListIntegrationsInput, defaultAgent: IntegrationAgent): string {
  const problems: string[] = [];
  if (input.agent !== undefined && !isIntegrationAgent(input.agent)) problems.push(`Unknown agent "${input.agent}". Use one of: ${INTEGRATION_AGENTS.join(', ')}.`);
  if (input.capability && !(input.capability in registry.capabilities)) problems.push(`Unknown capability "${input.capability}". Known: ${Object.keys(registry.capabilities).join(', ')}.`);
  if (input.integration && !registry.integrations.some((e) => e.id === input.integration?.trim().toLowerCase())) {
    problems.push(`Unknown integration "${input.integration}". Known: ${registry.integrations.map((e) => e.id).join(', ')}.`);
  }
  if (input.platform && !(SOCIAL_PLATFORMS as readonly string[]).includes(input.platform.trim().toLowerCase())) {
    problems.push(`Unknown platform "${input.platform}". Known: ${SOCIAL_PLATFORMS.join(', ')}.`);
  }
  if (problems.length > 0) return problems.join('\n');

  if (!input.capability && !input.integration && !input.platform) return catalog(registry, isIntegrationAgent(input.agent) ? input.agent : defaultAgent);

  const agent = isIntegrationAgent(input.agent) ? input.agent : defaultAgent;
  const { providers, askWhichAggregator } = resolveIntegrations(registry, input);
  const filters = [input.capability && `capability \`${input.capability}\``, input.integration && `integration \`${input.integration}\``, input.platform && `platform \`${input.platform}\``].filter(Boolean).join(', ');
  const lines = [`# Integrations for ${filters}`, '', `Install steps are for: **${agent}**${input.agent ? '' : ' (pass `agent` to override)'}.`, ''];

  if (providers.length === 0) {
    lines.push('No trusted integration covers this. Continue with the workflow\'s manual path, and say so to the user.');
  } else {
    lines.push('Providers, in priority order. Use the first one that is installed; if none is, offer the first installable one.');
    if (askWhichAggregator) lines.push('', 'Several posting services match: if none is installed, ask the user which one they use (or want) before offering setup.');
    providers.forEach((e, i) => {
      lines.push('', `## ${i + 1}. ${e.displayName} (\`${e.id}\`)`, '', `${TIER_LABEL[e.tier]}.${e.docsUrl ? ` Docs: ${e.docsUrl}` : ''}`, '', '- Tools:');
      lines.push(...capabilityLines(e, registry, input.capability));
      lines.push(`- Installed if your tools include: ${toolNameHints(e, agent).map((h) => (h.startsWith('any ') ? h : `\`${h}\``)).join(', ')}`);
      if (e.platforms.length) lines.push(`- Platforms: ${e.platforms.join(', ')}`);
      for (const c of e.caveats) lines.push(`- Note: ${c}`);
      lines.push(`- Manual path (if it isn't set up): ${e.manualFallback}`);
      const install = renderInstall(e, agent);
      lines.push('', install.manualOnly ? '**Setup (manual, by the user):**' : '**Setup, only after the user says yes:**', '');
      install.steps.forEach((s, n) => lines.push(`${n + 1}. ${s}`));
    });
  }
  lines.push('', '## Rules', '', ...INTEGRATION_CONSENT_RULES.map((r) => `- ${r}`));
  return lines.join('\n');
}
