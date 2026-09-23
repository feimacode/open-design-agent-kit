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
 * QuickPick, for consistency). Entries are populated once, lazily, on first
 * expand, then memoized — the built-in pool never changes within a running
 * session, but the community pool can (a sync command can replace it at any
 * time), so anything that changes it MUST call refresh().
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

  // The built-in pool never changes within a session (see the class doc
  // comment), but the community pool can — a sync command can replace its
  // on-disk cache at any moment. Drops this view's own memoized entries so
  // the next getChildren() re-queries ContentIndex (which itself
  // live-rescans the community pool on every call) and fires the change
  // event so the tree actually re-renders.
  refresh(): void {
    this.entriesPromise = undefined;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(node: GalleryTreeNode): vscode.TreeItem {
    if (node.kind === 'category') {
      const item = new vscode.TreeItem(node.category, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'openDesignGalleryCategory';
      return item;
    }

    const item = new vscode.TreeItem(node.entry.name, vscode.TreeItemCollapsibleState.None);
    item.description = node.entry.source === 'community' ? `${node.entry.mode} · community` : node.entry.mode;
    item.tooltip = new vscode.MarkdownString(
      node.entry.source === 'community'
        ? `${node.entry.description || node.entry.name}\n\n_Community-contributed, not reviewed by the extension author._`
        : node.entry.description || node.entry.name,
    );
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

export function registerGalleryTreeView(context: vscode.ExtensionContext, contentIndex: ContentIndex): GalleryTreeProvider {
  const provider = new GalleryTreeProvider(contentIndex);
  const view = vscode.window.createTreeView('openDesign.galleryView', { treeDataProvider: provider });
  context.subscriptions.push(view);
  return provider;
}
