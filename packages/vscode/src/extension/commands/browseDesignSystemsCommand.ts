import * as vscode from 'vscode';
import type { ContentIndex, DesignSystemSummary } from '@feimacode/open-design-agent-kit-core';
import { getActiveDesignSystemId, setActiveDesignSystemId } from '../../workspace/activeDesignSystem';
import { openChatWithDesignSystem } from '../designSystems/designSystemActions';
import type { ILogService } from '../log/logService';

// A fourth pseudo-id alongside a real design system id (pick one), `null`
// (clear active), and `undefined` (separator, unselectable).
const IMPORT_SENTINEL = '__import__';

export interface DesignSystemPickItem extends vscode.QuickPickItem {
  id?: string | null; // null = "clear active", undefined = separator, IMPORT_SENTINEL = open the import wizard
}

/** Category-separated QuickPick items for every design system, the active one checked. Shared with Preview Design System. */
export function buildDesignSystemPickItems(designSystems: DesignSystemSummary[], activeId: string | undefined): DesignSystemPickItem[] {
  const items: DesignSystemPickItem[] = [];
  let lastCategory: string | undefined;
  for (const ds of designSystems) {
    const category = ds.category ?? 'Uncategorized';
    if (category !== lastCategory) {
      items.push({ label: category, kind: vscode.QuickPickItemKind.Separator });
      lastCategory = category;
    }
    const isActive = ds.id === activeId;
    const descriptionParts = [ds.category, ds.source === 'user' ? 'custom' : undefined, isActive ? 'active' : undefined].filter(
      (p): p is string => !!p,
    );
    items.push({
      id: ds.id,
      label: isActive ? `$(check) ${ds.name}` : ds.name,
      description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : undefined,
      detail: ds.summary,
    });
  }
  return items;
}

export function registerBrowseDesignSystemsCommand(context: vscode.ExtensionContext, contentIndex: ContentIndex, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.browseDesignSystems', async () => {
    log.info('Command: openDesign.browseDesignSystems');
    const designSystems = await contentIndex.listDesignSystems();

    const activeId = getActiveDesignSystemId();
    const items: DesignSystemPickItem[] = [
      { id: IMPORT_SENTINEL, label: '$(cloud-download) Import a design system…', description: 'From a file, pasted content, or a GitHub repository' },
    ];
    if (designSystems.length === 0) {
      const picked = await vscode.window.showQuickPick(items, { title: 'Open Design: Browse Design Systems', placeHolder: 'No design systems yet' });
      if (picked?.id === IMPORT_SENTINEL) await vscode.commands.executeCommand('openDesign.importDesignSystem');
      return;
    }
    if (activeId) {
      items.push({ id: null, label: '$(close) Clear active design system', description: 'Stop pinning a design system' });
    }

    items.push(...buildDesignSystemPickItems(designSystems, activeId));

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Open Design: Browse Design Systems',
      placeHolder: 'Search by name, category, or summary… (selecting one sets it as active)',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked || picked.id === undefined) {
      log.debug('browseDesignSystems: cancelled');
      return;
    }

    if (picked.id === IMPORT_SENTINEL) {
      await vscode.commands.executeCommand('openDesign.importDesignSystem');
      return;
    }

    if (picked.id === null) {
      await setActiveDesignSystemId(undefined);
      log.info('browseDesignSystems: cleared active design system');
      vscode.window.showInformationMessage('Open Design: cleared the active design system.');
      return;
    }

    log.info(`browseDesignSystems: set active design system to ${picked.id}`);
    await setActiveDesignSystemId(picked.id);
    const name = picked.label.replace(/^\$\(check\)\s*/, '');
    await openChatWithDesignSystem(picked.id, name);
  });

  context.subscriptions.push(disposable);
}
