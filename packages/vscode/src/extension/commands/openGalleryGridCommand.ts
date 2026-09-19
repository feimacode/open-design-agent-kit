import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { GalleryGridProvider } from '../webviews/galleryGridProvider';

export function registerOpenGalleryGridCommand(
  context: vscode.ExtensionContext,
  contentIndex: ContentIndex,
  assetsRoot: string,
  log: ILogService,
): void {
  const disposable = vscode.commands.registerCommand('openDesign.openGalleryGrid', () => {
    log.info('Command: openDesign.openGalleryGrid');
    GalleryGridProvider.open(context, contentIndex, assetsRoot, log);
  });
  context.subscriptions.push(disposable);
}
