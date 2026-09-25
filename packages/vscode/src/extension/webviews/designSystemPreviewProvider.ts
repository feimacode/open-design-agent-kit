import * as vscode from 'vscode';
import {
  designSystemDisplaySummary,
  renderDesignSystemPreviewTab,
  renderSourceView,
  resolveDesignSystemDetailTokens,
  type ContentIndex,
  type DesignSystemPreviewTab,
  type ResolvedDesignSystemTokens,
} from '@feimacode/open-design-agent-kit-core';
import { getActiveDesignSystemId, onActiveDesignSystemChanged, setActiveDesignSystemId } from '../../workspace/activeDesignSystem';
import { openChatWithDesignSystem, openGenerateTokensChat, watchCustomDesignSystems } from '../designSystems/designSystemActions';
import type { ILogService } from '../log/logService';
import { OD_TOKENS_CSS, odFontFaceCss } from './openDesignTheme';

function nonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

const TABS: readonly DesignSystemPreviewTab[] = ['visualize', 'showcase'];

/**
 * Read-only design system preview — the port of upstream Open Design's
 * design-system preview modal, cut down to two tabs (Visualize, Showcase)
 * plus a DESIGN.md | tokens.css source side panel. Same singleton-panel
 * shape as ExamplePreviewProvider: one panel re-targeted per open, a
 * `ready` handshake, and every piece of HTML generated here in the host
 * (core's renderers) and posted as a string — nothing is ever written to the
 * workspace, and no daemon, MCP server, or network is involved. Tab HTML is
 * rendered lazily on first view and memoized until the design system's
 * DESIGN.md or tokens.css changes on disk (custom systems only), so an open
 * preview updates live while the model writes a tokens.css.
 */
export class DesignSystemPreviewProvider {
  private static instance: DesignSystemPreviewProvider | undefined;

  static show(context: vscode.ExtensionContext, contentIndex: ContentIndex, designSystemId: string, log: ILogService): void {
    log.info(`DesignSystemPreviewProvider: showing ${designSystemId}`);
    if (DesignSystemPreviewProvider.instance) {
      DesignSystemPreviewProvider.instance.panel.reveal();
      void DesignSystemPreviewProvider.instance.load(designSystemId);
      return;
    }
    const panel = vscode.window.createWebviewPanel('openDesign.designSystemPreview', 'Design System Preview', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    });
    DesignSystemPreviewProvider.instance = new DesignSystemPreviewProvider(context, panel, contentIndex, designSystemId, log);
  }

  private readonly panelNonce = nonce();
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private currentId: string;
  // Bumped on every (re)load, so a tab response computed for a previous
  // design system or a previous version of its files is ignored by the webview.
  private version = 0;
  private resolved: ResolvedDesignSystemTokens | undefined;
  private readonly tabCache = new Map<DesignSystemPreviewTab, string>();

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly contentIndex: ContentIndex,
    initialId: string,
    private readonly log: ILogService,
  ) {
    this.currentId = initialId;
    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message) => void this.onMessage(message)),
      onActiveDesignSystemChanged(() => this.postActive()),
      watchCustomDesignSystems((id) => {
        if (id === this.currentId) {
          this.log.debug(`DesignSystemPreviewProvider: ${id} changed on disk, re-rendering`);
          void this.load(id);
        }
      }),
    );
    this.panel.onDidDispose(() => {
      this.log.debug('DesignSystemPreviewProvider: disposed');
      DesignSystemPreviewProvider.instance = undefined;
      for (const d of this.disposables) d.dispose();
    });
  }

  private async onMessage(message: { type?: string; tab?: string; version?: number }): Promise<void> {
    switch (message?.type) {
      case 'ready':
        this.ready = true;
        await this.load(this.currentId);
        break;
      case 'tab':
        if (message.version === this.version && TABS.includes(message.tab as DesignSystemPreviewTab)) {
          await this.postTab(message.tab as DesignSystemPreviewTab);
        }
        break;
      case 'setActive':
        await setActiveDesignSystemId(this.currentId);
        this.log.info(`DesignSystemPreviewProvider: set active design system to ${this.currentId}`);
        break;
      case 'useInChat': {
        const ds = await this.contentIndex.getDesignSystem(this.currentId);
        await openChatWithDesignSystem(this.currentId, ds?.name ?? this.currentId);
        break;
      }
      case 'generateTokens': {
        const ds = await this.contentIndex.getDesignSystem(this.currentId);
        await openGenerateTokensChat(this.currentId, ds?.name ?? this.currentId);
        break;
      }
    }
  }

  private async load(id: string): Promise<void> {
    this.currentId = id;
    this.version++;
    this.tabCache.clear();
    this.resolved = undefined;
    if (!this.ready) return; // 'ready' will call load() again.

    const ds = await this.contentIndex.getDesignSystem(id);
    if (!ds) {
      this.panel.title = 'Design System Preview';
      void this.panel.webview.postMessage({ type: 'missing', id, version: this.version });
      return;
    }
    this.panel.title = ds.name;
    try {
      this.resolved = resolveDesignSystemDetailTokens(ds);
    } catch (err) {
      this.log.error(err, `DesignSystemPreviewProvider: failed to resolve tokens for ${id}`);
    }
    void this.panel.webview.postMessage({
      type: 'load',
      version: this.version,
      id,
      name: ds.name,
      subtitle: designSystemDisplaySummary(ds) || ds.category || '',
      custom: ds.source === 'user',
      active: getActiveDesignSystemId() === id,
      approximated: this.resolved?.approximated ?? !ds.hasTokens,
      designMdHtml: renderSourceView(ds.body, 'markdown'),
      tokensCssHtml: ds.tokensCss !== undefined ? renderSourceView(ds.tokensCss, 'css') : null,
    });
  }

  private async postTab(tab: DesignSystemPreviewTab): Promise<void> {
    const version = this.version;
    let html = this.tabCache.get(tab);
    if (html === undefined) {
      const ds = await this.contentIndex.getDesignSystem(this.currentId);
      if (!ds || version !== this.version) return;
      try {
        html = renderDesignSystemPreviewTab(ds, tab, this.resolved ?? resolveDesignSystemDetailTokens(ds));
      } catch (err) {
        this.log.error(err, `DesignSystemPreviewProvider: failed to render ${tab} for ${this.currentId}`);
        html = '';
      }
      this.tabCache.set(tab, html);
    }
    void this.panel.webview.postMessage({ type: 'tabHtml', version, tab, html });
  }

  private postActive(): void {
    if (!this.ready) return;
    void this.panel.webview.postMessage({ type: 'active', active: getActiveDesignSystemId() === this.currentId });
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'designSystem.js'));
    // Tab content is generated by core (DESIGN.md/tokens-derived, escaped)
    // and shown in `sandbox=""` srcdoc frames, which inherit this CSP: no
    // script runs in them at all, and with no img/font/connect sources
    // nothing in them can load a resource either. Inline styles are what
    // those documents are made of.
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${this.panelNonce}'`,
      `frame-src 'self' about:`,
    ].join('; ');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
${odFontFaceCss(webview, this.context.extensionUri)}
${OD_TOKENS_CSS}

  html, body { height: 100%; margin: 0; }
  #root { display: flex; flex-direction: column; height: 100%; background: var(--od-bg); color: var(--od-text); }
  .ds-header { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--od-border-soft); }
  .ds-heading { flex: 1; min-width: 0; }
  .ds-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--od-text-strong); }
  .ds-subtitle { font-size: 12px; color: var(--od-text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ds-tabs { display: flex; gap: 2px; padding: 3px; background: var(--od-bg-subtle); border-radius: var(--od-radius-pill); }
  .ds-tabs .od-tab { border-radius: var(--od-radius-pill); }
  .ds-actions { display: flex; gap: 8px; }
  .ds-actions .od-btn { height: 30px; padding: 0 12px; font-size: 12px; }
  .ds-notice { display: flex; align-items: center; gap: 12px; padding: 8px 18px; background: #fff8e6; border-bottom: 1px solid #f3e2b3; font-size: 12px; color: #6b5200; }
  .ds-notice[hidden] { display: none; }
  .ds-notice span { flex: 1; }
  .ds-body { flex: 1; display: flex; min-height: 0; }
  .ds-stage { flex: 1; position: relative; min-width: 0; }
  .ds-stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; background: #fff; }
  .ds-empty { padding: 24px; text-align: center; color: var(--od-text-soft); }
  .ds-toggle { width: 14px; border: none; border-left: 1px solid var(--od-border-soft); background: var(--od-bg-panel); color: var(--od-text-soft); cursor: pointer; padding: 0; font-size: 10px; }
  .ds-side { width: 38%; max-width: 560px; min-width: 260px; display: flex; flex-direction: column; border-left: 1px solid var(--od-border-soft); background: var(--od-bg-panel); }
  .ds-side[hidden] { display: none; }
  .ds-side-switch { display: flex; gap: 2px; padding: 8px 12px; border-bottom: 1px solid var(--od-border-soft); }
  .ds-side-switch .od-tab[hidden] { display: none; }
  .ds-source { flex: 1; overflow: auto; padding: 12px 16px; }
  .design-spec-pre { margin: 0; font: 12px/1.6 ui-monospace, "SF Mono", Menlo, monospace; white-space: pre-wrap; word-break: break-word; color: var(--od-text); }
  .design-spec-line.is-h1, .design-spec-line.is-h2 { color: #1a74ff; font-weight: 700; }
  .design-spec-line.is-h3, .design-spec-line.is-h4 { color: #0f8a8a; font-weight: 700; }
  .design-spec-line.is-quote, .design-spec-line.is-comment { color: var(--od-text-soft); font-style: italic; }
  .design-spec-line.is-table, .design-spec-line.is-fence { color: var(--od-text-muted); }
  .design-spec-line.is-selector { color: #8a3ffc; font-weight: 600; }
  .md-tk-bold { font-weight: 700; color: var(--od-text-strong); }
  .md-tk-em { font-style: italic; }
  .md-tk-code { background: var(--od-bg-subtle); border-radius: 3px; padding: 0 3px; }
  .css-tk-name { color: #0f8a8a; }
  .md-tk-color-swatch { display: inline-block; width: 9px; height: 9px; margin-right: 4px; border-radius: 2px; border: 1px solid rgba(0,0,0,.15); vertical-align: 0; }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${this.panelNonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
