import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../../workspace/artifactWriter';
import { performRemix } from '../../workspace/remixOrchestrator';
import type { ILogService } from '../log/logService';

/**
 * Shared by every UI entry point that remixes an example (the QuickPick
 * command, the gallery tree view, the gallery grid webview) so the
 * remix-then-open-preview sequence and its user-facing messaging exist once.
 */
export async function remixAndOpen(
  contentIndex: ContentIndex,
  assetsRoot: string,
  skillId: string,
  log: ILogService,
  communityContentDir?: string,
): Promise<void> {
  const outcome = await performRemix(contentIndex, assetsRoot, skillId, communityContentDir);
  if (!outcome.ok) {
    log.warn(`remixAndOpen: ${outcome.error}`);
    vscode.window.showErrorMessage(`OpenDesign: ${outcome.error}`);
    return;
  }

  const { entryPath, displayName } = outcome.result;
  log.info(`remixAndOpen: remixed "${displayName}" (${skillId}) into ${entryPath}`);
  vscode.window.showInformationMessage(`OpenDesign: remixed "${displayName}" into ${entryPath}.`);
  await vscode.commands.executeCommand('openDesign.openArtifactPreview', vscode.Uri.file(path.join(getWorkspaceRoot(), entryPath)));
}

// The item's own `command` binding passes a plain skillId string
// (`arguments: [node.entry.id]`), but a `view/item/context` menu invocation
// passes the tree element itself (our GalleryTreeNode) — accept both shapes.
function resolveSkillId(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'kind' in arg && (arg as { kind: string }).kind === 'example') {
    return (arg as unknown as { entry: { id: string } }).entry.id;
  }
  return undefined;
}

export function registerRemixExampleCommand(
  context: vscode.ExtensionContext,
  contentIndex: ContentIndex,
  assetsRoot: string,
  log: ILogService,
  communityContentDir?: string,
): void {
  const disposable = vscode.commands.registerCommand('openDesign.remixExample', async (arg: unknown) => {
    log.info('Command: openDesign.remixExample');
    const skillId = resolveSkillId(arg);
    if (!skillId) {
      log.warn('remixExample: could not resolve a skillId from the command argument');
      return;
    }
    await remixAndOpen(contentIndex, assetsRoot, skillId, log, communityContentDir);
  });
  context.subscriptions.push(disposable);
}
