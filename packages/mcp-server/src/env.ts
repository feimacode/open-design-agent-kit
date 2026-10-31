import { readFileSync, statSync } from 'node:fs';
import * as os from 'node:os';
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
 * An env value, trimmed, or undefined when it is empty or still a literal
 * `${user_config.<key>}` placeholder: a Claude Desktop extension may pass an
 * optional setting the user left empty either way.
 */
export function settingFromEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{user_config\.[^}]*\}$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * OPEN_DESIGN_DEFAULT_WORKSPACE (the desktop extension's "Default design
 * folder"), when it names an existing folder: the last fallback before the
 * working directory, below an agent-set folder, OPEN_DESIGN_WORKSPACE_ROOT and
 * MCP roots. Unlike OPEN_DESIGN_WORKSPACE_ROOT it keeps the home-folder guard
 * on, so a chat with a connected folder can't write into it by accident.
 */
export function getDefaultWorkspace(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = settingFromEnv(env.OPEN_DESIGN_DEFAULT_WORKSPACE);
  if (!value || !path.isAbsolute(value)) return undefined;
  try {
    return statSync(value).isDirectory() ? path.resolve(value) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why a set OPEN_DESIGN_DEFAULT_WORKSPACE wasn't used, for the startup log and
 * the folder guard; undefined when it is unset or usable.
 */
export function defaultWorkspaceProblem(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = settingFromEnv(env.OPEN_DESIGN_DEFAULT_WORKSPACE);
  if (!value) return undefined;
  if (!path.isAbsolute(value)) return `the Default design folder setting, ${JSON.stringify(value)}, isn't an absolute path`;
  try {
    return statSync(value).isDirectory() ? undefined : `the Default design folder setting, ${value}, isn't a folder`;
  } catch {
    return `the Default design folder setting, ${value}, doesn't exist`;
  }
}

/** Set by the desktop extension's manifest, so the server knows Desktop started it from the .mcpb. */
export const DESKTOP_EXTENSION_HOST = 'claude-desktop-extension';

/** Set by the Claude plugin's launcher (scripts/open-design-mcp.mjs) for the server it starts. */
export const PLUGIN_LAUNCHER = 'claude-plugin';

export function isDesktopExtension(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPEN_DESIGN_HOST?.trim() === DESKTOP_EXTENSION_HOST;
}

/** Set by the ChatGPT desktop plugin's mcp.json (openspec add-chatgpt-desktop-plugin). */
export const CHATGPT_PLUGIN_LAUNCHER = 'chatgpt-plugin';

/**
 * Started by the Claude plugin's launcher. Claude only: this is what hands the
 * tools to the Claude Desktop extension when both run (extensionLock.ts).
 */
export function isPluginLaunched(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPEN_DESIGN_LAUNCHER?.trim() === PLUGIN_LAUNCHER;
}

/** Started by the ChatGPT desktop plugin. */
export function isChatGptPlugin(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPEN_DESIGN_LAUNCHER?.trim() === CHATGPT_PLUGIN_LAUNCHER;
}

/** Which app's plugin started the server, when one did. */
export function launcherHost(env: NodeJS.ProcessEnv = process.env): 'claude' | 'chatgpt' | undefined {
  if (isPluginLaunched(env)) return 'claude';
  if (isChatGptPlugin(env)) return 'chatgpt';
  return undefined;
}

/**
 * Started by a desktop app that gives the server no folder of its own: the
 * Claude Desktop extension, or the ChatGPT desktop plugin (whose working
 * folder is the plugin's own install folder). Without roots or an override,
 * designs go to the managed folder, as in a Claude Desktop chat.
 */
export function isFolderlessAppHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDesktopExtension(env) || isChatGptPlugin(env);
}

/** $XDG_CONFIG_HOME/open-design, defaulting to ~/.config/open-design: the token file and the extension lock live here. */
export function configDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configHome = env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
  return path.join(configHome, 'open-design');
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
 * A Figma personal access token (Figma → Settings → Personal access tokens):
 * OPEN_DESIGN_FIGMA_TOKEN from this server's own env, else the token file
 * (figmaTokenFilePath). Read on every call, so a token saved while the server
 * runs is picked up without a restart. Undefined means
 * pull_open_design_figma_frame degrades to a clear instructional error rather
 * than throwing.
 *
 * Not taken from a Claude plugin setting: Claude Desktop refuses to start a
 * plugin server whose .mcp.json refers to ${user_config.*}. The desktop
 * extension's settings form does fill OPEN_DESIGN_FIGMA_TOKEN; an empty field
 * (or its unexpanded placeholder) falls through to the file.
 */
export function getFigmaToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = settingFromEnv(env.OPEN_DESIGN_FIGMA_TOKEN);
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(figmaTokenFilePath(env), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Where the Figma token can be saved: $XDG_CONFIG_HOME/open-design/figma-token, defaulting to ~/.config. */
export function figmaTokenFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDirectory(env), 'figma-token');
}

/**
 * True when the server would otherwise work straight in the user's home
 * folder. That's how Claude Desktop starts plugin servers (no MCP roots, cwd
 * = home), and writing `.open-design/` there is never what the user meant, so
 * tools ask the agent to name the folder first.
 */
export function isHomeFolder(root: string, home: string = os.homedir()): boolean {
  return path.resolve(root) === path.resolve(home);
}

/**
 * Validates a workspace folder the agent names through
 * set_open_design_workspace: hosts like Claude Desktop start the server in the
 * user's home folder and report no MCP roots, so the agent has to say which
 * folder the user connected. Returns the resolved path; throws a message the
 * agent can act on.
 */
export function workspaceRootFromArg(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('path is required: the absolute path of the folder on the machine this server runs on');
  const root = value.trim();
  if (!path.isAbsolute(root)) throw new Error(`"${root}" is not an absolute path`);
  let isDir = false;
  try {
    isDir = statSync(root).isDirectory();
  } catch {
    // Reported below.
  }
  if (!isDir) {
    throw new Error(
      `"${root}" is not a folder this server can see. It runs on the user's machine, so pass that machine's path for the folder (in Claude Desktop, the one get_device_info lists under connectedFolders), not the path your own file tools use.`,
    );
  }
  return path.resolve(root);
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
