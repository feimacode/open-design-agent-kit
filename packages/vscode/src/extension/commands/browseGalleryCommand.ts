import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { remixAndOpen } from './remixAndOpen';

interface GalleryPickItem extends vscode.QuickPickItem {
  id: string;
}

export function registerBrowseGalleryCommand(
  context: vscode.ExtensionContext,
  contentIndex: ContentIndex,
  assetsRoot: string,
  log: ILogService,
  communityContentDir?: string,
): void {
  const disposable = vscode.commands.registerCommand('openDesign.browseGallery', async () => {
    log.info('Command: openDesign.browseGallery');
    const entries = (await contentIndex.listSkills()).filter((s) => s.exampleArtifactPath);
    if (entries.length === 0) {
      vscode.window.showInformationMessage('No remixable OpenDesign examples are available.');
      return;
    }

    const items: GalleryPickItem[] = [];
    let lastCategory: string | undefined;
    for (const entry of entries) {
      const category = entry.category ?? 'Uncategorized';
      if (category !== lastCategory) {
        items.push({ id: '', label: category, kind: vscode.QuickPickItemKind.Separator });
        lastCategory = category;
      }
      const descriptionParts = [entry.category, entry.source === 'community' ? 'community' : undefined].filter(
        (p): p is string => !!p,
      );
      items.push({
        id: entry.id,
        label: entry.name,
        description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : undefined,
        detail: entry.description,
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'OpenDesign: Browse Gallery',
      placeHolder: 'Search examples to remix…',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked || !picked.id) {
      log.debug('browseGallery: cancelled');
      return;
    }

    log.info(`browseGallery: remixing ${picked.id}`);
    await remixAndOpen(contentIndex, assetsRoot, picked.id, log, communityContentDir);
  });

  context.subscriptions.push(disposable);
}
