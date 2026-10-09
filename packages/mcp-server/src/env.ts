import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The workspace root this server starts with: the launching process's own
 * cwd by default (how Claude Code and Codex both start a local stdio MCP
 * server — with cwd already set to the active project), overridable for
 * testing or an unusual host via OPEN_DESIGN_WORKSPACE_ROOT. Without the
 * override, index.ts replaces it with the client's first MCP root once the
 * client reports one (see workspaceRootFromClientRoots).
 */
export function getWorkspaceRoot(): string {
  return getWorkspaceRootOverride() || process.cwd();
}

/** An explicit OPEN_DESIGN_WORKSPACE_ROOT, which beats the client's roots. */
export function getWorkspaceRootOverride(): string | undefined {
  return process.env.OPEN_DESIGN_WORKSPACE_ROOT?.trim() || undefined;
}

/**
 * The workspace a client reports through MCP roots: the first file:// root.
 * Hosts that install servers from a registry gallery (VS Code's @mcp view)
 * don't necessarily start them in the open folder, so the cwd alone isn't
 * reliable there. Undefined when the client reports no usable root.
 */
export function workspaceRootFromClientRoots(roots: readonly { uri: string }[]): string | undefined {
  for (const root of roots) {
    if (!root.uri.startsWith('file://')) continue;
    try {
      return fileURLToPath(root.uri);
    } catch {
      continue;
    }
  }
  return undefined;
}

const DEFAULT_OUTPUT_DIR = '.open-design';

/** Where generated artifacts land, relative to the workspace root. */
export function getOutputDirectory(): string {
  return process.env.OPEN_DESIGN_OUTPUT_DIR?.trim() || DEFAULT_OUTPUT_DIR;
}

/**
 * A Figma personal access token (Figma → Settings → Personal access tokens),
 * read from this server's own process env — the same mechanism a host's MCP
 * config already uses to pass through OPEN_DESIGN_WORKSPACE_ROOT-style vars.
 * Undefined means pull_open_design_figma_frame degrades to a clear
 * instructional error rather than throwing.
 */
export function getFigmaToken(): string | undefined {
  return process.env.OPEN_DESIGN_FIGMA_TOKEN?.trim() || undefined;
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

/**
 * OPEN_DESIGN_SHARE_BADGE (1/true, 0/false) overrides the default for the
 * "Made with Open Design" footer badge on standalone/site exports and
 * publish bundles. Read by core's resolveBadge() from this same process env,
 * so this server passes nothing; listed here so every env var this server
 * honours is in one place.
 */
export const SHARE_BADGE_ENV = 'OPEN_DESIGN_SHARE_BADGE';
