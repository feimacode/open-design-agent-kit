import * as vscode from 'vscode';
import type { ILogService } from '../log/logService';

/** The documentation index on GitHub (docs/ in the repository). */
export const DOCS_URL = 'https://github.com/feimacode/open-design-agent-kit/blob/main/docs/README.md';

export function registerOpenDocsCommand(context: vscode.ExtensionContext, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.openDocs', async () => {
    log.info('Command: openDesign.openDocs');
    await vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
  });
  context.subscriptions.push(disposable);
}
