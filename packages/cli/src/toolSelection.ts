export type ToolId = 'claude' | 'codex';
export const ALL_TOOL_IDS: readonly ToolId[] = ['claude', 'codex'];

export class InvalidToolsArgError extends Error {
  constructor(bad: string[]) {
    super(`Unknown tool id(s): ${bad.join(', ')}. Valid values: ${ALL_TOOL_IDS.join(', ')}, all`);
  }
}

/**
 * Parses a `--tools` flag value ("all", or a comma-separated list of tool
 * ids) into a de-duplicated list of valid ToolIds. Throws InvalidToolsArgError
 * on any unrecognized id, rather than silently ignoring a typo.
 */
export function parseToolsArg(raw: string): ToolId[] {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase() === 'all') return [...ALL_TOOL_IDS];

  const requested = trimmed
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const bad = requested.filter((id) => !ALL_TOOL_IDS.includes(id as ToolId));
  if (bad.length > 0) throw new InvalidToolsArgError(bad);

  return [...new Set(requested)] as ToolId[];
}

export interface ToolChoice {
  name: string;
  value: ToolId;
  checked: boolean;
}

/** Choices for the interactive checkbox prompt — both pre-selected by default. */
export function buildToolChoices(): ToolChoice[] {
  return [
    { name: 'Claude Code', value: 'claude', checked: true },
    { name: 'Codex CLI', value: 'codex', checked: true },
  ];
}
