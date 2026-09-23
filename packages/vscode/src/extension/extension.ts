import * as path from 'node:path';
import * as vscode from 'vscode';
import { createLogService } from './log/logService';
import { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory } from '../workspace/artifactWriter';
import {
  getCommunityContentDir,
  isCommunityContentEnabled,
  hasSyncedCommunityContentOnce,
  setCommunityContentEnabled,
  syncCommunityContent,
} from '../workspace/communityContent';
import { registerTools } from '../tools/registerTools';
import { registerBrowseDesignSystemsCommand } from './commands/browseDesignSystemsCommand';
import { registerActiveDesignSystemStatusBarItem } from './statusBar/activeDesignSystemStatusBarItem';
import { registerOpenArtifactPreviewCommand } from './commands/openArtifactPreviewCommand';
import { registerBrowseGalleryCommand } from './commands/browseGalleryCommand';
import { registerRemixExampleCommand } from './commands/remixAndOpen';
import { registerPreviewExampleCommand } from './commands/previewExampleCommand';
import { registerChatWithExampleCommand } from './commands/chatWithExample';
import { registerOpenGalleryGridCommand } from './commands/openGalleryGridCommand';
import { registerSyncCommunityContentCommand } from './commands/syncCommunityContentCommand';
import { registerGalleryTreeView } from './views/galleryTreeProvider';
import { registerCollectionsTreeView } from './views/collectionsTreeProvider';
import { registerImportDesignSystemCommand } from './commands/importDesignSystemCommand';
import { registerSetFigmaTokenCommand } from './commands/setFigmaTokenCommand';
import { registerRevealFigmaPluginCommand } from './commands/revealFigmaPluginCommand';
import { ArtifactEditorProvider } from './customEditors/artifactEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  const log = createLogService(context);
  log.info('Activating OpenDesign Tools');

  const assetsRoot = path.join(context.extensionUri.fsPath, 'assets', 'open-design');
  const communityContentDir = getCommunityContentDir(context);
  const contentIndex = new ContentIndex(
    assetsRoot,
    () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      return folder ? path.join(folder.uri.fsPath, getOutputDirectory(), 'design-systems') : undefined;
    },
    () => communityContentDir,
  );

  registerTools(context, contentIndex, log, assetsRoot, communityContentDir);
  registerBrowseDesignSystemsCommand(context, contentIndex, log);
  registerActiveDesignSystemStatusBarItem(context, contentIndex, log);
  registerOpenArtifactPreviewCommand(context, log);
  registerBrowseGalleryCommand(context, contentIndex, assetsRoot, log, communityContentDir);
  registerRemixExampleCommand(context, contentIndex, assetsRoot, log, communityContentDir);
  registerPreviewExampleCommand(context, contentIndex, assetsRoot, log, communityContentDir);
  registerChatWithExampleCommand(context, contentIndex, log);
  registerOpenGalleryGridCommand(context, contentIndex, assetsRoot, log, communityContentDir);
  const galleryTreeProvider = registerGalleryTreeView(context, contentIndex);
  registerCollectionsTreeView(context);
  registerImportDesignSystemCommand(context, log);
  registerSetFigmaTokenCommand(context, log);
  registerRevealFigmaPluginCommand(context, log);
  registerSyncCommunityContentCommand(context, log, () => galleryTreeProvider.refresh());
  context.subscriptions.push(ArtifactEditorProvider.register(context, log));

  maybeAutoSyncCommunityContent(context, log, () => galleryTreeProvider.refresh());

  log.info('OpenDesign Tools activated');
}

// Fire-and-forget: activate() stays synchronous (matching every other call
// in this function), and a failed/offline first sync must never block
// activation or spam an error on every subsequent startup — see
// communityContent.ts's own comments on the synced-once flag.
function maybeAutoSyncCommunityContent(context: vscode.ExtensionContext, log: ReturnType<typeof createLogService>, onSynced: () => void): void {
  if (!isCommunityContentEnabled() || hasSyncedCommunityContentOnce(context)) return;

  syncCommunityContent(context, log)
    .then((outcome) => {
      if (!outcome.ok) {
        log.warn(`Community content auto-sync did not complete: ${outcome.error}`);
        return;
      }
      onSynced();
      vscode.window
        .showInformationMessage(
          `OpenDesign: synced ${outcome.exampleCount} community design(s) from awesome-open-design@${outcome.ref}. These aren't reviewed by the extension author.`,
          'Disable',
        )
        .then((choice) => {
          if (choice === 'Disable') void setCommunityContentEnabled(false);
        });
    })
    .catch((err) => log.error(err, 'Community content auto-sync failed'));
}

export function deactivate(): void {
  // All cleanup happens via context.subscriptions.
}
