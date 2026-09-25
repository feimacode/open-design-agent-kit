import * as path from 'node:path';

/** Absolute path to the bundled Claude Code skill content (assets/claude-skills). */
export function getClaudeSkillsAssetRoot(): string {
  return path.join(__dirname, '..', 'assets', 'claude-skills');
}

/** Absolute path to the bundled Codex skill content (assets/codex-skills). */
export function getCodexSkillsAssetRoot(): string {
  return path.join(__dirname, '..', 'assets', 'codex-skills');
}

/**
 * Absolute path to the vendored Open Design catalog (skill aspect hints for
 * `export`) — `@feimacode/open-design-agent-kit-content`'s bundled
 * `assets/open-design`, resolved via normal Node module resolution, same as
 * the MCP server's getAssetsRoot().
 */
export function getContentAssetsRoot(): string {
  const contentPackageJson = require.resolve('@feimacode/open-design-agent-kit-content/package.json');
  return path.join(path.dirname(contentPackageJson), 'assets', 'open-design');
}
