import * as vscode from 'vscode';
import type { ActiveDesignSystemStore } from '@feimacode/open-design-agent-kit-core';

const CONFIG_SECTION = 'openDesign';
const CONFIG_KEY = 'activeDesignSystemId';

export function getActiveDesignSystemId(): string | undefined {
  const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY, '');
  return value.trim().length > 0 ? value.trim() : undefined;
}

export async function setActiveDesignSystemId(id: string | undefined): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await config.update(CONFIG_KEY, id ?? '', target);
}

export function onActiveDesignSystemChanged(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY}`)) listener();
  });
}

/** VS Code's `ActiveDesignSystemStore` implementation, backed by the workspace setting above. */
export const vscodeActiveDesignSystemStore: ActiveDesignSystemStore = {
  async get() {
    return getActiveDesignSystemId();
  },
  async set(id) {
    await setActiveDesignSystemId(id);
  },
};
