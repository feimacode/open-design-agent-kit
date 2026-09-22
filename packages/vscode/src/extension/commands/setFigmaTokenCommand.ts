import * as vscode from 'vscode';
import { setFigmaToken } from '../../workspace/figmaTokenStore';
import type { ILogService } from '../log/logService';

export function registerSetFigmaTokenCommand(context: vscode.ExtensionContext, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.setFigmaToken', async () => {
    log.info('Command: openDesign.setFigmaToken');
    const token = await vscode.window.showInputBox({
      title: 'OpenDesign: Set Figma Access Token',
      prompt: 'Paste a Figma personal access token (Figma → Settings → Personal access tokens). Stored encrypted, never shown again.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty.' : undefined),
    });
    if (!token) return;
    await setFigmaToken(context, token.trim());
    vscode.window.showInformationMessage('OpenDesign: Figma access token saved.');
  });
  context.subscriptions.push(disposable);
}
