import * as vscode from 'vscode';
import { ARTIFACT_EDITOR_VIEW_TYPE } from '../customEditors/artifactEditorProvider';
import type { ILogService } from '../log/logService';

export function registerOpenArtifactPreviewCommand(context: vscode.ExtensionContext, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.openArtifactPreview', async (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      log.warn('openArtifactPreview: no file to preview (no uri argument and no active editor)');
      vscode.window.showWarningMessage('Open Design: no file to preview. Open or select an HTML artifact first.');
      return;
    }
    log.info(`Command: openDesign.openArtifactPreview ${target.fsPath}`);
    await vscode.commands.executeCommand('vscode.openWith', target, ARTIFACT_EDITOR_VIEW_TYPE);
  });
  context.subscriptions.push(disposable);
}
