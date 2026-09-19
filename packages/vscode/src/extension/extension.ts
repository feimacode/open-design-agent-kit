import * as path from 'node:path';
import * as vscode from 'vscode';
import { createLogService } from './log/logService';
import { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory } from '../workspace/artifactWriter';
import { registerTools } from '../tools/registerTools';
import { registerBrowseDesignSystemsCommand } from './commands/browseDesignSystemsCommand';
import { registerActiveDesignSystemStatusBarItem } from './statusBar/activeDesignSystemStatusBarItem';
import { registerOpenArtifactPreviewCommand } from './commands/openArtifactPreviewCommand';
import { registerBrowseGalleryCommand } from './commands/browseGalleryCommand';
import { registerRemixExampleCommand } from './commands/remixAndOpen';
import { registerPreviewExampleCommand } from './commands/previewExampleCommand';
import { registerChatWithExampleCommand } from './commands/chatWithExample';
import { registerOpenGalleryGridCommand } from './commands/openGalleryGridCommand';
import { registerGalleryTreeView } from './views/galleryTreeProvider';
import { registerImportDesignSystemCommand } from './commands/importDesignSystemCommand';
import { ArtifactEditorProvider } from './customEditors/artifactEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  const log = createLogService(context);
  log.info('Activating OpenDesign Tools');

  const assetsRoot = path.join(context.extensionUri.fsPath, 'assets', 'open-design');
  const contentIndex = new ContentIndex(assetsRoot, () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? path.join(folder.uri.fsPath, getOutputDirectory(), 'design-systems') : undefined;
  });

  registerTools(context, contentIndex, log, assetsRoot);
  registerBrowseDesignSystemsCommand(context, contentIndex, log);
  registerActiveDesignSystemStatusBarItem(context, contentIndex, log);
  registerOpenArtifactPreviewCommand(context, log);
  registerBrowseGalleryCommand(context, contentIndex, assetsRoot, log);
  registerRemixExampleCommand(context, contentIndex, assetsRoot, log);
  registerPreviewExampleCommand(context, contentIndex, assetsRoot, log);
  registerChatWithExampleCommand(context, contentIndex, log);
  registerOpenGalleryGridCommand(context, contentIndex, assetsRoot, log);
  registerGalleryTreeView(context, contentIndex);
  registerImportDesignSystemCommand(context, log);
  context.subscriptions.push(ArtifactEditorProvider.register(context, log));

  log.info('OpenDesign Tools activated');
}

export function deactivate(): void {
  // All cleanup happens via context.subscriptions.
}
