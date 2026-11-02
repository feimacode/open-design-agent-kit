// The preview MCP App's server side (openspec add-mcp-app-preview): the
// `ui://open-design/preview` page, the state its app-only tool returns (the
// design as a standalone page with the preview bridge injected, comments,
// check screenshots), comment writes from the page, and the text every host
// gets from show_open_design_artifact.
import type { JsonRecord } from '../../vendored/artifactManifest';
import * as path from 'node:path';
import { readArtifact } from '../../vendored/artifactCreate';
import { hasIncludes, resolveIncludes } from '../../export/flowIncludes';
import { bundleStandaloneHtml } from '../../vendored/standaloneHtml';
import { injectPreviewBridge, injectPreviewErrorReporter } from '../../content/exampleHtml';
import { listCheckRuns, readCheckRunImage } from '../../export/checkHistory';
import { exportsForKind, PACKAGEABLE_KINDS } from '../../export/exportFormats';
import { workspaceAssetReader } from '../../export/workspaceAssets';
import { isUnaddressed, type ArtifactComment, type ArtifactCommentStatus } from '../../workspace/artifactCommentTypes';
import { mergeArtifactComments, readArtifactComments } from '../../workspace/artifactComments';
import { directionArtifactMap, findExplorationArtifacts, readExplorationPlan } from '../../workspace/explorationStore';
import { isStyleTileSkill } from '../../generation/styleTiles';
import { PREVIEW_CHROME_CSS } from '../chromeCss';
import { campaignShowText } from './mcpAppPickers';
import { MCP_APP_CSS } from '../mcpApp/appCss';
import {
  PREVIEW_APP_BASE_DOMAINS,
  PREVIEW_APP_MAX_HTML_BYTES,
  PREVIEW_APP_MAX_TILE_IMAGE_BYTES,
  type PreviewAppArtifactState,
  type PreviewAppAskImage,
  type PreviewAppCheckImage,
  type PreviewAppExplorationState,
  type ShowTarget,
} from '../mcpApp/protocol';
import { OD_TOKENS_CSS } from '../theme';

/** Formats the page offers as export buttons, in this order, when the kind supports them. */
const EXPORT_BUTTONS = ['png', 'pdf', 'standalone', 'pptx'];

/** The MCP App page: Open Design's tokens, the preview chrome shared with VS Code and the browser preview, and the app script, all inline. */
export function renderPreviewAppPage(appJs: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Open Design preview</title>
<style>
${OD_TOKENS_CSS}
${PREVIEW_CHROME_CSS}
${MCP_APP_CSS}
</style>
</head>
<body>
<div id="root"></div>
<script>${appJs.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

/** The origins (scheme://host[:port]) of http(s) URLs a design still loads at view time. */
export function remoteOrigins(urls: readonly string[]): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    try {
      const u = new URL(url.startsWith('//') ? `https:${url}` : url);
      if (u.protocol === 'https:' || u.protocol === 'http:') out.add(u.origin);
    } catch {
      // Not an absolute URL.
    }
  }
  return [...out];
}

/** The resource's `resourceDomains`: Google Fonts plus every remote origin a shown design needed. */
export function previewAppResourceDomains(seen: Iterable<string> = []): string[] {
  return [...new Set([...PREVIEW_APP_BASE_DOMAINS, ...seen])].sort();
}

function manifestString(manifest: JsonRecord, key: string): string | undefined {
  const v = manifest[key];
  return typeof v === 'string' && v ? v : undefined;
}

async function latestCheckImages(workspaceRoot: string, outputDir: string, entryPath: string, limit = 3): Promise<PreviewAppCheckImage[]> {
  const [run] = await listCheckRuns(workspaceRoot, outputDir, entryPath);
  if (!run) return [];
  const out: PreviewAppCheckImage[] = [];
  for (const img of run.images.slice(0, limit)) {
    const jpg = await readCheckRunImage(workspaceRoot, outputDir, entryPath, run.id, img.file);
    if (jpg) out.push({ label: img.label, src: `data:image/jpeg;base64,${jpg.toString('base64')}` });
  }
  return out;
}

type Packed = { ok: true; html: string; externalDependencies: string[] } | { ok: false; reason: string };

async function packForPreview(workspaceRoot: string, entryPath: string, entryContent: string, kind: string | undefined): Promise<Packed> {
  if (kind && !PACKAGEABLE_KINDS.has(kind)) return { ok: false, reason: `A ${kind} artifact isn't shown inline; this is its latest check screenshot.` };
  try {
    // A flow screen's shared navigation (openspec add-linked-flows) is filled in before inlining.
    const root = path.resolve(workspaceRoot);
    const html = hasIncludes(entryContent) ? (await resolveIncludes(entryContent, path.join(root, entryPath), root)).html : entryContent;
    const bundled = await bundleStandaloneHtml({ entryPath, html, readAsset: workspaceAssetReader(workspaceRoot) });
    const bytes = Buffer.byteLength(bundled.html, 'utf8');
    if (bytes > PREVIEW_APP_MAX_HTML_BYTES) {
      return { ok: false, reason: `The design is ${(bytes / (1024 * 1024)).toFixed(1)} MiB once its files are inlined, too large to show here; this is its latest check screenshot.` };
    }
    return { ok: true, html: bundled.html, externalDependencies: bundled.externalDependencies };
  } catch (err) {
    return { ok: false, reason: `The design couldn't be packaged for the preview (${err instanceof Error ? err.message : String(err)}).` };
  }
}

export type ArtifactPreviewResult =
  | { ok: true; state: PreviewAppArtifactState; externalDependencies: string[] }
  | { ok: false; code: 'not-found' | 'not-registered'; message: string };

/** get_open_design_preview_state for an artifact. `bridgeJs` is the built preview bridge (loadPreviewAssets). */
export async function buildArtifactPreviewState(input: { workspaceRoot: string; outputDir: string; entryPath: string; bridgeJs: string }): Promise<ArtifactPreviewResult> {
  const unregistered = await checkRegistered(input.workspaceRoot, input.entryPath);
  if (!unregistered.ok) return unregistered;
  const { manifest, entryContent } = unregistered;
  const kind = manifestString(manifest, 'kind');
  const [packed, comments, checkImages] = await Promise.all([
    packForPreview(input.workspaceRoot, input.entryPath, entryContent, kind),
    readArtifactComments(input.workspaceRoot, input.entryPath),
    latestCheckImages(input.workspaceRoot, input.outputDir, input.entryPath),
  ]);
  const exportable = (kind ? exportsForKind(kind) : undefined) ?? [];
  const state: PreviewAppArtifactState = {
    view: 'artifact',
    entryPath: input.entryPath,
    title: manifestString(manifest, 'title') ?? input.entryPath,
    kind,
    comments,
    checkImages,
    exports: EXPORT_BUTTONS.filter((f) => exportable.includes(f)),
  };
  if (packed.ok) state.html = injectPreviewErrorReporter(injectPreviewBridge(packed.html, input.bridgeJs));
  else state.fallback = packed.reason;
  return { ok: true, state, externalDependencies: packed.ok ? packed.externalDependencies : [] };
}

async function checkRegistered(
  workspaceRoot: string,
  entryPath: string,
): Promise<{ ok: true; manifest: JsonRecord; entryContent: string } | { ok: false; code: 'not-found' | 'not-registered'; message: string }> {
  const artifact = await readArtifact({ workspaceRoot, entryPath });
  if (!artifact) return { ok: false, code: 'not-found', message: `No artifact found at ${entryPath}. Write it and call register_open_design_artifact first.` };
  if (!artifact.manifest) return { ok: false, code: 'not-registered', message: `${entryPath} isn't registered yet. Call register_open_design_artifact first.` };
  return { ok: true, manifest: artifact.manifest, entryContent: artifact.entryContent };
}

export type ExplorationPreviewResult = { ok: true; state: PreviewAppExplorationState; externalDependencies: string[] } | { ok: false; message: string };

/** get_open_design_preview_state for an exploration: each direction as a view-only page, or its check screenshot when it can't be shown inline. */
export async function buildExplorationPreviewState(input: { workspaceRoot: string; outputDir: string; explorationId: string }): Promise<ExplorationPreviewResult> {
  const plan = await readExplorationPlan(input.workspaceRoot, input.outputDir, input.explorationId);
  if (!plan) return { ok: false, message: `No exploration "${input.explorationId}" found. prepare_open_design_exploration starts one.` };
  const byDirection = directionArtifactMap(await findExplorationArtifacts(input.workspaceRoot, input.outputDir, input.explorationId, plan));
  const external = new Set<string>();
  const directions = await Promise.all(
    plan.directions.map(async (d) => {
      const artifact = byDirection.get(d.id);
      const direction: PreviewAppExplorationState['directions'][number] = { id: d.id, label: d.label, summary: d.summary };
      if (!artifact) return direction;
      direction.entryPath = artifact.entryPath;
      direction.title = artifact.title;
      const read = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath: artifact.entryPath });
      const kind = read?.manifest ? manifestString(read.manifest, 'kind') : undefined;
      const packed = read ? await packForPreview(input.workspaceRoot, artifact.entryPath, read.entryContent, kind) : undefined;
      if (packed?.ok) {
        direction.html = packed.html;
        packed.externalDependencies.forEach((u) => external.add(u));
      } else {
        direction.image = (await latestCheckImages(input.workspaceRoot, input.outputDir, artifact.entryPath, 1))[0]?.src;
      }
      return direction;
    }),
  );
  return {
    ok: true,
    state: { view: 'exploration', explorationId: plan.explorationId, title: plan.title, chosenDirectionId: plan.chosen?.directionId, ...(isStyleTileSkill(plan.skillId) ? { styleTiles: true } : {}), directions },
    externalDependencies: [...external],
  };
}

/**
 * An ask-view option picture for `artifact:<entryPath>` or `checkRun:<entryPath>[#<runId>]`:
 * the run's first screenshot (the latest run when no id is given), capped like
 * a campaign tile; an artifact with no screenshot shows its page instead.
 */
export async function buildArtifactAskImage(input: { workspaceRoot: string; outputDir: string; imageRef: string; entryPath: string; runId?: string; pageFallback: boolean }): Promise<PreviewAppAskImage> {
  const out: PreviewAppAskImage = { imageRef: input.imageRef };
  const registered = await checkRegistered(input.workspaceRoot, input.entryPath);
  if (!registered.ok) return { ...out, fallback: registered.message };
  const runs = await listCheckRuns(input.workspaceRoot, input.outputDir, input.entryPath);
  const run = input.runId ? runs.find((r) => r.id === input.runId) : runs[0];
  const first = run?.images[0];
  const jpg = run && first ? await readCheckRunImage(input.workspaceRoot, input.outputDir, input.entryPath, run.id, first.file) : undefined;
  if (jpg && jpg.length <= PREVIEW_APP_MAX_TILE_IMAGE_BYTES) return { ...out, image: `data:image/jpeg;base64,${jpg.toString('base64')}` };
  if (!input.pageFallback) return { ...out, fallback: run ? 'The screenshot is too large to show here.' : `No check run${input.runId ? ` "${input.runId}"` : ''} for ${input.entryPath}.` };
  const packed = await packForPreview(input.workspaceRoot, input.entryPath, registered.entryContent, manifestString(registered.manifest, 'kind'));
  return packed.ok ? { ...out, html: packed.html } : { ...out, fallback: packed.reason };
}

export type ShowResult = { ok: true; target: ShowTarget; text: string } | { ok: false; text: string };

/** show_open_design_artifact's target and the text every host gets (title, path, open comments; the browser-preview hint when the host can't render the app). */
export async function prepareShow(input: { workspaceRoot: string; outputDir: string; entryPath?: string; explorationId?: string; campaign?: boolean; hostRendersApp: boolean }): Promise<ShowResult> {
  const hint = input.hostRendersApp ? '' : '\n\nThis host doesn\'t show MCP Apps inline. Call open_open_design_preview to show it in a live browser preview instead.';
  if (input.explorationId) {
    const plan = await readExplorationPlan(input.workspaceRoot, input.outputDir, input.explorationId);
    if (!plan) return { ok: false, text: `No exploration "${input.explorationId}" found.` };
    const lines = [`Showing the exploration "${plan.title}" (${plan.explorationId}): ${plan.directions.map((d) => `${d.label} (${d.id})`).join(', ')}.`];
    if (input.hostRendersApp) {
      lines.push(
        isStyleTileSkill(plan.skillId)
          ? 'The user can pick a tile with "Take this one" (confirm the next step with them before calling choose_open_design_direction) or "Use as design system", which asks for choose_open_design_direction with next: "save-design-system" directly.'
          : 'The user can pick a direction with "Take this one"; confirm the next step with them before calling choose_open_design_direction.',
      );
    }
    return { ok: true, target: { view: 'exploration', explorationId: plan.explorationId, title: plan.title }, text: lines.join('\n') + hint };
  }
  if (!input.entryPath) return { ok: false, text: 'Pass entryPath (a registered artifact) or explorationId.' };
  const registered = await checkRegistered(input.workspaceRoot, input.entryPath);
  if (!registered.ok) return { ok: false, text: registered.message };
  const title = manifestString(registered.manifest, 'title') ?? input.entryPath;
  if (input.campaign) {
    const lines = [await campaignShowText(input.workspaceRoot, input.entryPath, title)];
    if (input.hostRendersApp) lines.push('On the sheet the user can open a page-type piece, or click "Fix this piece", which posts the tile and its errors here.');
    return { ok: true, target: { view: 'campaign', entryPath: input.entryPath, title }, text: lines.join('\n') + hint };
  }
  const open = (await readArtifactComments(input.workspaceRoot, input.entryPath)).filter(isUnaddressed);
  const lines = [`Showing "${title}" (${input.entryPath}).`];
  if (open.length) {
    lines.push(`Open comments (${open.length}):`, ...open.map((c) => `- ${c.id} [${c.status}] on ${c.text ? `"${c.text}"` : c.selector}: ${c.note}`));
  } else lines.push('No open comments.');
  if (input.hostRendersApp) lines.push('The user can comment on elements inline; "Ask Claude to apply" sends them here.');
  return { ok: true, target: { view: 'artifact', entryPath: input.entryPath, title }, text: lines.join('\n') + hint };
}

const STATUSES: readonly ArtifactCommentStatus[] = ['open', 'sent', 'resolved'];

/** A comment from the page, checked field by field so a malformed one never reaches the sidecar. */
export function parseCommentFromApp(value: unknown): ArtifactComment | string {
  if (!value || typeof value !== 'object') return 'comment must be an object.';
  const c = value as Record<string, unknown>;
  for (const key of ['id', 'selector', 'note', 'createdAt', 'updatedAt'] as const) {
    if (typeof c[key] !== 'string' || !(c[key] as string)) return `comment.${key} must be a non-empty string.`;
  }
  if (!/^[\w-]{1,64}$/.test(c.id as string)) return 'comment.id may only hold letters, digits, "-" and "_".';
  if (!STATUSES.includes(c.status as ArtifactCommentStatus)) return `comment.status must be one of ${STATUSES.join(', ')}.`;
  const out: ArtifactComment = {
    id: c.id as string,
    selector: c.selector as string,
    htmlHint: typeof c.htmlHint === 'string' ? c.htmlHint : '',
    note: c.note as string,
    status: c.status as ArtifactCommentStatus,
    createdAt: c.createdAt as string,
    updatedAt: c.updatedAt as string,
    host: c.host === 'vscode' || c.host === 'browser' ? c.host : 'mcp-app',
  };
  if (typeof c.elementId === 'string' && c.elementId) out.elementId = c.elementId;
  if (typeof c.text === 'string' && c.text) out.text = c.text.slice(0, 120);
  const rect = c.rect as Record<string, unknown> | undefined;
  if (rect && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(rect[k]))) {
    out.rect = { x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number };
  }
  const viewport = c.viewport as Record<string, unknown> | undefined;
  if (viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)) out.viewport = { width: viewport.width as number, height: viewport.height as number };
  return out;
}

/** save_open_design_comment: creates or edits one comment (merged by id, as the browser preview does), or deletes one. Returns the sidecar's comments. */
export async function saveCommentFromApp(input: { workspaceRoot: string; entryPath: string; comment?: unknown; deleteId?: string }): Promise<{ ok: true; comments: ArtifactComment[] } | { ok: false; message: string }> {
  const registered = await checkRegistered(input.workspaceRoot, input.entryPath);
  if (!registered.ok) return { ok: false, message: registered.message };
  if (input.comment === undefined && !input.deleteId) return { ok: false, message: 'Pass comment (to create or edit) or deleteId.' };
  let changed: ArtifactComment[] = [];
  if (input.comment !== undefined) {
    const parsed = parseCommentFromApp(input.comment);
    if (typeof parsed === 'string') return { ok: false, message: parsed };
    changed = [parsed];
  }
  const comments = await mergeArtifactComments(input.workspaceRoot, input.entryPath, changed, input.deleteId ? [input.deleteId] : []);
  return { ok: true, comments };
}
