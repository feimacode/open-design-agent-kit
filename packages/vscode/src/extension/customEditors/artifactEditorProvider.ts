import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  exportArtifact,
  findCollectionArtifacts,
  formatExportResult,
  liveShareRecords,
  PUBLISH_RECIPES,
  readShareRecords,
  findExplorationArtifacts,
  readExplorationPlan,
  injectScriptNonce,
  readArtifact,
  readArtifactComments,
  resolveFigmaCaptureAssets,
  writeArtifactComments,
  writeFigmaCapture,
  writeArtifactManifest,
  FORMATS,
  getFormat,
  isFluidHtml,
  sortFindings,
  type ArtifactComment,
  type FigmaCaptureAssetReader,
  type FigmaCaptureDocument,
} from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { OD_TOKENS_CSS, odFontFaceCss } from '../webviews/openDesignTheme';
import { getOutputDirectory } from '../../workspace/artifactWriter';

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
  return `Apply these Open Design preview comments. Change ONLY the elements identified below; leave everything else as-is:\n\n${items}\n`;
}

interface CollectionNavInfo {
  kind: 'Screen' | 'Direction';
  index: number;
  total: number;
  title: string;
  prevEntryPath?: string;
  nextEntryPath?: string;
}

/**
 * Previous/next navigation between an artifact's siblings: the screens of a
 * collection, or the directions of an exploration (plan order, registered
 * sketches only). Live-derived, never cached — mirrors this project's
 * "always re-scan" posture for workspace-generated content (see
 * collectionScan.ts). A screen or direction can gain new siblings between
 * opens in the same session.
 */
/** What the preview's Shape switcher needs (fluid-poster-shapes D7): fluidity from the HTML, the default shape, and the catalog. */
interface ShapeInfo {
  fluid: boolean;
  defaultFormat?: string;
  formats: Array<{ id: string; label: string; medium: string; width: number; height: number; unit: string }>;
}

async function resolveShapeInfo(html: string, location: { workspaceRoot: string; entryPath: string } | undefined): Promise<ShapeInfo> {
  const fluid = isFluidHtml(html);
  let defaultFormat: string | undefined;
  if (fluid && location) {
    const artifact = await readArtifact(location).catch(() => null);
    const metadata = artifact?.manifest?.metadata as Record<string, unknown> | undefined;
    if (typeof metadata?.format === 'string' && getFormat(metadata.format)) defaultFormat = metadata.format;
  }
  const formats = Object.values(FORMATS).map((f) => ({ id: f.id, label: f.label, medium: f.medium, width: f.width, height: f.height, unit: f.unit }));
  return { fluid, defaultFormat, formats };
}

async function resolveCollectionNav(location: { workspaceRoot: string; entryPath: string } | undefined): Promise<CollectionNavInfo | undefined> {
  if (!location) return undefined;
  const artifact = await readArtifact({ workspaceRoot: location.workspaceRoot, entryPath: location.entryPath });
  const collectionId = artifact?.manifest?.collectionId;
  if (typeof collectionId === 'string' && collectionId) {
    const collectionName = typeof artifact?.manifest?.collectionName === 'string' ? artifact.manifest.collectionName : collectionId;
    const siblings = await findCollectionArtifacts(location.workspaceRoot, getOutputDirectory(), collectionId);
    return navAmong(siblings.map((s) => s.entryPath), location.entryPath, 'Screen', collectionName);
  }

  const explorationId = artifact?.manifest?.explorationId;
  if (typeof explorationId === 'string' && explorationId && typeof artifact?.manifest?.directionId === 'string') {
    const plan = await readExplorationPlan(location.workspaceRoot, getOutputDirectory(), explorationId);
    const sketches = (await findExplorationArtifacts(location.workspaceRoot, getOutputDirectory(), explorationId, plan)).filter((a) => a.directionId);
    const title = plan?.title ?? explorationId;
    return navAmong(sketches.map((s) => s.entryPath), location.entryPath, 'Direction', title);
  }
  return undefined;
}

function navAmong(entryPaths: string[], current: string, kind: CollectionNavInfo['kind'], title: string): CollectionNavInfo | undefined {
  const index = entryPaths.indexOf(current);
  if (index === -1) return undefined;
  return {
    kind,
    index: index + 1,
    total: entryPaths.length,
    title,
    prevEntryPath: index > 0 ? entryPaths[index - 1] : undefined,
    nextEntryPath: index < entryPaths.length - 1 ? entryPaths[index + 1] : undefined,
  };
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
      const collection = await resolveCollectionNav(location);
      const shape = await resolveShapeInfo(document.getText(), location);
      webviewPanel.webview.postMessage({ type: 'init', html: injectScriptNonce(document.getText(), panelNonce), comments, collection, shape });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        const collection = await resolveCollectionNav(location);
        const shape = await resolveShapeInfo(document.getText(), location);
        webviewPanel.webview.postMessage({ type: 'source-updated', html: injectScriptNonce(document.getText(), panelNonce), collection, shape });
      }
    });

    // The navigation depends on sibling manifests, not this document: a
    // preview opened when its screen/direction was the first one registered
    // would otherwise keep showing "1 of 1" after the others are registered.
    // Sidecars are written with plain fs (see collectionsTreeProvider.ts), so
    // only a filesystem watcher sees them. Also refresh on becoming visible,
    // in case a change landed while the watcher was not delivering events.
    const sendNav = async () => {
      webviewPanel.webview.postMessage({ type: 'nav-updated', collection: await resolveCollectionNav(location) });
    };
    const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/*.artifact.json');
    const navSubs = [
      manifestWatcher,
      manifestWatcher.onDidCreate(sendNav),
      manifestWatcher.onDidChange(sendNav),
      manifestWatcher.onDidDelete(sendNav),
      webviewPanel.onDidChangeViewState((e) => {
        if (e.webviewPanel.visible) void sendNav();
      }),
    ];

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
            vscode.window.showWarningMessage('Open Design: this artifact must be inside an open workspace folder to promote it to app code.');
            break;
          }
          this.log.info(`ArtifactEditorProvider: promoting ${location.entryPath} to app code`);
          await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `Use the port_open_design_artifact_to_app tool to promote the Open Design artifact at "${location.entryPath}" into this app's real production code.`,
            isPartialQuery: true,
          });
          break;
        case 'share':
          if (!location) {
            vscode.window.showWarningMessage('Open Design: this artifact must be inside an open workspace folder to share it.');
            break;
          }
          await this.share(location);
          break;
        case 'share-to-community':
          if (!location) {
            this.log.warn(`ArtifactEditorProvider: cannot share ${document.uri.fsPath} — it is outside any open workspace folder`);
            vscode.window.showWarningMessage('Open Design: this artifact must be inside an open workspace folder to share it to the community.');
            break;
          }
          this.log.info(`ArtifactEditorProvider: sharing ${location.entryPath} to the community`);
          await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `Use the share_open_design_artifact_to_community tool to package the Open Design artifact at "${location.entryPath}" as a new community design, then follow its instructions.`,
            isPartialQuery: true,
          });
          break;
        case 'publish-to-canva':
          if (!location) {
            this.log.warn(`ArtifactEditorProvider: cannot prepare ${document.uri.fsPath} for Canva — it is outside any open workspace folder`);
            vscode.window.showWarningMessage('Open Design: this artifact must be inside an open workspace folder to prepare it for Canva.');
            break;
          }
          this.log.info(`ArtifactEditorProvider: preparing ${location.entryPath} for Canva`);
          await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `Use the publish_open_design_artifact_to_canva tool to prepare the Open Design artifact at "${location.entryPath}" for Canva, then follow its instructions.`,
            isPartialQuery: true,
          });
          break;
        case 'figma-capture':
          if (!location) {
            this.log.warn(`ArtifactEditorProvider: cannot push ${document.uri.fsPath} to Figma — it is outside any open workspace folder`);
            vscode.window.showWarningMessage('Open Design: this artifact must be inside an open workspace folder to push it to Figma.');
            break;
          }
          this.log.info(`ArtifactEditorProvider: pushing ${location.entryPath} to Figma${message.truncated ? ' (capture truncated at the node cap)' : ''}`);
          await this.pushToFigma(location, message.capture as FigmaCaptureDocument);
          break;
        case 'check-shape': {
          if (!location || !getFormat(message.formatId)) break;
          this.log.info(`ArtifactEditorProvider: checking ${location.entryPath} at ${message.formatId}`);
          const result = await exportArtifact({
            workspaceRoot: location.workspaceRoot,
            entryPath: location.entryPath,
            preset: message.formatId as string,
            checkOnly: true,
            browserPath: vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined,
          });
          const payload =
            result.ok && !('output' in result)
              ? { ok: true, findings: sortFindings(result.findings ?? []).map((f) => ({ severity: f.severity, check: f.check, message: f.message })) }
              : { ok: false, error: formatExportResult(result) };
          webviewPanel.webview.postMessage({ type: 'shape-checked', formatId: message.formatId, ...payload });
          break;
        }
        case 'set-default-shape': {
          if (!location || !getFormat(message.formatId)) break;
          const artifact = await readArtifact(location).catch(() => null);
          if (!artifact?.manifest) {
            vscode.window.showWarningMessage('Open Design: register this artifact first (register_open_design_artifact) to give it a default shape.');
            break;
          }
          const metadata = artifact.manifest.metadata && typeof artifact.manifest.metadata === 'object' ? (artifact.manifest.metadata as Record<string, unknown>) : {};
          await writeArtifactManifest({ ...location, artifactManifest: { ...artifact.manifest, metadata: { ...metadata, format: message.formatId } } });
          this.log.info(`ArtifactEditorProvider: default shape of ${location.entryPath} is now ${message.formatId}`);
          webviewPanel.webview.postMessage({ type: 'shape-default-updated', defaultFormat: message.formatId });
          break;
        }
        case 'nav-collection': {
          const nav = await resolveCollectionNav(location);
          const target = message.direction === 'prev' ? nav?.prevEntryPath : nav?.nextEntryPath;
          if (!target || !location) break;
          this.log.info(`ArtifactEditorProvider: navigating collection ${message.direction} from ${location.entryPath} to ${target}`);
          const targetUri = vscode.Uri.file(path.join(location.workspaceRoot, target));
          await vscode.commands.executeCommand('vscode.openWith', targetUri, ARTIFACT_EDITOR_VIEW_TYPE);
          break;
        }
        default:
          this.log.warn(`Artifact editor received unknown message type: ${message?.type}`);
      }
    });

    webviewPanel.onDidDispose(() => {
      this.log.debug(`ArtifactEditorProvider: closed ${document.uri.fsPath}`);
      changeSub.dispose();
      messageSub.dispose();
      for (const sub of navSubs) sub.dispose();
    });
  }

  private async applyPatch(document: vscode.TextDocument, newSource: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(document.uri, fullRange, newSource);
    await vscode.workspace.applyEdit(edit);
  }

  // The Share button: a native quick pick. Download runs here (no chat, no
  // browser needed); publishing only ever opens a chat prefill — the button
  // itself never deploys anything.
  private async share(location: { workspaceRoot: string; entryPath: string }): Promise<void> {
    const artifact = await readArtifact(location).catch(() => null);
    if (!artifact?.manifest) {
      vscode.window.showWarningMessage('Open Design: register this artifact first (register_open_design_artifact) to share it.');
      return;
    }
    type ShareItem = vscode.QuickPickItem & { action: 'download' | 'temporary' | 'own' | 'copy'; url?: string };
    const items: ShareItem[] = [
      { action: 'download', label: '$(desktop-download) Download standalone HTML', detail: 'One self-contained .html file, to attach or send. Nothing goes online.' },
      { action: 'temporary', label: '$(clock) Get a temporary link', detail: 'No account needed; the link lasts about an hour unless you claim it.' },
      { action: 'own', label: '$(globe) Publish to my hosting', detail: 'Netlify, Vercel, Cloudflare Pages or GitHub Pages, with your own login.' },
    ];
    const live = liveShareRecords(readShareRecords(artifact.manifest));
    if (live.length > 0) items.push({ action: 'copy', label: 'Published', kind: vscode.QuickPickItemKind.Separator });
    for (const record of live) {
      items.push({
        action: 'copy',
        url: record.url,
        label: `$(copy) Copy link (${PUBLISH_RECIPES[record.provider].label})`,
        description: record.url,
        detail: record.expiresAt ? `Expires ${new Date(record.expiresAt).toLocaleString()} unless claimed` : undefined,
      });
    }
    const picked = await vscode.window.showQuickPick(items, { title: 'Share this design', placeHolder: 'How do you want to share it?' });
    if (!picked) return;

    if (picked.action === 'copy' && picked.url) {
      await vscode.env.clipboard.writeText(picked.url);
      vscode.window.showInformationMessage(`Copied ${picked.url}`);
      return;
    }
    if (picked.action === 'download') {
      await this.downloadStandalone(location);
      return;
    }
    let provider = '';
    if (picked.action === 'temporary') {
      const host = await vscode.window.showQuickPick(
        [
          { label: 'Netlify', id: 'netlify-temporary', detail: 'Password-protected until claimed; Netlify gives the password.' },
          { label: 'Cloudflare', id: 'cloudflare-temporary', detail: 'Public for 60 minutes unless claimed.' },
        ],
        { title: 'Temporary link', placeHolder: 'Which host?' },
      );
      if (!host) return;
      provider = ` with provider "${host.id}"`;
    }
    this.log.info(`ArtifactEditorProvider: publishing ${location.entryPath}${provider}`);
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: `Use the publish_open_design_artifact tool to publish the Open Design artifact at "${location.entryPath}"${provider}, then follow its instructions.`,
      isPartialQuery: true,
    });
  }

  private async downloadStandalone(location: { workspaceRoot: string; entryPath: string }): Promise<void> {
    const config = vscode.workspace.getConfiguration('openDesign');
    const result = await exportArtifact({ ...location, format: 'standalone', badgeSetting: config.get<boolean>('share.badge', true) });
    if (!result.ok) {
      vscode.window.showErrorMessage(`Open Design: ${formatExportResult(result)}`);
      return;
    }
    const fileName = path.basename(result.output);
    const downloads = path.join(os.homedir(), 'Downloads');
    const defaultDir = await fs.stat(downloads).then((s) => (s.isDirectory() ? downloads : os.homedir()), () => os.homedir());
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, fileName)),
      filters: { HTML: ['html'] },
      title: 'Save standalone HTML',
    });
    if (!target) return;
    await vscode.workspace.fs.copy(vscode.Uri.file(path.join(location.workspaceRoot, result.output)), target, { overwrite: true });
    this.log.info(`ArtifactEditorProvider: saved standalone HTML for ${location.entryPath} to ${target.fsPath}`);
    const warning = result.externalDependencies.length > 0 ? ` It still loads ${result.externalDependencies.length} file(s) from the internet (e.g. web fonts).` : '';
    const action = await vscode.window.showInformationMessage(`Saved ${path.basename(target.fsPath)}.${warning}`, 'Reveal in File Explorer');
    if (action) await vscode.commands.executeCommand('revealFileInOS', target);
  }

  private async pushToFigma(location: { workspaceRoot: string; entryPath: string }, capture: FigmaCaptureDocument): Promise<void> {
    const resolved = await resolveFigmaCaptureAssets(capture, createFigmaAssetReader(location.workspaceRoot, location.entryPath));
    const absSidecar = await writeFigmaCapture(location.workspaceRoot, location.entryPath, resolved);
    const sidecarRel = path.relative(location.workspaceRoot, absSidecar).split(path.sep).join('/');

    const choice = await vscode.window.showInformationMessage(
      `Open Design: Figma capture saved to ${sidecarRel}. Import it in Figma desktop via the vendored "OD Figma Import" plugin (Plugins → Development → Import plugin from manifest…, one-time setup).`,
      'Copy JSON',
      'Show Import Plugin',
    );
    if (choice === 'Copy JSON') {
      await vscode.env.clipboard.writeText(JSON.stringify(resolved));
      vscode.window.showInformationMessage('Open Design: capture JSON copied to clipboard — paste it into the "OD Figma Import" plugin window.');
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
  /* Grouped left to right: mode (segmented) · sibling pager · contextual
     primary (send comments) · output actions (promote, export menu, share
     split). Everything is flex: none except the sibling title, which
     ellipsizes first; then labels collapse to icons via container queries
     instead of wrapping. Every collapsed control keeps its
     title/aria-label. */
  .od-toolbar {
    container-type: inline-size;
    display: flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 44px;
    background: var(--od-bg); border-bottom: 1px solid var(--od-border-soft); white-space: nowrap; overflow: hidden;
  }
  .od-toolbar [hidden] { display: none !important; }
  .od-toolbar .od-btn { height: 28px; padding: 0 10px; font-size: 12px; flex: none; }
  .od-toolbar .od-btn-primary { padding: 0 12px; }
  .od-toolbar > .od-toolbar-spacer { flex: 1; min-width: 0; }
  .od-toolbar > * { flex: none; }
  .od-toolbar-actions { display: flex; align-items: center; gap: 6px; }

  .od-pager {
    display: flex; align-items: center; gap: 2px;
    padding-left: 8px; border-left: 1px solid var(--od-border-soft);
  }
  .od-pager-pos { font-size: 12px; color: var(--od-text-strong); font-variant-numeric: tabular-nums; padding: 0 2px; }
  .od-pager-kind { color: var(--od-text-muted); }
  .od-shape { display: flex; align-items: center; gap: 4px; padding-left: 8px; border-left: 1px solid var(--od-border-soft); }
  .od-shape-select { height: 28px; max-width: 220px; font-size: 12px; }
  .od-shape-result { font-size: 12px; }
  .od-zoom-select { height: 28px; width: auto; font-size: 12px; }
  .od-shape-result.od-shape-bad { color: #d23b3b; }
  .od-shape-findings { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.45; }
  .od-shape-finding { margin-bottom: 6px; }
  .od-sev-error b { color: #d23b3b; }
  .od-sev-warning b { color: #c27a00; }
  .od-toolbar > .od-pager-title {
    flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    font-size: 12px; font-weight: 500; color: var(--od-text-muted);
  }

  @container (max-width: 880px) {
    .od-toolbar-actions .od-label, #od-send-comments .od-label { display: none; }
    .od-toolbar-actions .od-btn:not(.od-split-toggle) { padding: 0 8px; }
  }
  @container (max-width: 700px) {
    .od-seg-btn .od-label { display: none; }
    .od-seg-btn { padding: 0 8px; }
  }
  @container (max-width: 640px) {
    .od-toolbar > .od-pager-title, .od-pager-kind { display: none; }
    .od-shape .od-label { display: none; }
  }
  @container (max-width: 480px) {
    .od-toolbar { gap: 4px; padding: 8px; }
    .od-toolbar-actions { gap: 4px; }
    .od-seg-btn { padding: 0 6px; }
    #od-export .od-icon:last-child { display: none; }
  }
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
