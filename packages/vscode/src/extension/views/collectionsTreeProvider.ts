import * as path from 'node:path';
import * as vscode from 'vscode';
import { listCollections, type Collection, type CollectionScreen } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory } from '../../workspace/artifactWriter';

interface CollectionNode {
  kind: 'collection';
  collection: Collection;
}

interface ScreenNode {
  kind: 'screen';
  screen: CollectionScreen;
}

type CollectionsTreeNode = CollectionNode | ScreenNode;

/**
 * TreeDataProvider for the "OpenDesign Collections" activity-bar view — the
 * first UI in this extension for the user's own generated artifacts (Gallery
 * is the bundled example catalog, a completely different data source; see
 * galleryTreeProvider.ts). Live-scans the workspace's output directory on
 * every reveal/refresh via core's listCollections() — same "never cache"
 * posture as ContentIndex's user-design-system scan, since the model can
 * register a new screen into this collection at any moment in the same
 * session.
 */
export class CollectionsTreeProvider implements vscode.TreeDataProvider<CollectionsTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CollectionsTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private async listCollections(): Promise<Collection[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];
    return listCollections(workspaceRoot, getOutputDirectory());
  }

  getTreeItem(node: CollectionsTreeNode): vscode.TreeItem {
    if (node.kind === 'collection') {
      const item = new vscode.TreeItem(node.collection.collectionName, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${node.collection.screens.length} screen${node.collection.screens.length === 1 ? '' : 's'}`;
      item.iconPath = new vscode.ThemeIcon('layers');
      item.contextValue = 'openDesignCollection';
      return item;
    }

    const item = new vscode.TreeItem(node.screen.title, vscode.TreeItemCollapsibleState.None);
    item.description = node.screen.screenRole;
    item.tooltip = node.screen.entryPath;
    item.iconPath = new vscode.ThemeIcon('file-code');
    item.contextValue = 'openDesignCollectionScreen';
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const uri = vscode.Uri.file(path.join(workspaceRoot, node.screen.entryPath));
      item.command = { command: 'openDesign.openArtifactPreview', title: 'Open Artifact Preview', arguments: [uri] };
    }
    return item;
  }

  async getChildren(node?: CollectionsTreeNode): Promise<CollectionsTreeNode[]> {
    if (!node) {
      const collections = await this.listCollections();
      return collections.map((collection) => ({ kind: 'collection', collection }));
    }
    if (node.kind === 'collection') {
      return node.collection.screens.map((screen) => ({ kind: 'screen', screen }));
    }
    return [];
  }
}

export function registerCollectionsTreeView(context: vscode.ExtensionContext): void {
  const provider = new CollectionsTreeProvider();
  const view = vscode.window.createTreeView('openDesign.collectionsView', { treeDataProvider: provider });
  context.subscriptions.push(view);

  // Sidecars are written via plain fs.writeFile (see writeArtifactManifest),
  // never through vscode.workspace.applyEdit — onDidChangeTextDocument would
  // never fire for them, so a filesystem watcher is the only way to pick up
  // a newly-registered screen without the user manually refreshing.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.artifact.json');
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(watcher);

  context.subscriptions.push(vscode.commands.registerCommand('openDesign.refreshCollections', () => provider.refresh()));
}
