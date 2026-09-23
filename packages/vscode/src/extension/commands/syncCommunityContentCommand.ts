import * as vscode from 'vscode';
import { syncCommunityContent } from '../../workspace/communityContent';
import type { ILogService } from '../log/logService';

/**
 * The "still user-overridable after" affordance from the design: change
 * `openDesign.communityContentRef`, then run this to fetch that tag. Also
 * the manual retry path if the extension's own first-activation auto-sync
 * (see extension.ts) failed (offline, bad default tag, rate-limited).
 */
export function registerSyncCommunityContentCommand(context: vscode.ExtensionContext, log: ILogService, onSynced: () => void): void {
  const disposable = vscode.commands.registerCommand('openDesign.syncCommunityContent', async () => {
    log.info('Command: openDesign.syncCommunityContent');
    const outcome = await syncCommunityContent(context, log);
    if (!outcome.ok) {
      vscode.window.showErrorMessage(`OpenDesign: community content sync failed — ${outcome.error}`);
      return;
    }
    onSynced();
    vscode.window.showInformationMessage(`OpenDesign: synced ${outcome.exampleCount} community design(s) from awesome-open-design@${outcome.ref}.`);
  });
  context.subscriptions.push(disposable);
}
