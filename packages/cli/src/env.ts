import * as path from 'node:path';

/** Absolute path to the bundled Claude Code skill content (assets/claude-skills). */
export function getClaudeSkillsAssetRoot(): string {
  return path.join(__dirname, '..', 'assets', 'claude-skills');
}

/** Absolute path to the bundled Codex skill content (assets/codex-skills). */
export function getCodexSkillsAssetRoot(): string {
  return path.join(__dirname, '..', 'assets', 'codex-skills');
}
