import * as path from 'node:path';

/**
 * The workspace root this server operates on: the launching process's own
 * cwd by default (how Claude Code and Codex both start a local stdio MCP
 * server — with cwd already set to the active project), overridable for
 * testing or an unusual host via OPEN_DESIGN_WORKSPACE_ROOT.
 */
export function getWorkspaceRoot(): string {
  return process.env.OPEN_DESIGN_WORKSPACE_ROOT?.trim() || process.cwd();
}

const DEFAULT_OUTPUT_DIR = '.open-design';

/** Where generated artifacts land, relative to the workspace root. */
export function getOutputDirectory(): string {
  return process.env.OPEN_DESIGN_OUTPUT_DIR?.trim() || DEFAULT_OUTPUT_DIR;
}

/**
 * Absolute path to the vendored content this server reads from —
 * `@feimacode/open-design-agent-kit-content`'s bundled `assets/open-design`,
 * resolved via normal Node module resolution. Unlike the VS Code extension,
 * this package has no "must physically bundle its own copy" packaging
 * constraint, so it reads the content package directly rather than
 * mirroring it.
 */
export function getAssetsRoot(): string {
  const contentPackageJson = require.resolve('@feimacode/open-design-agent-kit-content/package.json');
  return path.join(path.dirname(contentPackageJson), 'assets', 'open-design');
}
