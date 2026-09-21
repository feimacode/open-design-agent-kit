import * as vscode from 'vscode';
import { injectScriptNonce, loadExampleHtml, type ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { remixAndOpen } from '../commands/remixAndOpen';
import { chatWithExample } from '../commands/chatWithExample';
import type { ILogService } from '../log/logService';
import { ExamplePreviewProvider } from './examplePreviewProvider';
import { OD_TOKENS_CSS, odFontFaceCss } from './openDesignTheme';

function nonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

/**
 * Editor-area WebviewPanel showing a searchable card grid of remixable
 * OpenDesign examples — modeled on feima-copilot-ai-flow's gallery
 * (webview-src/gallery/): a search bar + filter chips above a CSS-grid of
 * cards, as a singleton panel that reveals itself if already open. Built in
 * plain DOM/TS rather than React to stay consistent with this extension's
 * existing (non-React) webview, not because the reference pattern needed
 * React specifically.
 */
export class GalleryGridProvider {
  private static instance: GalleryGridProvider | undefined;
  // Fixed for the panel's lifetime: it's baked into buildHtml()'s CSP meta
  // tag once, and every later sendPreview() must inject this same value
  // into the example HTML it posts, or the CSP's nonce check won't match.
  private readonly panelNonce = nonce();

  static open(context: vscode.ExtensionContext, contentIndex: ContentIndex, assetsRoot: string, log: ILogService): void {
    if (GalleryGridProvider.instance) {
      GalleryGridProvider.instance.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel('openDesign.galleryGrid', 'OpenDesign Gallery', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    });

    GalleryGridProvider.instance = new GalleryGridProvider(context, panel, contentIndex, assetsRoot, log);
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly contentIndex: ContentIndex,
    private readonly assetsRoot: string,
    private readonly log: ILogService,
  ) {
    this.log.info('GalleryGridProvider: opened');
    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      this.log.debug(`GalleryGridProvider: received ${message?.type}`);
      switch (message?.type) {
        case 'ready':
          await this.sendExamples();
          break;
        case 'remix':
          await remixAndOpen(this.contentIndex, this.assetsRoot, message.id as string, this.log);
          break;
        case 'get-preview':
          await this.sendPreview(message.id as string);
          break;
        case 'open-preview':
          ExamplePreviewProvider.show(this.context, this.contentIndex, this.assetsRoot, message.id as string, this.log);
          break;
        case 'open-chat':
          await chatWithExample(this.contentIndex, message.id as string, this.log);
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.log.debug('GalleryGridProvider: disposed');
      GalleryGridProvider.instance = undefined;
    });
  }

  private async sendExamples(): Promise<void> {
    const examples = (await this.contentIndex.listSkills())
      .filter((s) => s.exampleArtifactPath)
      .map((s) => ({ id: s.id, name: s.name, description: s.description, category: s.category, mode: s.mode }));
    this.panel.webview.postMessage({ type: 'update', examples });
  }

  // Thumbnails are requested one card at a time as they scroll into view
  // (see src/webview/gallery/main.ts's IntersectionObserver), and delivered
  // as a plain string over postMessage — read once from this extension's own
  // bundled assets and handed to the webview directly, not through
  // `asWebviewUri`/a resource fetch the webview's browser engine would have
  // to "download" from a vscode-webview-resource: URL.
  private async sendPreview(id: string): Promise<void> {
    const skill = await this.contentIndex.getSkill(id);
    if (!skill?.exampleArtifactPath) {
      this.panel.webview.postMessage({ type: 'preview', id, html: '' });
      return;
    }
    try {
      const html = await loadExampleHtml(this.assetsRoot, skill.exampleArtifactPath);
      this.panel.webview.postMessage({ type: 'preview', id, html: injectScriptNonce(html, this.panelNonce) });
    } catch (err) {
      this.log.error(err, `GalleryGridProvider: failed to read thumbnail for ${id}`);
      this.panel.webview.postMessage({ type: 'preview', id, html: '' });
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'gallery.js'));
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      // 'nonce-<panelNonce>' + 'strict-dynamic' (not 'unsafe-inline'): a
      // `srcdoc` iframe inherits its embedder's CSP, and vendored example
      // HTML can contain inline `type="module"` scripts (CSP's
      // 'unsafe-inline' never covers module scripts, nonce/hash sources are
      // the only way) or import from an external CDN inside a script we've
      // authorized — 'strict-dynamic' extends that trust to what an
      // authorized script itself loads, regardless of host. sendPreview()
      // stamps this exact nonce onto every <script> tag in the example HTML
      // via injectScriptNonce() before posting it.
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

  #root { display: flex; flex-direction: column; height: 100vh; }
  .og-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px; padding: 8px 14px; min-height: 44px; background: var(--od-bg); border-bottom: 1px solid var(--od-border-soft); }
  .og-search { flex: 1; }
  .og-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 0; }
  .og-chip { border: none; cursor: pointer; }

  .og-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; padding: 14px; align-content: start; }

  /* CommunityTemplatePreview's card is deliberately frameless — only the
     inner preview "plate" carries visual weight (hairline border, xl
     radius, subtle background). "A drop shadow with no fill under it would
     read as a shadow around thin air" (plugin-marketplace-demo.css). */
  .og-card { display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: transform 100ms; }
  .og-card:hover { transform: translateY(-1px); }
  .og-thumb {
    position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--od-text) 8%, transparent);
    border-radius: var(--od-radius-xl);
    background: linear-gradient(135deg, color-mix(in srgb, var(--od-brand) 6%, var(--od-bg-panel)), var(--od-bg-panel));
  }
  .og-thumb iframe { position: absolute; top: 0; left: 0; width: 1200px; height: 675px; border: none; pointer-events: none; transform-origin: top left; background: white; }
  .og-thumb-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--od-text-faint); }
  .og-card-title { font-weight: 600; font-size: 13px; color: var(--od-text-strong); }
  .og-card-desc { font-size: 12px; color: var(--od-text-muted); flex: 1; }
  .og-card-meta { display: flex; gap: 6px; flex-wrap: wrap; }
  .og-actions { display: flex; align-items: center; gap: 10px; }
  .og-remix-btn { height: 28px; padding: 0 14px; font-size: 12px; }
  .og-preview-link { background: none; border: none; padding: 0; color: var(--od-text-muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .og-preview-link:hover { color: var(--od-text-strong); }
  .og-empty { padding: 24px; text-align: center; color: var(--od-text-soft); grid-column: 1 / -1; }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${this.panelNonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
