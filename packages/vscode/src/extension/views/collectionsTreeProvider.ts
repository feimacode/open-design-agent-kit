import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  directionArtifactMap,
  listCollections,
  listExplorations,
  type Collection,
  type CollectionScreen,
  type ExplorationSummary,
} from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory } from '../../workspace/artifactWriter';

interface CollectionNode {
  kind: 'collection';
  collection: Collection;
}

interface ScreenNode {
  kind: 'screen';
  screen: CollectionScreen;
}

interface ExplorationNode {
  kind: 'exploration';
  exploration: ExplorationSummary;
}

/** One planned direction, a built-out version, or the comparison page. */
interface ExplorationChildNode {
  kind: 'exploration-child';
  label: string;
  description?: string;
  tooltip: string;
  icon: string;
  /** Opens in the Artifact Preview when set. */
  entryPath?: string;
  /** Opens in the system browser when set. */
  externalPath?: string;
}

type CollectionsTreeNode = CollectionNode | ScreenNode | ExplorationNode | ExplorationChildNode;

/**
 * TreeDataProvider for the "Open Design Collections" activity-bar view — the
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

  private async listExplorations(): Promise<ExplorationSummary[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];
    return listExplorations(workspaceRoot, getOutputDirectory());
  }

  getTreeItem(node: CollectionsTreeNode): vscode.TreeItem {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (node.kind === 'exploration') {
      const { plan } = node.exploration;
      const item = new vscode.TreeItem(plan.title, vscode.TreeItemCollapsibleState.Expanded);
      const chosen = plan.chosen ? plan.directions.find((d) => d.id === plan.chosen?.directionId) : undefined;
      item.description = `${plan.directions.length} directions${chosen ? ` · chose ${chosen.label.split(/\s+[—-]\s+/)[0]}` : ''}`;
      item.tooltip = plan.brief;
      item.iconPath = new vscode.ThemeIcon('versions');
      item.contextValue = 'openDesignExploration';
      return item;
    }
    if (node.kind === 'exploration-child') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = node.description;
      item.tooltip = node.tooltip;
      item.iconPath = new vscode.ThemeIcon(node.icon);
      if (workspaceRoot && node.entryPath) {
        const uri = vscode.Uri.file(path.join(workspaceRoot, node.entryPath));
        item.command = { command: 'openDesign.openArtifactPreview', title: 'Open Artifact Preview', arguments: [uri] };
      } else if (workspaceRoot && node.externalPath) {
        // The comparison page frames sibling files by relative path, which the
        // preview's srcdoc iframe can't resolve, so it opens in the system browser.
        const uri = vscode.Uri.file(path.join(workspaceRoot, node.externalPath));
        item.command = { command: 'openDesign.openExplorationComparison', title: 'Open Comparison in Browser', arguments: [uri] };
      }
      return item;
    }
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
    if (workspaceRoot) {
      const uri = vscode.Uri.file(path.join(workspaceRoot, node.screen.entryPath));
      item.command = { command: 'openDesign.openArtifactPreview', title: 'Open Artifact Preview', arguments: [uri] };
    }
    return item;
  }

  async getChildren(node?: CollectionsTreeNode): Promise<CollectionsTreeNode[]> {
    if (!node) {
      const [explorations, collections] = await Promise.all([this.listExplorations(), this.listCollections()]);
      return [
        ...explorations.map((exploration): CollectionsTreeNode => ({ kind: 'exploration', exploration })),
        ...collections.map((collection): CollectionsTreeNode => ({ kind: 'collection', collection })),
      ];
    }
    if (node.kind === 'exploration') {
      const { plan, artifacts, comparePath } = node.exploration;
      const byDirection = directionArtifactMap(artifacts);
      const children: ExplorationChildNode[] = plan.directions.map((d, i) => {
        const artifact = byDirection.get(d.id);
        const isChosen = plan.chosen?.directionId === d.id;
        return {
          kind: 'exploration-child',
          label: `${String.fromCharCode(65 + i)}. ${d.label}`,
          description: artifact ? (isChosen ? 'chosen' : undefined) : 'not generated yet',
          tooltip: artifact?.entryPath ?? d.entryPath,
          icon: isChosen ? 'pass-filled' : artifact ? 'file-code' : 'circle-large-outline',
          entryPath: artifact?.entryPath,
        };
      });
      for (const a of artifacts.filter((x) => !x.directionId)) {
        children.push({ kind: 'exploration-child', label: a.title, description: 'built out', tooltip: a.entryPath, icon: 'star-full', entryPath: a.entryPath });
      }
      children.push({
        kind: 'exploration-child',
        label: 'Open comparison in browser',
        tooltip: comparePath,
        icon: 'link-external',
        externalPath: comparePath,
      });
      return children;
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
  // Exploration plans (exploration.json) change on prepare and on choose.
  for (const glob of ['**/*.artifact.json', '**/exploration.json']) {
    const watcher = vscode.workspace.createFileSystemWatcher(glob);
    watcher.onDidCreate(() => provider.refresh());
    watcher.onDidChange(() => provider.refresh());
    watcher.onDidDelete(() => provider.refresh());
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('openDesign.openExplorationComparison', (uri?: vscode.Uri) => {
      if (uri) void vscode.env.openExternal(uri);
    }),
  );

  context.subscriptions.push(vscode.commands.registerCommand('openDesign.refreshCollections', () => provider.refresh()));
}
