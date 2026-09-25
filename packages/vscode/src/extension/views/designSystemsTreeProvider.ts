import * as vscode from 'vscode';
import type { ContentIndex, DesignSystemSummary } from '@feimacode/open-design-agent-kit-core';
import { getActiveDesignSystemId, onActiveDesignSystemChanged, setActiveDesignSystemId } from '../../workspace/activeDesignSystem';
import { buildDesignSystemPickItems } from '../commands/browseDesignSystemsCommand';
import { openChatWithDesignSystem, openGenerateTokensChat, watchCustomDesignSystems } from '../designSystems/designSystemActions';
import type { ILogService } from '../log/logService';
import { DesignSystemPreviewProvider } from '../webviews/designSystemPreviewProvider';

// Custom design systems carry no category; they get their own group, first.
const CUSTOM_CATEGORY = 'Custom';

interface CategoryNode {
  kind: 'category';
  category: string;
}

interface DesignSystemNode {
  kind: 'designSystem';
  designSystem: DesignSystemSummary;
}

type DesignSystemsTreeNode = CategoryNode | DesignSystemNode;

function categoryOf(ds: DesignSystemSummary): string {
  return ds.source === 'user' ? CUSTOM_CATEGORY : (ds.category ?? 'Uncategorized');
}

/**
 * TreeDataProvider for the "Design Systems" activity-bar view: every
 * built-in and custom design system, grouped by category, the active one
 * marked. Never caches — ContentIndex already live-rescans custom systems,
 * and the model or the import command can add one at any moment. Clicking
 * an item opens the read-only preview (unlike Gallery's click-to-chat):
 * previewing has no side effects, while setting the active system on a
 * click would silently change persistent workspace state.
 */
export class DesignSystemsTreeProvider implements vscode.TreeDataProvider<DesignSystemsTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<DesignSystemsTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly contentIndex: ContentIndex) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(node: DesignSystemsTreeNode): vscode.TreeItem {
    if (node.kind === 'category') {
      const item = new vscode.TreeItem(node.category, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon(node.category === CUSTOM_CATEGORY ? 'account' : 'folder');
      item.contextValue = 'openDesignDesignSystemCategory';
      return item;
    }

    const ds = node.designSystem;
    const isActive = ds.id === getActiveDesignSystemId();
    const isCustom = ds.source === 'user';
    const item = new vscode.TreeItem(ds.name, vscode.TreeItemCollapsibleState.None);
    item.id = ds.id;
    item.description = [isActive ? 'active' : undefined, isCustom ? 'custom' : undefined, isCustom && !ds.hasTokens ? 'no tokens' : undefined]
      .filter(Boolean)
      .join(' · ');
    item.tooltip = new vscode.MarkdownString(
      [ds.summary || ds.name, isCustom && !ds.hasTokens ? '\n\n_No tokens.css yet — its preview is approximated from DESIGN.md._' : ''].join(''),
    );
    item.iconPath = new vscode.ThemeIcon(isActive ? 'check' : 'symbol-color');
    // e.g. openDesignDesignSystem.custom.active — menus match with regex.
    item.contextValue = ['openDesignDesignSystem', isCustom ? 'custom' : 'builtin', isActive ? 'active' : 'inactive'].join('.');
    item.command = { command: 'openDesign.previewDesignSystem', title: 'Preview Design System', arguments: [ds.id] };
    return item;
  }

  async getChildren(node?: DesignSystemsTreeNode): Promise<DesignSystemsTreeNode[]> {
    const all = await this.contentIndex.listDesignSystems();
    if (!node) {
      const categories = [...new Set(all.map(categoryOf))].sort((a, b) =>
        a === CUSTOM_CATEGORY ? -1 : b === CUSTOM_CATEGORY ? 1 : a.localeCompare(b),
      );
      return categories.map((category) => ({ kind: 'category', category }));
    }
    if (node.kind === 'category') {
      return all
        .filter((ds) => categoryOf(ds) === node.category)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((designSystem) => ({ kind: 'designSystem', designSystem }));
    }
    return [];
  }
}

/** Commands accept either a tree node (inline/context actions) or a plain id (tree click, other callers). */
function idOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  const node = arg as DesignSystemsTreeNode | undefined;
  return node?.kind === 'designSystem' ? node.designSystem.id : undefined;
}

export function registerDesignSystemsTreeView(context: vscode.ExtensionContext, contentIndex: ContentIndex, log: ILogService): void {
  const provider = new DesignSystemsTreeProvider(contentIndex);
  context.subscriptions.push(
    vscode.window.createTreeView('openDesign.designSystemsView', { treeDataProvider: provider }),
    watchCustomDesignSystems(() => provider.refresh()),
    onActiveDesignSystemChanged(() => provider.refresh()),
  );

  const nameOf = async (id: string) => (await contentIndex.getDesignSystem(id))?.name ?? id;

  context.subscriptions.push(
    vscode.commands.registerCommand('openDesign.refreshDesignSystems', () => provider.refresh()),

    vscode.commands.registerCommand('openDesign.previewDesignSystem', async (arg?: unknown) => {
      let id = idOf(arg);
      if (!id) {
        const items = buildDesignSystemPickItems(await contentIndex.listDesignSystems(), getActiveDesignSystemId());
        const picked = await vscode.window.showQuickPick(items, {
          title: 'Open Design: Preview Design System',
          placeHolder: 'Search by name, category, or summary… (previewing does not change the active design system)',
          matchOnDescription: true,
          matchOnDetail: true,
        });
        id = picked?.id ?? undefined;
      }
      if (!id) return;
      log.info(`Command: openDesign.previewDesignSystem ${id}`);
      DesignSystemPreviewProvider.show(context, contentIndex, id, log);
    }),

    vscode.commands.registerCommand('openDesign.setActiveDesignSystem', async (arg?: unknown) => {
      const id = idOf(arg);
      if (!id) return;
      log.info(`Command: openDesign.setActiveDesignSystem ${id}`);
      await setActiveDesignSystemId(id);
    }),

    vscode.commands.registerCommand('openDesign.useDesignSystemInChat', async (arg?: unknown) => {
      const id = idOf(arg);
      if (id) await openChatWithDesignSystem(id, await nameOf(id));
    }),

    vscode.commands.registerCommand('openDesign.generateDesignSystemTokens', async (arg?: unknown) => {
      const id = idOf(arg);
      if (id) await openGenerateTokensChat(id, await nameOf(id));
    }),
  );
}
