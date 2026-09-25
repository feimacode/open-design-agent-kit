import * as vscode from 'vscode';
import { getOutputDirectory } from '../../workspace/artifactWriter';

// Actions shared by every design-system surface (Browse QuickPick, Design
// Systems tree, preview panel) so they behave identically wherever invoked.

/** Opens Copilot Chat with an unsent, editable message naming the design system. */
export async function openChatWithDesignSystem(id: string, name: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `Using the Open Design design system "${id}" (${name}) — `,
    isPartialQuery: true,
  });
}

/**
 * Opens Copilot Chat with an unsent request for the model to author a custom
 * design system's tokens.css via create_open_design_design_system's
 * tokens-only mode. Writes nothing itself.
 */
export async function openGenerateTokensChat(id: string, name: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `Write the tokens.css for my custom Open Design design system "${name}": use #od-create-design-system with existingDesignSystemId "${id}", then write the file it describes.`,
    isPartialQuery: true,
  });
}

/**
 * Watches every custom design system's DESIGN.md and tokens.css under the
 * configured output directory. Custom systems are written via the model's
 * file tools or plain fs.writeFile (the import command), so a filesystem
 * watcher is the only reliable change signal. `onChange` receives the
 * affected custom design system id (`user:<slug>`).
 */
export function watchCustomDesignSystems(onChange: (id: string) => void): vscode.Disposable {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return new vscode.Disposable(() => undefined);
  const outputDir = getOutputDirectory().replace(/\\/g, '/').replace(/^\.\/|\/$/g, '');
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, `${outputDir}/design-systems/*/{DESIGN.md,tokens.css}`),
  );
  const fire = (uri: vscode.Uri) => {
    const slug = uri.path.split('/').slice(-2)[0];
    if (slug) onChange(`user:${slug}`);
  };
  watcher.onDidCreate(fire);
  watcher.onDidChange(fire);
  watcher.onDidDelete(fire);
  return watcher;
}
