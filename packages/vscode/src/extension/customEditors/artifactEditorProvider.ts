import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  exportArtifact,
  findCollectionArtifacts,
  formatExportResult,
  liveShareRecords,
  publishProviderLabel,
  readShareRecords,
  findExplorationArtifacts,
  readExplorationPlan,
  discoverTweaks,
  formatTweaksForChat,
  inlineLocalFrames,
  inlineLocalImages,
  rewriteRootValues,
  saveTweakVariant,
  isContractToken,
  injectPreviewBase,
  injectPreviewBridge,
  resolveIncludes,
  injectPreviewErrorReporter,
  localRelativePath,
  injectScriptNonce,
  startStaticServer,
  urlForPath,
  readArtifact,
  readArtifactComments,
  resolveFigmaCaptureAssets,
  createWorkspaceFigmaAssetReader,
  mergeArtifactComments,
  writeFigmaCapture,
  writeArtifactManifest,
  FORMATS,
  getFormat,
  isFluidHtml,
  sortFindings,
  type ArtifactComment,
  type FigmaCaptureDocument,
  type StaticServer,
} from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { OD_TOKENS_CSS, odFontFaceCss } from '../webviews/openDesignTheme';
import { PREVIEW_CHROME_CSS } from '@feimacode/open-design-agent-kit-core/src/preview/chromeCss';
import { getOutputDirectory } from '../../workspace/artifactWriter';
import { getActiveDesignSystemId } from '../../workspace/activeDesignSystem';

export const ARTIFACT_EDITOR_VIEW_TYPE = 'openDesign.artifactEditor';

type CopyTarget = 'email' | 'wechat' | 'notion' | 'newsletter';
const COPY_LABELS: Record<CopyTarget, string> = { email: 'email', wechat: 'WeChat', notion: 'Notion', newsletter: 'newsletter' };
const COPY_DESTINATIONS: Record<CopyTarget, string> = {
  email: "your email tool's HTML editor (send yourself a test first)",
  wechat: 'the WeChat Official Account editor',
  notion: 'a Notion page',
  newsletter: 'your newsletter editor',
};

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

/** The tweaked values from a webview message, as `--name: value` strings only. */
function tweakValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => e[0].startsWith('--') && typeof e[1] === 'string'));
}

/**
 * The custom design system "Apply to design system" writes: the one this
 * design was made with, else the active one — only a custom (user:…) system
 * with a tokens.css; bundled systems are read-only (design D5).
 */
async function resolveTweakDesignSystem(location: { workspaceRoot: string; entryPath: string } | undefined): Promise<{ id: string; name: string; tokensPath: string } | undefined> {
  if (!location) return undefined;
  const artifact = await readArtifact(location).catch(() => null);
  const id = typeof artifact?.manifest?.designSystemId === 'string' ? artifact.manifest.designSystemId : getActiveDesignSystemId();
  if (!id?.startsWith('user:')) return undefined;
  const slug = id.slice('user:'.length);
  const tokensPath = path.posix.join(getOutputDirectory(), 'design-systems', slug, 'tokens.css');
  try {
    await fs.access(path.join(location.workspaceRoot, tokensPath));
  } catch {
    return undefined;
  }
  return { id, name: slug, tokensPath };
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
    const documentDir = vscode.Uri.joinPath(document.uri, '..');
    webviewPanel.webview.options = {
      enableScripts: true,
      // The document's folder and the workspace folders let the preview load
      // the files a design links to relatively (see previewHtml below).
      localResourceRoots: [this.context.extensionUri, documentDir, ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)],
    };
    // One instance of this provider serves every open artifact editor (see
    // supportsMultipleEditorsPerDocument above), so the nonce must be local
    // to this panel, not a shared field — it's baked into this panel's own
    // buildHtml() CSP and must match on every postMessage below for this
    // document's whole lifetime.
    const panelNonce = nonce();
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview, panelNonce);

    const location = resolveEntryPath(document);
    // The preview renders through `srcdoc`, which has no URL of its own, so
    // relative links (a comparison page's `<iframe src="direction.html">`,
    // images, stylesheets) resolve against a preview-only <base> pointing at
    // the document's folder. The WYSIWYG save strips it (data-od-preview-only).
    // A webview can't navigate a frame to a local file, though, so frames of
    // neighbouring designs get their content inlined as srcdoc (each with its
    // own base and nonce).
    const prepareHtml = (html: string, dir: vscode.Uri) =>
      injectScriptNonce(injectPreviewBase(html, `${webviewPanel.webview.asWebviewUri(dir).toString().replace(/\/$/, '')}/`), panelNonce);
    const readImage = async (rel: string) => {
      try {
        return await vscode.workspace.fs.readFile(vscode.Uri.joinPath(documentDir, rel));
      } catch {
        return undefined;
      }
    };
    const readFramed = async (rel: string) => {
      if (!/\.html?$/i.test(rel)) return undefined;
      const uri = vscode.Uri.joinPath(documentDir, rel);
      try {
        return { html: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)), resolvedPath: uri.toString() };
      } catch {
        return undefined;
      }
    };
    // The top document also reports its failed loads and script errors to the
    // preview, which shows them (a dead CDN URL otherwise just renders nothing),
    // and runs the preview bridge Comment, Edit and Figma capture talk to
    // (openspec add-preview-bridge).
    const bridgeCode = await this.previewBridgeCode();
    const previewHtml = async () =>
      injectScriptNonce(
        injectPreviewErrorReporter(
          injectPreviewBridge(
            prepareHtml(
              await inlineLocalFrames(await inlineLocalImages(location ? (await resolveIncludes(document.getText(), document.uri.fsPath, location.workspaceRoot)).html : document.getText(), readImage), readFramed, (html, resolved) => prepareHtml(html, vscode.Uri.joinPath(vscode.Uri.parse(resolved), '..'))),
              documentDir,
            ),
            bridgeCode,
          ),
        ),
        panelNonce,
      );

    // Served preview pilot (openDesign.experimental.servedPreview): View mode
    // loads the design from a loopback server, over a real URL with its own
    // origin, instead of as srcdoc text. Relative files, modules, fetch() and
    // inline handlers then work as in a browser, with none of the shims
    // above. The entry is served from the editor buffer, so unsaved edits
    // show. Comment, Edit and Tweaks still use srcdoc (they read the page's
    // DOM directly, which a cross-origin frame doesn't allow).
    let served: { server: StaticServer; url: string } | undefined;
    const servedUrl = async (): Promise<string | undefined> => {
      if (!location || !vscode.workspace.getConfiguration('openDesign').get<boolean>('experimental.servedPreview', false)) return undefined;
      try {
        if (!served) {
          const server = await startStaticServer(location.workspaceRoot, {
            entryPath: location.entryPath,
            pathToken: randomBytes(16).toString('hex'),
            transformEntry: () => injectPreviewErrorReporter(injectPreviewBridge(document.getText(), bridgeCode)),
          });
          // In a remote window this is a forwarded address the UI can reach.
          const external = (await vscode.env.asExternalUri(vscode.Uri.parse(server.baseUrl))).toString(true);
          served = { server, url: urlForPath(external.endsWith('/') ? external : `${external}/`, location.entryPath) };
          this.log.info(`ArtifactEditorProvider: served preview for ${location.entryPath} at ${server.baseUrl.replace(/[0-9a-f]{32}\/$/, '<token>/')} (external ${external.replace(/[0-9a-f]{32}\/?$/, '<token>/')})`);
        }
        return `${served.url}?v=${document.version}`;
      } catch (err) {
        this.log.warn(`ArtifactEditorProvider: served preview unavailable, using srcdoc: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    };

    // Tweaks panel (openspec add-preview-tweaks): the knobs, plus the custom
    // design system "Apply to design system" would write, when there is one.
    const tweaksInfo = async () => ({ ...discoverTweaks(document.getText()), designSystem: await resolveTweakDesignSystem(location) });

    const sendInit = async () => {
      const comments = location ? await readArtifactComments(location.workspaceRoot, location.entryPath) : [];
      const collection = await resolveCollectionNav(location);
      const shape = await resolveShapeInfo(document.getText(), location);
      webviewPanel.webview.postMessage({ type: 'init', html: await previewHtml(), servedUrl: await servedUrl(), comments, collection, shape, tweaks: await tweaksInfo() });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        const collection = await resolveCollectionNav(location);
        const shape = await resolveShapeInfo(document.getText(), location);
        webviewPanel.webview.postMessage({ type: 'source-updated', html: await previewHtml(), servedUrl: await servedUrl(), collection, shape, tweaks: await tweaksInfo() });
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

    // The comments sidecar changes when the agent resolves comments or a
    // browser preview adds some (openspec add-browser-preview).
    if (location) {
      const commentsWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(path.dirname(path.join(location.workspaceRoot, location.entryPath))), `${path.basename(location.entryPath)}.comments.json`),
      );
      const sendComments = async () => {
        webviewPanel.webview.postMessage({ type: 'comments-updated', comments: await readArtifactComments(location.workspaceRoot, location.entryPath) });
      };
      navSubs.push(commentsWatcher, commentsWatcher.onDidCreate(sendComments), commentsWatcher.onDidChange(sendComments), commentsWatcher.onDidDelete(sendComments));
    }

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message?.type) {
        case 'ready':
          await sendInit();
          break;
        case 'open-local-link': {
          // A link to a neighbouring file (e.g. "Open full size" on a
          // comparison page): the webview can't navigate to it, so open it
          // in its own editor — designs in this preview, anything else as usual.
          const rel = localRelativePath(String(message.href ?? ''));
          if (!rel) break;
          const target = vscode.Uri.joinPath(documentDir, rel);
          try {
            await vscode.workspace.fs.stat(target);
          } catch {
            vscode.window.showWarningMessage(`Open Design: ${rel} doesn't exist next to this design.`);
            break;
          }
          if (/\.html?$/i.test(rel)) await vscode.commands.executeCommand('vscode.openWith', target, ARTIFACT_EDITOR_VIEW_TYPE);
          else await vscode.commands.executeCommand('vscode.open', target);
          break;
        }
        case 'preview-errors-to-chat': {
          const errors = (Array.isArray(message.errors) ? message.errors : []).map(String).slice(0, 10);
          const where = location?.entryPath ?? document.uri.fsPath;
          const query = `The Open Design artifact at "${where}" has errors in the preview, and may render blank:\n\n${errors.map((e: string) => `- ${e}`).join('\n')}\n\nRegister it with register_open_design_artifact if it isn't registered, run check_open_design_artifact on it, and fix every error it reports. If it uses three.js, load it the way the 3d-object skill says (the pinned three@0.160.0 module build through an import map).`;
          await vscode.commands.executeCommand('workbench.action.chat.open', { query, isPartialQuery: true });
          break;
        }
        case 'tweaks-apply': {
          const values = tweakValues(message.values);
          const result = rewriteRootValues(document.getText(), values);
          if (result.changed.length === 0) break;
          this.log.info(`ArtifactEditorProvider: applying tweaks ${result.changed.join(', ')} to ${document.uri.fsPath}`);
          await this.applyPatch(document, result.text);
          if (result.missing.length) vscode.window.showWarningMessage(`Open Design: couldn't apply ${result.missing.join(', ')}: not declared on this design's base :root.`);
          break;
        }
        case 'tweaks-variant': {
          if (!location) {
            vscode.window.showWarningMessage('Open Design: this design must be inside an open workspace folder to save variants of it.');
            break;
          }
          const label = await vscode.window.showInputBox({ title: 'Save as variant', prompt: 'A short label for this variant', placeHolder: 'e.g. warm', validateInput: (v) => (v.trim() ? undefined : 'Enter a label') });
          if (!label?.trim()) break;
          const saved = await saveTweakVariant({ ...location, outputDir: getOutputDirectory(), source: document.getText(), values: tweakValues(message.values), label: label.trim() });
          if (!saved.ok || !saved.entryPath) {
            vscode.window.showWarningMessage(`Open Design: ${saved.error}`);
            break;
          }
          this.log.info(`ArtifactEditorProvider: saved tweak variant ${saved.entryPath}`);
          await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(path.join(location.workspaceRoot, saved.entryPath)), ARTIFACT_EDITOR_VIEW_TYPE);
          break;
        }
        case 'tweaks-to-chat': {
          const values = tweakValues(message.values);
          const where = location?.entryPath ?? document.uri.fsPath;
          const query = message.tokenize
            ? `Tokenize the Open Design artifact at "${where}": move its hard-coded colors, fonts, type sizes, radii and spacing into custom properties on :root (use the design-token contract names, e.g. --bg, --fg, --accent, --font-display, --radius-md, where they fit), and style the page through them, so it can be adjusted in the preview's Tweaks panel. Keep its look unchanged.`
            : formatTweaksForChat(where, values);
          await vscode.commands.executeCommand('workbench.action.chat.open', { query, isPartialQuery: true });
          break;
        }
        case 'tweaks-apply-ds': {
          const ds = await resolveTweakDesignSystem(location);
          if (!ds || !location) break;
          const values = Object.fromEntries(Object.entries(tweakValues(message.values)).filter(([name]) => isContractToken(name)));
          const names = Object.keys(values);
          if (names.length === 0) {
            vscode.window.showInformationMessage('Open Design: none of these tweaks are design-token contract variables, so there is nothing to apply to the design system.');
            break;
          }
          const ok = await vscode.window.showWarningMessage(
            `Apply ${names.join(', ')} to the "${ds.name}" design system? This rewrites its tokens.css, so every design that uses it changes.`,
            { modal: true },
            'Apply to design system',
          );
          if (ok !== 'Apply to design system') break;
          const tokensPath = path.join(location.workspaceRoot, ds.tokensPath);
          const result = rewriteRootValues(await fs.readFile(tokensPath, 'utf8'), values, 'css');
          const uri = vscode.Uri.file(tokensPath);
          const tokensDoc = await vscode.workspace.openTextDocument(uri);
          const edit = new vscode.WorkspaceEdit();
          edit.replace(uri, new vscode.Range(tokensDoc.positionAt(0), tokensDoc.positionAt(tokensDoc.getText().length)), result.text);
          await vscode.workspace.applyEdit(edit);
          await tokensDoc.save();
          this.log.info(`ArtifactEditorProvider: applied ${result.changed.join(', ')} to ${ds.tokensPath}`);
          vscode.window.showInformationMessage(
            `Open Design: updated ${result.changed.length} token(s) in ${ds.tokensPath}.${result.missing.length ? ` Not declared there: ${result.missing.join(', ')}.` : ''}`,
          );
          break;
        }
        case 'apply-patch':
          this.log.info(`ArtifactEditorProvider: applying WYSIWYG patch to ${document.uri.fsPath}`);
          await this.applyPatch(document, message.newSource as string);
          break;
        case 'comments-changed':
          // Only what changed, merged by id: a browser preview or the agent may write the same sidecar.
          if (location) {
            const changed = Array.isArray(message.changed) ? (message.changed as ArtifactComment[]) : [];
            const deletedIds = Array.isArray(message.deletedIds) ? (message.deletedIds as string[]) : [];
            this.log.debug(`ArtifactEditorProvider: saving ${changed.length} changed and ${deletedIds.length} deleted comment(s) for ${location.entryPath}`);
            await mergeArtifactComments(location.workspaceRoot, location.entryPath, changed, deletedIds);
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
          {
            const picked = await vscode.window.showQuickPick(
              [
                { label: 'One component', detail: "Port this page into the app's code, following an existing component", set: false },
                { label: 'A component set', detail: 'Build reusable components and a theme from this design, on MUI (Material 3) or shadcn/ui', set: true },
              ],
              { title: 'Promote to code', placeHolder: 'What should this design become?' },
            );
            if (!picked) break;
            this.log.info(`ArtifactEditorProvider: promoting ${location.entryPath} to app code (${picked.set ? 'component set' : 'one component'})`);
            await vscode.commands.executeCommand('workbench.action.chat.open', {
              query: picked.set
                ? `Use the prepare_open_design_component_library tool to build a reusable component set from the Open Design artifact at "${location.entryPath}" for this app.`
                : `Use the port_open_design_artifact_to_app tool to promote the Open Design artifact at "${location.entryPath}" into this app's real production code.`,
              isPartialQuery: true,
            });
          }
          break;
        case 'copy-for':
          if (!location) {
            vscode.window.showWarningMessage('Open Design: this artifact must be inside an open workspace folder to copy it.');
            break;
          }
          await this.copyFor(location, message.target as CopyTarget, webviewPanel.webview);
          break;
        case 'copy-result':
          await this.copyResult(message as { ok: boolean; target: CopyTarget; file: string; error?: string });
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
      void served?.server.close();
    });
  }

  private bridgeCodePromise: Promise<string> | undefined;

  /** The built in-page preview bridge (dist/webview/bridge.js), read once. */
  private previewBridgeCode(): Promise<string> {
    this.bridgeCodePromise ??= fs.readFile(path.join(this.context.extensionUri.fsPath, 'dist', 'webview', 'bridge.js'), 'utf8').catch((err) => {
      this.log.warn(`ArtifactEditorProvider: preview bridge missing, Comment and Edit will be unavailable: ${err instanceof Error ? err.message : String(err)}`);
      this.bridgeCodePromise = undefined;
      return '';
    });
    return this.bridgeCodePromise;
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
  // "Copy for…" (openspec add-email-and-paste-export): export as an email or a paste fragment, then let the
  // webview put it on the clipboard as rich HTML; copyResult() falls back to the browser if it can't.
  private async copyFor(location: { workspaceRoot: string; entryPath: string }, target: CopyTarget, webview: vscode.Webview): Promise<void> {
    const artifact = await readArtifact(location).catch(() => null);
    if (!artifact?.manifest) {
      vscode.window.showWarningMessage('Open Design: register this artifact first (register_open_design_artifact) to copy it.');
      return;
    }
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Open Design: preparing ${COPY_LABELS[target]} HTML…` },
      () => exportArtifact({ ...location, browserPath, ...(target === 'email' ? { format: 'email' as const } : { format: 'paste' as const, target }) }),
    );
    if (!result.ok || !('inline' in result)) {
      vscode.window.showErrorMessage(`Open Design: couldn't prepare the copy. ${formatExportResult(result)}`);
      return;
    }
    const errors = result.findings.filter((f) => f.severity === 'error').length;
    if (errors > 0) this.log.warn(`ArtifactEditorProvider: ${target} copy has ${errors} preflight error(s): ${formatExportResult(result)}`);
    const file = result.files[0].path;
    const html = await fs.readFile(path.join(location.workspaceRoot, file), 'utf8');
    const text =
      target === 'email' && result.files[1]
        ? await fs.readFile(path.join(location.workspaceRoot, result.files[1].path), 'utf8')
        : html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    webview.postMessage({ type: 'copy-payload', target, file: path.join(location.workspaceRoot, file), html, text });
  }

  private async copyResult(message: { ok: boolean; target: CopyTarget; file: string; error?: string }): Promise<void> {
    if (message.ok) {
      vscode.window.showInformationMessage(`Open Design: copied for ${COPY_LABELS[message.target]}. Paste it into ${COPY_DESTINATIONS[message.target]}.`);
      return;
    }
    this.log.info(`ArtifactEditorProvider: rich clipboard unavailable (${message.error}); opening ${message.file} in the browser`);
    await vscode.env.openExternal(vscode.Uri.file(message.file));
    vscode.window.showInformationMessage(`Open Design: opened the ${COPY_LABELS[message.target]} version in your browser. Select all, copy, and paste it into ${COPY_DESTINATIONS[message.target]}.`);
  }

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
        label: `$(copy) Copy link (${publishProviderLabel(record.provider)})`,
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
    const resolved = await resolveFigmaCaptureAssets(capture, createWorkspaceFigmaAssetReader(location.workspaceRoot, location.entryPath));
    const absSidecar = await writeFigmaCapture(location.workspaceRoot, location.entryPath, resolved);
    const sidecarRel = path.relative(location.workspaceRoot, absSidecar).split(path.sep).join('/');

    const choice = await vscode.window.showInformationMessage(
      `Open Design: Figma capture saved to ${sidecarRel}. Push it with your Figma connection (Copilot runs it after you pick a Figma file), or import it yourself with the "OD Figma Import" plugin.`,
      'Push with Figma connection',
      'Copy JSON',
      'Show Import Plugin',
    );
    if (choice === 'Push with Figma connection') {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `Use the push_open_design_artifact_to_figma tool to push the Open Design artifact at "${location.entryPath}" into Figma, then follow its instructions.`,
        isPartialQuery: true,
      });
    } else if (choice === 'Copy JSON') {
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
      // fetch()/XHR from the artifact: a 3D scene's GLTFLoader reading its
      // model from the design's folder (via the preview <base>), a data: URI,
      // or a CDN-hosted decoder.
      `connect-src ${webview.cspSource} https: data: blob:`,
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
${PREVIEW_CHROME_CSS}
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${panelNonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
