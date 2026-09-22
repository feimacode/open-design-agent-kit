import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  injectScriptNonce,
  readArtifactComments,
  resolveFigmaCaptureAssets,
  writeArtifactComments,
  writeFigmaCapture,
  type ArtifactComment,
  type FigmaCaptureAssetReader,
  type FigmaCaptureDocument,
} from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { OD_TOKENS_CSS, odFontFaceCss } from '../webviews/openDesignTheme';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

// Local-file-only, same posture as every image the artifact itself was
// already allowed to reference: resolved relative to the entry file's own
// directory (the same convention register_open_design_artifact's
// supportingFiles already uses), never fetched remotely — a remote http(s)
// image fill is simply dropped, matching the plugin's own documented
// "unresolvable fill is dropped, not aborted" posture.
function createFigmaAssetReader(workspaceRoot: string, entryPath: string): FigmaCaptureAssetReader {
  const entryDir = path.dirname(entryPath);
  return {
    async read(reference: string) {
      if (/^https?:\/\//i.test(reference)) return undefined;
      const mimeType = MIME_BY_EXT[path.extname(reference).toLowerCase()];
      if (!mimeType) return undefined;
      try {
        const abs = path.join(workspaceRoot, entryDir, reference);
        const rel = path.relative(workspaceRoot, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
        const bytes = await fs.readFile(abs);
        return { base64: bytes.toString('base64'), mimeType };
      } catch {
        return undefined;
      }
    },
  };
}

export const ARTIFACT_EDITOR_VIEW_TYPE = 'openDesign.artifactEditor';

function nonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

function resolveEntryPath(document: vscode.TextDocument): { workspaceRoot: string; entryPath: string } | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) return undefined;
  const workspaceRoot = folder.uri.fsPath;
  const entryPath = path.relative(workspaceRoot, document.uri.fsPath).split(path.sep).join('/');
  return { workspaceRoot, entryPath };
}

function formatCommentsForChat(comments: ArtifactComment[]): string {
  const items = comments
    .map((c, i) => `${i + 1}. On \`${c.selector || c.elementId || 'unknown element'}\` (${c.htmlHint}): ${c.note}`)
    .join('\n');
  return `Apply these OpenDesign preview comments. Change ONLY the elements identified below; leave everything else as-is:\n\n${items}\n`;
}

export class ArtifactEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: ILogService,
  ) {}

  static register(context: vscode.ExtensionContext, log: ILogService): vscode.Disposable {
    const provider = new ArtifactEditorProvider(context, log);
    return vscode.window.registerCustomEditorProvider(ARTIFACT_EDITOR_VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    });
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.log.info(`ArtifactEditorProvider: opened ${document.uri.fsPath}`);
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    // One instance of this provider serves every open artifact editor (see
    // supportsMultipleEditorsPerDocument above), so the nonce must be local
    // to this panel, not a shared field — it's baked into this panel's own
    // buildHtml() CSP and must match on every postMessage below for this
    // document's whole lifetime.
    const panelNonce = nonce();
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview, panelNonce);

    const location = resolveEntryPath(document);

    const sendInit = async () => {
      const comments = location ? await readArtifactComments(location.workspaceRoot, location.entryPath) : [];
      webviewPanel.webview.postMessage({ type: 'init', html: injectScriptNonce(document.getText(), panelNonce), comments });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({ type: 'source-updated', html: injectScriptNonce(document.getText(), panelNonce) });
      }
    });

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message?.type) {
        case 'ready':
          await sendInit();
          break;
        case 'apply-patch':
          this.log.info(`ArtifactEditorProvider: applying WYSIWYG patch to ${document.uri.fsPath}`);
          await this.applyPatch(document, message.newSource as string);
          break;
        case 'comments-changed':
          if (location) {
            this.log.debug(`ArtifactEditorProvider: saving ${(message.comments as ArtifactComment[]).length} comment(s) for ${location.entryPath}`);
            await writeArtifactComments(location.workspaceRoot, location.entryPath, message.comments as ArtifactComment[]);
          }
          break;
        case 'send-comments-to-chat':
          this.log.info(`ArtifactEditorProvider: sending ${(message.comments as ArtifactComment[]).length} comment(s) to chat`);
          await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: formatCommentsForChat(message.comments as ArtifactComment[]),
            isPartialQuery: true,
          });
          break;
        case 'promote-to-app-code':
          if (!location) {
            this.log.warn(`ArtifactEditorProvider: cannot promote ${document.uri.fsPath} — it is outside any open workspace folder`);
            vscode.window.showWarningMessage('OpenDesign: this artifact must be inside an open workspace folder to promote it to app code.');
            break;
          }
          this.log.info(`ArtifactEditorProvider: promoting ${location.entryPath} to app code`);
          await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `Use the port_open_design_artifact_to_app tool to promote the OpenDesign artifact at "${location.entryPath}" into this app's real production code.`,
            isPartialQuery: true,
          });
          break;
        case 'figma-capture':
          if (!location) {
            this.log.warn(`ArtifactEditorProvider: cannot push ${document.uri.fsPath} to Figma — it is outside any open workspace folder`);
            vscode.window.showWarningMessage('OpenDesign: this artifact must be inside an open workspace folder to push it to Figma.');
            break;
          }
          this.log.info(`ArtifactEditorProvider: pushing ${location.entryPath} to Figma${message.truncated ? ' (capture truncated at the node cap)' : ''}`);
          await this.pushToFigma(location, message.capture as FigmaCaptureDocument);
          break;
        default:
          this.log.warn(`Artifact editor received unknown message type: ${message?.type}`);
      }
    });

    webviewPanel.onDidDispose(() => {
      this.log.debug(`ArtifactEditorProvider: closed ${document.uri.fsPath}`);
      changeSub.dispose();
      messageSub.dispose();
    });
  }

  private async applyPatch(document: vscode.TextDocument, newSource: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(document.uri, fullRange, newSource);
    await vscode.workspace.applyEdit(edit);
  }

  private async pushToFigma(location: { workspaceRoot: string; entryPath: string }, capture: FigmaCaptureDocument): Promise<void> {
    const resolved = await resolveFigmaCaptureAssets(capture, createFigmaAssetReader(location.workspaceRoot, location.entryPath));
    const absSidecar = await writeFigmaCapture(location.workspaceRoot, location.entryPath, resolved);
    const sidecarRel = path.relative(location.workspaceRoot, absSidecar).split(path.sep).join('/');

    const choice = await vscode.window.showInformationMessage(
      `OpenDesign: Figma capture saved to ${sidecarRel}. Import it in Figma desktop via the vendored "OD Figma Import" plugin (Plugins → Development → Import plugin from manifest…, one-time setup).`,
      'Copy JSON',
      'Show Import Plugin',
    );
    if (choice === 'Copy JSON') {
      await vscode.env.clipboard.writeText(JSON.stringify(resolved));
      vscode.window.showInformationMessage('OpenDesign: capture JSON copied to clipboard — paste it into the "OD Figma Import" plugin window.');
    } else if (choice === 'Show Import Plugin') {
      await vscode.commands.executeCommand('openDesign.revealFigmaPlugin');
    }
  }

  private buildHtml(webview: vscode.Webview, panelNonce: string): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js'));
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: https:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      // 'nonce-<panelNonce>' + 'strict-dynamic' (not 'unsafe-inline'): the
      // artifact preview iframe's `srcdoc` inherits this CSP, and a
      // generated artifact's own inline <script> could be a `type="module"`
      // (never covered by 'unsafe-inline') or import from an external CDN
      // inside a script we've authorized — 'strict-dynamic' extends that
      // trust to what an authorized script itself loads, regardless of
      // host. resolveCustomTextEditor() stamps this exact nonce onto every
      // <script> tag via injectScriptNonce() before posting document text —
      // see src/webview/main.ts's `iframe.srcdoc`.
      `script-src 'nonce-${panelNonce}' 'strict-dynamic'`,
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

  /* FileViewer's own toolbar is deliberately flat — no border, no blur
     ("nothing scrolls under this bar... a glass film served no function").
     A hairline bottom border is kept here since, unlike open-design's own
     multi-panel app shell, this webview has no other visual seam separating
     it from VS Code's chrome above it. */
  .od-toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 14px; min-height: 44px; background: var(--od-bg); border-bottom: 1px solid var(--od-border-soft); }
  .od-mode-btn { }
  .od-toolbar-spacer { flex: 1; }
  .od-stage { position: relative; flex: 1; min-height: 0; }
  .od-preview { width: 100%; height: 100%; border: none; background: white; }
  .od-pins { position: fixed; inset: 0; pointer-events: none; }

  /* Hover/selection highlight, ported from open-design's own comment-mode
     overlay (apps/web/src/runtime/srcdoc.ts's injectSelectionBridge +
     apps/web/src/styles/viewer/core.css's .comment-target-overlay): a
     single positioned box per state, hover thin, selection thick, same
     blue accent + translucent fill. */
  .od-hover-box, .od-select-box { position: absolute; box-sizing: border-box; border-radius: 2px; pointer-events: none; }
  .od-hover-box { border: 1px solid var(--od-blue); background: color-mix(in srgb, var(--od-blue) 12%, transparent); }
  .od-select-box { border: 2px solid var(--od-blue); background: color-mix(in srgb, var(--od-blue) 16%, transparent); }

  /* Alignment guides for the selected element — a simplified version of
     upstream's edit-mode guide layer (bridge.ts's crosshair reference
     lines), without its live gap/measurement labels between hover and
     selection. */
  .od-guide-line { position: absolute; pointer-events: none; }
  .od-guide-h { height: 0; border-top: 1px dashed color-mix(in srgb, var(--od-blue) 55%, transparent); }
  .od-guide-v { width: 0; border-left: 1px dashed color-mix(in srgb, var(--od-blue) 55%, transparent); }

  /* Comment pin: open-design's actual recipe (viewer/core.css) — a
     42x42 teardrop (round with one squared-off corner), terracotta fill,
     thick white ring, soft shadow. This is open-design's one deliberately
     "hot" accent, reserved specifically for annotations. */
  .od-pin {
    position: absolute; width: 42px; height: 42px; margin-left: -21px; margin-top: -42px;
    border: 3px solid #fff; border-radius: 50% 50% 50% 10px;
    background: var(--od-pin); box-shadow: 0 10px 22px rgba(33, 24, 18, .22);
    cursor: pointer; transition: background 100ms, transform 100ms;
  }
  .od-pin:hover { background: var(--od-pin-hover); transform: translateY(-1px); }
  .od-pin.lost { background: var(--od-text-faint); }

  /* ManualEditPanel's floating variant: glass surface, xlarge radius, soft
     shadow — header/body/footer shape and field density modeled directly
     on open-design's own ManualEditPanel.tsx (a fixed-width floating aside
     with a titlebar, a scrollable field list, and a footer action row). */
  .od-panel { position: absolute; right: 12px; bottom: 12px; width: 340px; max-height: calc(100% - 24px); padding: 0; flex-direction: column; overflow: hidden; }
  .od-panel:not([hidden]) { display: flex; }
  .od-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--od-border-soft); }
  .od-panel-header-title { font-size: 12px; font-weight: 700; color: var(--od-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .od-panel-close { background: none; border: none; color: var(--od-text-muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px; }
  .od-panel-close:hover { color: var(--od-text-strong); }
  .od-panel-body { padding: 10px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .od-panel-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--od-text-faint); margin-top: 10px; }
  .od-panel-section-title:first-child { margin-top: 0; }
  .od-panel label { font-size: 11px; color: var(--od-text-muted); margin-top: 4px; display: block; }
  .od-panel textarea, .od-panel input, .od-panel select { margin-top: 2px; }
  .od-row-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .od-row-quad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .od-row-quad label { text-align: center; }
  .od-color-input { height: 30px; padding: 2px; cursor: pointer; }
  .od-panel-footer { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--od-border-soft); }
  .od-panel-footer .od-spacer { flex: 1; }
  .od-panel-footer button { height: 30px; padding: 0 14px; }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${panelNonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
