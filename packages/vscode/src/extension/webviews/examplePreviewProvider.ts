import * as vscode from 'vscode';
import { injectScriptNonce, loadExampleHtml, resolveContentRoot, type ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { remixAndOpen } from '../commands/remixAndOpen';
import type { ILogService } from '../log/logService';
import { OD_TOKENS_CSS, odFontFaceCss } from './openDesignTheme';

function nonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

/**
 * Read-only preview of a vendored example — the "browse/view" half of
 * browse-then-remix. Deliberately separate from ArtifactEditorProvider,
 * which is for real, registered workspace artifacts: previewing an example
 * MUST NOT write anything to the workspace. Content is read once from this
 * extension's own bundled assets and handed to the webview as a plain
 * string over postMessage — never through `asWebviewUri` — so opening a
 * preview never touches disk outside the extension's own install
 * directory. Remixing (the actual file copy into the workspace) stays a
 * separate, explicit action available from a button in this panel.
 */
export class ExamplePreviewProvider {
  private static instance: ExamplePreviewProvider | undefined;
  // Fixed for the panel's lifetime: it's baked into buildHtml()'s CSP meta
  // tag once, and every later loadExample() must inject this same value
  // into the example HTML it posts, or the CSP's nonce check won't match.
  private readonly panelNonce = nonce();

  static show(
    context: vscode.ExtensionContext,
    contentIndex: ContentIndex,
    assetsRoot: string,
    skillId: string,
    log: ILogService,
    communityContentDir?: string,
  ): void {
    log.info(`ExamplePreviewProvider: showing ${skillId}`);
    if (ExamplePreviewProvider.instance) {
      // The webview already sent 'ready' in a prior activation, so it's
      // safe to post immediately — no race with script load.
      ExamplePreviewProvider.instance.panel.reveal();
      ExamplePreviewProvider.instance.loadExample(skillId);
      return;
    }

    const panel = vscode.window.createWebviewPanel('openDesign.examplePreview', 'OpenDesign Preview', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    });

    ExamplePreviewProvider.instance = new ExamplePreviewProvider(context, panel, contentIndex, assetsRoot, skillId, log, communityContentDir);
  }

  // Stashed until the webview's own script has loaded and signals 'ready' —
  // posting before then would silently drop the message (no listener
  // attached yet).
  private pendingSkillId: string | undefined;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly contentIndex: ContentIndex,
    private readonly assetsRoot: string,
    initialSkillId: string,
    private readonly log: ILogService,
    private readonly communityContentDir?: string,
  ) {
    this.pendingSkillId = initialSkillId;
    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message?.type) {
        case 'ready':
          if (this.pendingSkillId) {
            await this.loadExample(this.pendingSkillId);
            this.pendingSkillId = undefined;
          }
          break;
        case 'remix':
          await remixAndOpen(this.contentIndex, this.assetsRoot, message.id as string, this.log, this.communityContentDir);
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.log.debug('ExamplePreviewProvider: disposed');
      ExamplePreviewProvider.instance = undefined;
    });
  }

  private async loadExample(skillId: string): Promise<void> {
    const skill = await this.contentIndex.getSkill(skillId);
    if (!skill?.exampleArtifactPath) {
      this.panel.webview.postMessage({ type: 'load', id: skillId, name: skillId, html: '' });
      return;
    }
    this.panel.title = skill.name;
    const root = resolveContentRoot(skill.source, { assetsRoot: this.assetsRoot, communityContentDir: this.communityContentDir });
    let html = '';
    try {
      html = injectScriptNonce(await loadExampleHtml(root, skill.exampleArtifactPath), this.panelNonce);
    } catch (err) {
      // Leave html empty; the webview shows a "no preview" state.
      this.log.error(err, `ExamplePreviewProvider: failed to read example.html for ${skillId}`);
    }
    this.panel.webview.postMessage({ type: 'load', id: skillId, name: skill.name, html, source: skill.source });
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'preview.js'));
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      // 'nonce-<panelNonce>' + 'strict-dynamic' (not 'unsafe-inline'): the
      // preview iframe's `srcdoc` inherits this CSP, and vendored example
      // HTML can contain inline `type="module"` scripts (never covered by
      // 'unsafe-inline') or import from an external CDN inside a script
      // we've authorized — 'strict-dynamic' extends that trust to what an
      // authorized script itself loads, regardless of host. loadExample()
      // stamps this exact nonce onto every <script> tag via
      // injectScriptNonce() before posting it.
      `script-src 'nonce-${this.panelNonce}' 'strict-dynamic'`,
      `frame-src *`,
    ].join('; ');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
${odFontFaceCss(webview, this.context.extensionUri)}
${OD_TOKENS_CSS}

  #root { display: flex; flex-direction: column; height: 100%; }
  /* Same flat, un-blurred toolbar treatment as FileViewer's own top bar. */
  .op-toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; min-height: 44px; background: var(--od-bg); border-bottom: 1px solid var(--od-border-soft); }
  .op-title { font-weight: 600; font-size: 13px; color: var(--od-text-strong); flex: 1; }
  .op-remix-btn { height: 30px; padding: 0 14px; font-size: 12px; }
  .op-stage { flex: 1; position: relative; }
  .op-stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; background: white; }
  .op-empty { padding: 24px; text-align: center; color: var(--od-text-soft); }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${this.panelNonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
