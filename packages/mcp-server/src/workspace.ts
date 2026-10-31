// Which folder the server works in, and when tools must wait for the agent to
// name one. Precedence: a folder the agent set (set_open_design_workspace or
// use_open_design_managed_workspace), OPEN_DESIGN_WORKSPACE_ROOT, the
// client's MCP roots, OPEN_DESIGN_DEFAULT_WORKSPACE, the working directory.
// main() in index.ts holds the state; the rules live here so they can be tested.
import * as os from 'node:os';
import { isHomeFolder } from './env';

export type WorkspaceSource = 'agent' | 'managed' | 'override' | 'roots' | 'default' | 'cwd';

export const SET_WORKSPACE_TOOL = 'set_open_design_workspace';
export const MANAGED_WORKSPACE_TOOL = 'use_open_design_managed_workspace';
export const WRITE_FILE_TOOL = 'write_open_design_file';

/** The root before the client reports its roots: OPEN_DESIGN_WORKSPACE_ROOT, then the default folder, then the cwd. */
export function initialWorkspace(input: { override?: string; defaultWorkspace?: string; cwd: string }): { root: string; source: WorkspaceSource } {
  if (input.override) return { root: input.override, source: 'override' };
  if (input.defaultWorkspace) return { root: input.defaultWorkspace, source: 'default' };
  return { root: input.cwd, source: 'cwd' };
}

/** Whether the client's roots may replace the current root: only an agent-set folder and OPEN_DESIGN_WORKSPACE_ROOT outrank them. */
export function rootsMayReplace(source: WorkspaceSource): boolean {
  return source === 'roots' || source === 'default' || source === 'cwd';
}

/**
 * True when the server has no folder of its own: no OPEN_DESIGN_WORKSPACE_ROOT,
 * no MCP roots, and a working directory that isn't the user's folder (the home
 * folder, or whatever folder Claude Desktop starts an extension in). That's a
 * Claude Desktop chat; Claude Code, Codex and VS Code always have a folder.
 */
export function hasNoFolderOfItsOwn(input: { override?: string; hadRoots: boolean; cwd: string; desktopExtension: boolean; home?: string }): boolean {
  if (input.override || input.hadRoots) return false;
  return input.desktopExtension || isHomeFolder(input.cwd, input.home ?? os.homedir());
}

/** Whether tools must refuse until the agent names a folder. */
export function needsFolderFromAgent(input: { root: string; source: WorkspaceSource; desktopExtension: boolean; home?: string }): boolean {
  if (input.source === 'agent' || input.source === 'managed' || input.source === 'override') return false;
  if (input.source === 'default') return true;
  if (input.source === 'cwd' && input.desktopExtension) return true;
  return isHomeFolder(input.root, input.home ?? os.homedir());
}

/** The refusal's first sentence, written so the agent can pass it to the user as is (openspec desktop-first-run-welcome). */
export const GUARD_USER_SENTENCE = 'I need a folder to save your designs in.';

/** The refusal tools give while the agent hasn't named a folder. */
export function workspaceGuardMessage(input: { root: string; source: WorkspaceSource; toolName: string; managedToolListed: boolean; managedRoot: string; defaultProblem?: string }): string {
  const connected = `If the user connected a folder to this chat, call ${SET_WORKSPACE_TOOL} with that folder's absolute path on the machine this server runs on (in Claude Desktop, the one get_device_info lists under connectedFolders), then call ${input.toolName} again.`;
  const managed = input.managedToolListed
    ? ` If the chat has no folder, call ${MANAGED_WORKSPACE_TOOL} with a short name for the design instead: it opens a folder for it under ${input.managedRoot} and you save files there with ${WRITE_FILE_TOOL}.`
    : '';
  if (input.source === 'default') {
    return `${GUARD_USER_SENTENCE} (For you: Open Design doesn't know which folder this chat uses yet.) ${connected} If no folder is connected, pass the default design folder, ${input.root}, to ${SET_WORKSPACE_TOOL} when you can write files there with your own tools.${managed}`;
  }
  const where = isHomeFolder(input.root) ? `straight in the user's home folder (${input.root})` : `in ${input.root}, the folder this host started it in`;
  const unusedDefault = input.defaultProblem ? ` It didn't use the default folder: ${input.defaultProblem}.` : '';
  return `${GUARD_USER_SENTENCE} (For you: Open Design would be working ${where}, which usually means this host didn't say which folder to use.${unusedDefault}) ${connected} If the user really wants that folder, pass its path.${managed}`;
}
