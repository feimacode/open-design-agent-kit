import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  INTEGRATION_GROUPS,
  integrationGroup,
  integrationStatus,
  installableOn,
  readConfiguredMcpServers,
  renderInstall,
  vscodeInstallLink,
  vscodeMcpConfigFiles,
  vscodeMcpSnippet,
  type ConfiguredServer,
  type ContentIndex,
  type IntegrationEntry,
  type IntegrationGroup,
  type IntegrationStatus,
} from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { OD_TOKENS_CSS, odFontFaceCss } from '../webviews/openDesignTheme';

// The "Integrations" sidebar view (openspec add-integrations-list): every
// registry integration with a status dot. Connected comes from the tool list
// (vscode.lm.tools, MCP tools included); installed-but-not-connected from the
// user's and workspace's MCP config files. There's no stable "tools changed"
// event, so it refreshes when shown, on window focus and from its title bar.

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  installed: 'Installed, not connected',
  'not-installed': 'Not installed',
};
const STATUS_COLOR: Record<IntegrationStatus, string> = {
  connected: 'testing.iconPassed',
  installed: 'charts.yellow',
  'not-installed': 'disabledForeground',
};

type Node = { kind: 'group'; group: IntegrationGroup } | { kind: 'item'; entry: IntegrationEntry; status: IntegrationStatus };

export class IntegrationsTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private statuses = new Map<string, IntegrationStatus>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly contentIndex: ContentIndex,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  statusOf(id: string): IntegrationStatus {
    return this.statuses.get(id) ?? 'not-installed';
  }

  private async configuredServers(): Promise<ConfiguredServer[]> {
    // globalStorageUri is <User>/globalStorage/<extension id>.
    const userDir = path.dirname(path.dirname(this.context.globalStorageUri.fsPath));
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const servers = await readConfiguredMcpServers(await vscodeMcpConfigFiles(userDir, folders));
    const legacy = vscode.workspace.getConfiguration('mcp').get<Record<string, { url?: string }>>('servers') ?? {};
    for (const [name, def] of Object.entries(legacy)) servers.push({ name, url: typeof def?.url === 'string' ? def.url : undefined });
    return servers;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    const registry = await this.contentIndex.getIntegrationRegistry();
    if (!node) {
      const toolNames = vscode.lm.tools.map((t) => t.name);
      const configuredServers = await this.configuredServers();
      this.statuses = new Map(registry.integrations.map((e) => [e.id, integrationStatus(e, { toolNames, configuredServers, agent: 'vscode' })]));
      return INTEGRATION_GROUPS.filter((g) => registry.integrations.some((e) => integrationGroup(e) === g)).map((group) => ({ kind: 'group', group }));
    }
    if (node.kind === 'group') {
      return registry.integrations.filter((e) => integrationGroup(e) === node.group).map((entry) => ({ kind: 'item', entry, status: this.statusOf(entry.id) }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.group, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'integrationGroup';
      return item;
    }
    const { entry, status } = node;
    const item = new vscode.TreeItem(entry.displayName.replace(/\s*\(.*\)\s*$/, ''), vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(STATUS_COLOR[status]));
    item.description = STATUS_LABEL[status];
    item.tooltip = new vscode.MarkdownString(`**${entry.displayName}** — ${STATUS_LABEL[status]}\n\n${entry.docs?.summary ?? ''}`);
    item.contextValue = `integration.${status}`;
    item.command = { command: 'openDesign.showIntegration', title: 'Show Integration Setup', arguments: [entry.id] };
    return item;
  }
}

function nonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Minimal inline Markdown for registry text: `code` and [links](https://…). */
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="#" data-open="$2">$1</a>');

/** One reusable panel: how to set up (or use) the selected integration. */
export class IntegrationSetupPanel {
  private static instance: IntegrationSetupPanel | undefined;
  private entry: IntegrationEntry | undefined;

  static show(context: vscode.ExtensionContext, entry: IntegrationEntry, status: IntegrationStatus, onClose: () => void, log: ILogService): void {
    log.info(`IntegrationSetupPanel: showing ${entry.id} (${status})`);
    if (!IntegrationSetupPanel.instance) {
      const panel = vscode.window.createWebviewPanel('openDesign.integrationSetup', 'Integration', vscode.ViewColumn.Active, {
        enableScripts: true,
        localResourceRoots: [context.extensionUri],
      });
      IntegrationSetupPanel.instance = new IntegrationSetupPanel(context, panel, onClose);
    }
    IntegrationSetupPanel.instance.render(entry, status);
    IntegrationSetupPanel.instance.panel.reveal();
  }

  private readonly panelNonce = nonce();

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    onClose: () => void,
  ) {
    panel.onDidDispose(() => {
      IntegrationSetupPanel.instance = undefined;
      onClose();
    });
    panel.webview.onDidReceiveMessage(async (msg: { type: string; value?: string }) => {
      const entry = this.entry;
      if (!entry) return;
      switch (msg.type) {
        case 'install': {
          const link = vscodeInstallLink(entry);
          if (link) await vscode.env.openExternal(vscode.Uri.parse(link));
          break;
        }
        case 'copy': {
          const snippet = vscodeMcpSnippet(entry);
          if (snippet) {
            await vscode.env.clipboard.writeText(snippet);
            vscode.window.showInformationMessage(`Open Design: ${entry.displayName} configuration copied. Paste it into your user mcp.json (merge into "servers").`);
          }
          break;
        }
        case 'openUserConfig':
          await vscode.commands.executeCommand('workbench.mcp.openUserMcpJson');
          break;
        case 'showServers':
          await vscode.commands.executeCommand('workbench.mcp.showInstalledServers');
          break;
        case 'useInChat':
          await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `Use my ${entry.displayName} integration with Open Design: call list_open_design_integrations with integration "${entry.id}" for what it can do here, then help me with `,
            isPartialQuery: true,
          });
          break;
        case 'open':
          if (msg.value && /^https:\/\//.test(msg.value)) await vscode.env.openExternal(vscode.Uri.parse(msg.value));
          break;
      }
    });
  }

  private render(entry: IntegrationEntry, status: IntegrationStatus): void {
    this.entry = entry;
    this.panel.title = `${entry.displayName.replace(/\s*\(.*\)\s*$/, '')} — Integration`;
    const webview = this.panel.webview;
    const link = vscodeInstallLink(entry);
    const snippet = vscodeMcpSnippet(entry);
    const installable = installableOn(entry, 'vscode');
    const sections: string[] = [];

    if (status === 'connected') {
      sections.push(`<section><h2>Ready to use</h2><p>${esc(entry.displayName)}'s tools are available to Copilot. Open Design workflows use it automatically when a step needs it. VS Code starts the server on demand.</p><button data-msg="useInChat">Use in chat</button></section>`);
    } else if (status === 'installed') {
      sections.push(`<section><h2>Installed, not connected</h2><p>It's in your MCP configuration, but its tools aren't available yet. Usually it needs to be started or signed in to: open VS Code's MCP servers view, then start it and complete ${esc(entry.vendor)}'s sign-in.</p><button data-msg="showServers">Show MCP servers</button></section>`);
    }

    if (status !== 'connected' && installable && link && snippet) {
      const keyNote = entry.auth?.kind === 'api-key-header' ? `<p class="note">${esc(entry.displayName)} uses an API key${entry.auth.docsUrl ? ` (<a href="#" data-open="${esc(entry.auth.docsUrl)}">get one</a>)` : ''}. VS Code asks for it once and stores it securely; it's never written to a file.</p>` : '';
      sections.push(`<section><h2>Install in VS Code</h2><p>Opens VS Code's own install page for ${esc(entry.displayName)}; you confirm there.</p>${keyNote}<button data-msg="install" class="primary">Install in VS Code</button></section>`);
      sections.push(`<section><h2>Or add it yourself</h2><p>Add this to your user <code>mcp.json</code> (merge into <code>"servers"</code>):</p><pre><code>${esc(snippet)}</code></pre><div class="row"><button data-msg="copy">Copy</button><button data-msg="openUserConfig">Open User MCP Configuration</button></div></section>`);
    } else if (status !== 'connected') {
      const steps = renderInstall(entry, 'vscode').steps.map((s) => `<li>${inline(s).replace(/\n/g, '<br>')}</li>`).join('');
      sections.push(`<section><h2>Set up by hand</h2><ol>${steps}</ol></section>`);
    }

    sections.push(`<section><h2>Without it</h2><p>${inline(entry.manualFallback)}</p></section>`);
    if (entry.caveats.length) sections.push(`<section><h2>Good to know</h2><ul>${entry.caveats.map((c) => `<li>${inline(c)}</li>`).join('')}</ul></section>`);

    const csp = [`default-src 'none'`, `style-src ${webview.cspSource} 'unsafe-inline'`, `font-src ${webview.cspSource}`, `script-src 'nonce-${this.panelNonce}'`].join('; ');
    const dot = { connected: '#2e9e5b', installed: '#d9a400', 'not-installed': '#9a9a9a' }[status];
    webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
${odFontFaceCss(webview, this.context.extensionUri)}
${OD_TOKENS_CSS}
body { margin: 0; background: var(--od-bg); color: var(--od-text); font-family: 'Albert Sans', system-ui, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 28px 24px 48px; }
h1 { color: var(--od-text-strong); font-size: 22px; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: ${dot}; display: inline-block; }
.status { font-size: 13px; opacity: .8; margin: 0 0 8px; }
h2 { color: var(--od-text-strong); font-size: 15px; margin: 24px 0 6px; }
p, li { line-height: 1.5; font-size: 14px; }
pre { background: var(--od-bg-subtle); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12.5px; }
code { font-family: ui-monospace, Menlo, Consolas, monospace; }
button { font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--od-bg-muted); background: var(--od-bg-panel); color: var(--od-text-strong); cursor: pointer; margin-right: 8px; }
button.primary { background: var(--od-text-strong); color: var(--od-bg); border-color: transparent; }
.note { font-size: 13px; opacity: .85; }
a { color: inherit; }
</style></head><body><main>
<h1><span class="dot" aria-hidden="true"></span>${esc(entry.displayName)}</h1>
<p class="status">${esc(STATUS_LABEL[status])} · ${esc(entry.docs?.summary ?? '')}</p>
${entry.docs?.signIn ? `<p class="note">Sign-in: ${inline(entry.docs.signIn)}${entry.docsUrl ? ` · <a href="#" data-open="${esc(entry.docsUrl)}">Docs</a>` : ''}</p>` : ''}
${sections.join('\n')}
</main>
<script nonce="${this.panelNonce}">
const vscode = acquireVsCodeApi();
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-msg],[data-open]');
  if (!t) return;
  e.preventDefault();
  if (t.dataset.open) vscode.postMessage({ type: 'open', value: t.dataset.open });
  else vscode.postMessage({ type: t.dataset.msg });
});
</script></body></html>`;
  }
}

export function registerIntegrationsTreeView(context: vscode.ExtensionContext, contentIndex: ContentIndex, log: ILogService): IntegrationsTreeProvider {
  const provider = new IntegrationsTreeProvider(context, contentIndex);
  const view = vscode.window.createTreeView('openDesign.integrationsView', { treeDataProvider: provider });
  context.subscriptions.push(
    view,
    view.onDidChangeVisibility((e) => {
      if (e.visible) provider.refresh();
    }),
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused && view.visible) provider.refresh();
    }),
    vscode.commands.registerCommand('openDesign.refreshIntegrations', () => provider.refresh()),
    vscode.commands.registerCommand('openDesign.showIntegration', async (id?: string) => {
      const registry = await contentIndex.getIntegrationRegistry();
      const entry = registry.integrations.find((e) => e.id === id);
      if (!entry) return;
      IntegrationSetupPanel.show(context, entry, provider.statusOf(entry.id), () => provider.refresh(), log);
    }),
  );
  return provider;
}
