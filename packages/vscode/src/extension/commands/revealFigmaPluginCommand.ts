import * as vscode from 'vscode';
import type { ILogService } from '../log/logService';

export function registerRevealFigmaPluginCommand(context: vscode.ExtensionContext, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.revealFigmaPlugin', async () => {
    log.info('Command: openDesign.revealFigmaPlugin');
    const manifestUri = vscode.Uri.joinPath(context.extensionUri, 'assets', 'figma-plugin', 'manifest.json');
    await vscode.commands.executeCommand('revealFileInOS', manifestUri);
    vscode.window.showInformationMessage(
      'Open Design: in Figma desktop, use Plugins → Development → Import plugin from manifest… and select this manifest.json (one-time setup).',
    );
  });
  context.subscriptions.push(disposable);
}
