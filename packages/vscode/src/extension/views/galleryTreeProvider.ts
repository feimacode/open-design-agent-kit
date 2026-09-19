import * as vscode from 'vscode';
import type { ContentIndex, SkillSummary } from '@feimacode/open-design-agent-kit-core';

interface CategoryNode {
  kind: 'category';
  category: string;
}

interface ExampleNode {
  kind: 'example';
  entry: SkillSummary;
}

type GalleryTreeNode = CategoryNode | ExampleNode;

/**
 * TreeDataProvider for the Explorer sidebar's "OpenDesign Gallery" view —
 * a lightweight, always-visible way to browse and remix the vendored
 * example pool, grouped by category (same grouping as the "Browse Gallery"
 * QuickPick, for consistency). Content is vendored at build time and never
 * changes within a running session, so there's no refresh affordance —
 * populated once, lazily, on first expand.
 */
export class GalleryTreeProvider implements vscode.TreeDataProvider<GalleryTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<GalleryTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private entriesPromise: Promise<SkillSummary[]> | undefined;

  constructor(private readonly contentIndex: ContentIndex) {}

  private getEntries(): Promise<SkillSummary[]> {
    if (!this.entriesPromise) {
      this.entriesPromise = this.contentIndex.listSkills().then((all) => all.filter((s) => s.exampleArtifactPath));
    }
    return this.entriesPromise;
  }

  getTreeItem(node: GalleryTreeNode): vscode.TreeItem {
    if (node.kind === 'category') {
      const item = new vscode.TreeItem(node.category, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'openDesignGalleryCategory';
      return item;
    }

    const item = new vscode.TreeItem(node.entry.name, vscode.TreeItemCollapsibleState.None);
    item.description = node.entry.mode;
    item.tooltip = new vscode.MarkdownString(node.entry.description || node.entry.name);
    item.iconPath = new vscode.ThemeIcon('symbol-color');
    item.contextValue = 'openDesignGalleryExample';
    // Mirrors open-design's own Gallery: clicking an example populates the
    // chat composer with its prompt — nothing is written until the user
    // sends it. A visual (no-chat) preview and a direct Remix are both
    // still available via the inline context-menu actions.
    item.command = { command: 'openDesign.chatWithExample', title: 'Use in Chat', arguments: [node.entry.id] };
    return item;
  }

  async getChildren(node?: GalleryTreeNode): Promise<GalleryTreeNode[]> {
    const entries = await this.getEntries();

    if (!node) {
      const categories = [...new Set(entries.map((e) => e.category ?? 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
      return categories.map((category) => ({ kind: 'category', category }));
    }

    if (node.kind === 'category') {
      return entries
        .filter((e) => (e.category ?? 'Uncategorized') === node.category)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ kind: 'example', entry }));
    }

    return [];
  }
}

export function registerGalleryTreeView(context: vscode.ExtensionContext, contentIndex: ContentIndex): void {
  const provider = new GalleryTreeProvider(contentIndex);
  const view = vscode.window.createTreeView('openDesign.galleryView', { treeDataProvider: provider });
  context.subscriptions.push(view);
}
