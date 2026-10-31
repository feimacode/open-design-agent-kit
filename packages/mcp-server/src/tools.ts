import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  mergeClaudeLaunchConfig,
  previewRevision,
  galleryDesignSystemUrl,
  galleryHubUrl,
  hasGalleryPage,
  type AssetResolution,
  type DesignProfile,
  CLAUDE_ARTIFACT_PROVIDER,
  latestShareFor,
  readShareRecords,
  type JsonRecord,
  findStaleSources,
  formatSourceRegistration,
  prepareSourceRegistration,
  readSourceTool,
  recordedSources,
  resolveBriefSources,
  chooseDirection as chooseDirectionCore,
  compareExploration as compareExplorationCore,
  prepareExploration as prepareExplorationCore,
  refreshExplorationCompare,
  type ChooseDirectionInput,
  type ExplorationToolContext,
  type PrepareExplorationInput,
  composeCustomDesignSystemInstructions,
  extractSite,
  formatExtractSiteResult,
  type ExtractionTheme,
  composeDesignSystemTokensInstructions,
  composeInstructions,
  composePortToAppInstructions,
  prepareComponentLibrary as prepareComponentLibraryCore,
  copyExampleArtifact,
  detectExistingApp,
  findProjectDesignMd,
  readProductContext,
  writeProjectDesignMd,
  addDiagramRuntime as addDiagramRuntimeCore,
  checkArtifact as checkArtifactCore,
  formatAddDiagramRuntimeResult,
  exportArtifact as exportArtifactCore,
  formatCheckResult,
  listSkillsPayload,
  type ListSkillsInput,
  type PasteTarget,
  type CheckViewport,
  type ReviewView,
  find3dAssets as find3dAssetsCore,
  formatFound3dAssets,
  type Find3dAssetsInput,
  publishArtifact as publishArtifactCore,
  restoreArtifact as restoreArtifactCore,
  exportsForKind,
  formatExportResult,
  loadLocalPrompts,
  renderLocalPrompt,
  extractBrandEvidence,
  findCollectionArtifacts,
  hostOverrideFor,
  readArtifact,
  readUnaddressedComments,
  resolveArtifactComments,
  PreviewSession,
  formatPreviewOutcome,
  loadPreviewAssets,
  buildArtifactPreviewState,
  askFallbackText,
  askShowText,
  buildArtifactAskImage,
  buildExplorationPreviewState,
  designSystemTile,
  parseAskImageRef,
  parseAskSchema,
  type PreviewAppAskImage,
  buildCampaignState,
  buildDesignSystemPreview,
  buildDesignSystemsState,
  buildExamplePreview,
  buildExamplesState,
  designSystemsFallbackText,
  exampleRemoteUrls,
  examplesFallbackText,
  matchingExamples,
  type ExamplePreviewResult,
  prepareShow,
  previewAppResourceDomains,
  remoteOrigins,
  renderPreviewAppPage,
  saveCommentFromApp,
  previewModeFromEnv,
  type PreviewMode,
  resolveActiveDesignSystem,
  resolveCraftSections,
  craftRequirementsFor,
  setActiveDesignSystem,
  suggestCollectionScreenEntryPath,
  suggestTargetComponentPath,
  writeArtifactManifest,
  getFormat,
  unknownFormatError,
  resolveBriefCanvas,
  posterRegistrationMetadata,
  adaptArtifact,
  formatAdaptResult,
  createArtifactQrCode,
  formatQrCodeResult,
  agentFromClientName,
  composePublishCanvaTemplateInstructions,
  uploadToCanva,
  preparePullFigmaFrame,
  prepareFigmaPush,
  formatIntegrations,
  type ListIntegrationsInput,
  type ActiveDesignSystemStore,
  type ContentIndex,
  type ExportFormat,
  type LocalPrompt,
  startJobRun as startJobRunCore,
  finishJobRun as finishJobRunCore,
  formatStartJobRunResult,
  formatFinishJobRunResult,
  type FinishJobRunInput,
  formatPrintHouses,
  publishToShop as publishToShopCore,
  type Shop,
  resolvePrintHouse,
  type PrintHouse,
  validateBriefDecisions,
  validateRegisteredBrief,
  withBriefMetadata,
  loadRecentDesigns,
  recordDesignHistory,
  buildCritiqueInput,
  critiqueSummary,
  prepareCritiqueRecord,
  readCheckRunImage,
  withCritique,
} from '@feimacode/open-design-agent-kit-core';
import { figmaTokenFilePath } from './env';
import type { DesignLayout } from './layout';
import { holdsRegisteredArtifact, writeManagedFile } from './managedWorkspace';

export interface ToolContext {
  contentIndex: ContentIndex;
  store: ActiveDesignSystemStore;
  workspaceRoot: string;
  outputDir: string;
  assetsRoot: string;
  figmaToken?: string;
  /** The client name from the MCP initialize handshake (e.g. "claude-code", "codex-mcp-client"). */
  clientName?: string;
  /** True when the client renders MCP Apps (it lists the io.modelcontextprotocol/ui extension). */
  rendersMcpApps?: boolean;
  /** True in a folder opened by use_open_design_managed_workspace, for a chat with no folder of its own. */
  managedWorkspace?: boolean;
  /** Where designs and exports go (openspec desktop-visible-design-folder); classic when absent. */
  layout?: DesignLayout;
  /** The design folder use_open_design_managed_workspace opened, which the first design there is suggested into. */
  managedDesignSlug?: string;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'artifact';
}

async function suggestEntryPath(ctx: ToolContext, brief: string, skillName: string): Promise<string> {
  // The first design in a managed folder goes in the folder use_open_design_managed_workspace named for it.
  const managed = ctx.managedDesignSlug;
  if (managed && !(await holdsRegisteredArtifact(path.join(ctx.workspaceRoot, ctx.outputDir, managed), 1))) {
    return path.posix.join(ctx.outputDir, managed, `${managed}.html`);
  }
  const slugSource = brief.trim().length > 0 ? brief : skillName;
  const slug = slugify(slugSource);
  return path.posix.join(ctx.outputDir, slug, `${slug}.html`);
}

const KIND_TO_RENDERER: Record<string, string> = {
  html: 'html',
  deck: 'deck-html',
  'react-component': 'react-component',
  'markdown-document': 'markdown',
  svg: 'svg',
  diagram: 'diagram',
  'code-snippet': 'code',
  'mini-app': 'mini-app',
  'design-system': 'design-system',
};

export async function listSkills(ctx: ToolContext, input: ListSkillsInput): Promise<unknown> {
  return listSkillsPayload(ctx.contentIndex, input);
}

export interface RemixablePrompt {
  /** Hyphenated invocation name, e.g. "od-video-frame-liquid-bg-hero". Colons render as literal spaces in some MCP clients' chat input, so this is never the colon form. */
  name: string;
  publicId: string;
  displayName: string;
  examplePrompt?: string;
}

/**
 * The remixable-example catalog (source: 'example', exampleArtifactPath
 * non-empty) as MCP prompt entries — same filter already backing
 * list_open_design_skills' remixableOnly, VS Code's Gallery Grid, and
 * references/remixable-examples.md. Selecting one is meant to prefill a
 * client's chat composer with the example's brief (mirroring
 * packages/vscode's chatWithExample.ts), not to write or generate anything.
 */
export async function listRemixablePrompts(ctx: ToolContext): Promise<RemixablePrompt[]> {
  const skills = await ctx.contentIndex.listSkills(undefined, undefined, 'example', true);
  return skills.map((s) => ({
    name: s.id.replace(/:/g, '-'),
    publicId: s.id,
    displayName: s.name,
    examplePrompt: s.examplePrompt,
  }));
}

/**
 * Deliberately does NOT say `Use the Open Design skill "<id>"` — VS Code's
 * chatWithExample.ts uses exactly that phrasing safely, but on Claude Code
 * this text becomes a fresh user message with no surrounding skill context,
 * and the model reflexively tried invoking its own built-in Skill tool with
 * the quoted id (which isn't a real Skill name — od:<mode>:<name> is this
 * server's own internal skillId namespace), producing a real "Unknown
 * skill" error observed live. Naming the MCP tool explicitly and using
 * "skillId" instead of "skill" avoids that misread.
 */
export function buildRemixPromptMessage(prompt: RemixablePrompt): string {
  const brief = prompt.examplePrompt ? ` ${prompt.examplePrompt}` : '';
  return `Remix the Open Design example "${prompt.displayName}" — call the open-design MCP server's remix_open_design_example tool with skillId "${prompt.publicId}".${brief}`;
}

export async function listDesignSystems(ctx: ToolContext, input: { query?: string; category?: string }): Promise<unknown> {
  const designSystems = await ctx.contentIndex.listDesignSystems(input.query, input.category);
  const activeId = await ctx.store.get();
  return designSystems.map((ds) => ({
    id: ds.id,
    name: ds.name,
    summary: ds.summary,
    category: ds.category,
    source: ds.source,
    active: ds.id === activeId,
  }));
}

export async function recommendDesignSystems(ctx: ToolContext, input: DesignProfile & { limit?: number }): Promise<unknown> {
  const { limit, ...profile } = input;
  const result = await ctx.contentIndex.recommendDesignSystems(profile, limit);
  const activeId = await ctx.store.get();
  return { ...result, activeDesignSystemId: activeId };
}

/** Shown on a brief made with no design system, so an agent that skipped the overview skill still learns it can recommend one. */
export const NO_DESIGN_SYSTEM_HINT =
  'No design system was used. If the user wants a look but hasn\'t named one, call recommend_open_design_design_systems with what you know about the design, then prepare the brief again with the chosen designSystemId.';

export async function prepareBrief(
  ctx: ToolContext,
  input: {
    skillId: string;
    designSystemId?: string;
    brief: string;
    collectionId?: string;
    collectionName?: string;
    screenRole?: string;
    screenTotal?: number;
    sources?: string[];
    format?: string;
    fluid?: boolean;
    answers?: Record<string, string>;
    assumptions?: string[];
  },
): Promise<string> {
  const decisions = validateBriefDecisions(input.answers, input.assumptions);
  if (!decisions.ok) return decisions.error;
  const canvas = resolveBriefCanvas(input.format, input.fluid);
  if ('error' in canvas) return canvas.error;
  const canvasFormat = canvas.format;
  const skill = await ctx.contentIndex.getSkill(input.skillId);
  if (!skill) {
    const available = (await ctx.contentIndex.listSkills()).map((s) => s.id).slice(0, 20);
    return `Unknown skillId "${input.skillId}". Call list_open_design_skills to see available ids. A few available ids: ${available.join(', ')}`;
  }

  const resolution = await resolveActiveDesignSystem(input.designSystemId, ctx.store, (id) => ctx.contentIndex.getDesignSystem(id));
  if (resolution.unknownExplicitId) {
    const available = (await ctx.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
    return `Unknown designSystemId "${resolution.unknownExplicitId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`;
  }
  const { designSystemId, designSystem } = resolution;

  const allCraftSections = await ctx.contentIndex.craftSections();
  const craftSections = resolveCraftSections(allCraftSections, craftRequirementsFor(skill, designSystem));
  const existingAppFrameworks = await detectExistingApp(ctx.workspaceRoot);

  let suggestedEntryPath: string;
  let collectionContext: Parameters<typeof composeInstructions>[0]['collectionContext'];
  if (input.collectionId) {
    if (!input.screenRole) {
      return 'screenRole is required when collectionId is given — a short label for this screen\'s role in the flow, e.g. "splash", "value-prop", "checkout".';
    }
    const siblings = await findCollectionArtifacts(ctx.workspaceRoot, ctx.outputDir, input.collectionId);
    suggestedEntryPath = suggestCollectionScreenEntryPath(ctx.outputDir, input.collectionId, slugify(input.screenRole));
    collectionContext = {
      collectionName: input.collectionName ?? input.collectionId,
      index: siblings.length + 1,
      total: input.screenTotal ?? siblings.length + 1,
      role: input.screenRole,
      siblingScreens: siblings.map((s) => ({ role: s.screenRole ?? '?', title: s.title })),
    };
  } else {
    suggestedEntryPath = await suggestEntryPath(ctx, input.brief, skill.name);
  }

  const sources = await resolveBriefSources({
    workspaceRoot: ctx.workspaceRoot,
    outputDir: ctx.outputDir,
    sourcePaths: input.sources,
    skillId: skill.id,
    skillMode: skill.mode,
    suggestedEntryPath,
  });
  if (!sources.ok) return sources.error;

  const recentDesigns = await loadRecentDesigns(ctx.workspaceRoot, { collectionId: input.collectionId, entryPath: suggestedEntryPath });
  const instructions = composeInstructions({
    skillName: skill.name,
    skillBody: skill.body,
    designSystemTitle: designSystem?.name,
    designSystemBody: designSystem?.body,
    craftSections,
    brief: input.brief,
    suggestedEntryPath,
    existingAppFrameworks,
    collectionContext,
    hostOverride: hostOverrideFor(skill.id, skill.body),
    sourceContext: sources.context,
    canvasFormat,
    fluid: canvas.fluid,
    decisions: decisions.decisions,
    recentDesigns,
    productContext: ctx.managedWorkspace ? undefined : await readProductContext(ctx.workspaceRoot),
    projectDesignMdPath: ctx.managedWorkspace || designSystem ? undefined : await findProjectDesignMd(ctx.workspaceRoot),
  });

  const payload = {
    instructions,
    suggestedEntryPath,
    suggestedKind: 'html',
    format: canvasFormat?.id,
    fluid: canvasFormat ? canvas.fluid : undefined,
    designSystemId: designSystem ? designSystemId : undefined,
    designSystemName: designSystem?.name,
    designSystemHint: designSystem ? undefined : NO_DESIGN_SYSTEM_HINT,
    outlinePath: sources.context?.outlinePath,
    sources: sources.context?.sources.map((s) => ({ path: s.path, markdownPath: s.markdownPath, kind: s.kind })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function registerArtifact(
  ctx: ToolContext,
  input: {
    entryPath: string;
    kind: string;
    title: string;
    supportingFiles?: string[];
    sourceSkillId?: string;
    designSystemId?: string;
    collectionId?: string;
    collectionName?: string;
    screenIndex?: number;
    screenRole?: string;
    explorationId?: string;
    directionId?: string;
    sources?: string[];
    format?: string;
    resolvedCommentIds?: string[];
    brief?: unknown;
    critique?: unknown;
  },
): Promise<string> {
  if (input.format !== undefined && !getFormat(input.format)) return unknownFormatError(input.format);
  const brief = validateRegisteredBrief(input.brief);
  if (!brief.ok) return brief.error;
  const renderer = KIND_TO_RENDERER[input.kind];
  const exportsList = exportsForKind(input.kind);
  if (!renderer || !exportsList) {
    return `Unsupported kind "${input.kind}". Allowed: ${Object.keys(KIND_TO_RENDERER).join(', ')}`;
  }

  try {
    // Checked before anything is written, so a rejected critique leaves the manifest as it was.
    const critique = input.critique === undefined ? undefined : await prepareCritiqueRecord(ctx.workspaceRoot, ctx.outputDir, input.entryPath, input.critique);
    if (critique && !critique.ok) return `Failed to register artifact: ${critique.error}`;
    const sourceRegistration = input.sources?.length
      ? await prepareSourceRegistration({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, entryPath: input.entryPath, sourcePaths: input.sources })
      : undefined;
    const metadata = withBriefMetadata(await posterRegistrationMetadata(ctx.workspaceRoot, input.entryPath, input.format), brief.brief);
    const manifest = await writeArtifactManifest({
      workspaceRoot: ctx.workspaceRoot,
      entryPath: input.entryPath,
      artifactManifest: {
        kind: input.kind,
        renderer,
        exports: exportsList,
        title: input.title,
        supportingFiles: input.supportingFiles,
        sourceSkillId: input.sourceSkillId,
        designSystemId: input.designSystemId,
        collectionId: input.collectionId,
        collectionName: input.collectionName,
        screenIndex: input.screenIndex,
        screenRole: input.screenRole,
        explorationId: input.explorationId,
        directionId: input.directionId,
        sources: sourceRegistration?.sources.length ? sourceRegistration.sources : undefined,
        metadata: critique?.ok ? withCritique(metadata, critique.record) : metadata,
      },
    });
    await recordDesignHistory(ctx.workspaceRoot, {
      entryPath: input.entryPath,
      title: input.title,
      skillId: input.sourceSkillId,
      designSystemId: input.designSystemId,
      collectionId: input.collectionId,
      explorationId: input.explorationId,
      directionId: input.directionId,
    });
    const sourceNote = sourceRegistration ? `\n\n${formatSourceRegistration(sourceRegistration)}` : '';

    let explorationNote = '';
    if (input.explorationId) {
      const compare = await refreshExplorationCompare(ctx.workspaceRoot, ctx.outputDir, input.explorationId);
      explorationNote = compare.ok
        ? `\n\nExploration comparison page updated: ${compare.comparePath} (${compare.registered.length} of ${compare.plan.directions.length} directions registered${compare.missing.length > 0 ? `; still missing: ${compare.missing.join(', ')}` : '; all registered, so call compare_open_design_exploration next'}).`
        : `\n\nWarning: ${compare.warning}`;
    }

    let commentsNote = '';
    if (input.resolvedCommentIds?.length) {
      const { resolved, unknown } = await resolveArtifactComments(ctx.workspaceRoot, input.entryPath, input.resolvedCommentIds);
      commentsNote = `\n\nMarked ${resolved.length} comment(s) resolved.${unknown.length ? ` No comment with id ${unknown.join(', ')}.` : ''}`;
    }

    const critiqueNote = critique?.ok ? `\n\nRecorded the critique (${critiqueSummary(critique.record)}) as metadata.critique.` : '';

    return `Artifact registered at ${input.entryPath}.artifact.json\n\n${JSON.stringify(manifest, null, 2)}\n\nWritten to ${path.join(ctx.workspaceRoot, input.entryPath)}.${await previewNoteAfterRegister(ctx, input.entryPath)}${artifactPreviewHint(ctx, manifest)}${commentsNote}${critiqueNote}${explorationNote}${sourceNote}${await designSystemGalleryNote(ctx, input.designSystemId)}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Failed to register artifact: ${message}`;
  }
}

/**
 * The design system's page in the public gallery, while it is live and the
 * system is a bundled one (openspec link-public-gallery): the one passed, or
 * the active one when none was.
 */
export async function designSystemGalleryNote(ctx: ToolContext, designSystemId: string | undefined): Promise<string> {
  const gallery = await ctx.contentIndex.getLiveGallery();
  const id = designSystemId ?? (await ctx.store.get());
  if (!gallery || !id) return '';
  const detail = await ctx.contentIndex.getDesignSystem(id);
  if (!detail || !hasGalleryPage(detail)) return '';
  const designSystem = { id, name: detail.name, galleryUrl: galleryDesignSystemUrl(gallery, id) };
  return `\n\nDesign system: ${JSON.stringify({ designSystem })}\nWhen you tell the user this design is ready, name the design system with a link to galleryUrl, the first time you use this design system in the conversation. Not again for later rounds or designs in the same style, and never in a recurring job run.`;
}

/** Claude Code or Claude Desktop (whose Chat sends "local-agent-mode-plugin:<plugin>:<server>"), by the same rule as the integration setup text. */
export function isClaudeClient(clientName: string | undefined): boolean {
  const agent = agentFromClientName(clientName);
  return agent === 'claude-code' || agent === 'claude-desktop';
}

/** One line suggesting the private artifact preview, for Claude clients on a design that has none yet (openspec add-artifact-preview). */
function artifactPreviewHint(ctx: ToolContext, manifest: JsonRecord): string {
  // A managed workspace (a chat with no folder) shows designs inline with show_open_design_artifact; each artifact publish would resend the page.
  if (ctx.managedWorkspace) return '';
  if (!isClaudeClient(ctx.clientName) || latestShareFor(readShareRecords(manifest), CLAUDE_ARTIFACT_PROVIDER)) return '';
  return '\n\nArtifact preview: if you have an Artifact tool, show the user this design as a private Claude artifact: call publish_open_design_artifact with provider "claude-artifact" and follow its instructions (later rounds update the same artifact).';
}

/** get_open_design_artifact: the manifest, entry, supporting files and unaddressed comments, with up to 4 comment crops attached as images. */
export async function getArtifact(ctx: ToolContext, input: { entryPath: string; critique?: boolean }): Promise<ToolOutput> {
  const result = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath });
  if (!result) {
    return { text: `No artifact found at ${input.entryPath}. It may not have been written yet.` };
  }
  if (input.critique) return critiqueInputOutput(ctx, input.entryPath, result.manifest);
  const { comments: openComments, crops } = await readUnaddressedComments(ctx.workspaceRoot, input.entryPath);
  const recorded = recordedSources(result.manifest);
  const payload = {
    manifest: result.manifest,
    supportingFiles: result.supportingFiles,
    entryContent: result.entryContent,
    openComments,
    commentScreenshotsAttached: crops.length > 0 ? crops.map((c) => c.commentId) : undefined,
    staleSources: recorded.length > 0 ? await findStaleSources(ctx.workspaceRoot, ctx.outputDir, recorded) : undefined,
    previewUrl: latestShareFor(readShareRecords(result.manifest), CLAUDE_ARTIFACT_PROVIDER)?.url,
  };
  return { text: JSON.stringify(payload, null, 2), images: crops.map((c) => ({ data: c.png, mime: 'image/png' })) };
}

/** get_open_design_artifact with critique: what the design critic judges, with the latest check run's screenshots attached (openspec add-design-critic). */
async function critiqueInputOutput(ctx: ToolContext, entryPath: string, manifest: JsonRecord | null): Promise<ToolOutput> {
  const designSystemId = typeof manifest?.designSystemId === 'string' ? manifest.designSystemId : undefined;
  const ds = designSystemId ? await ctx.contentIndex.getDesignSystem(designSystemId) : undefined;
  const critiqueInput = await buildCritiqueInput({
    workspaceRoot: ctx.workspaceRoot,
    outputDir: ctx.outputDir,
    entryPath,
    manifest,
    designSystem: designSystemId ? { id: designSystemId, name: ds?.name, designMd: ds?.body } : undefined,
  });
  const run = critiqueInput.checkRun;
  const images: Array<{ data: Buffer; mime: string }> = [];
  for (const img of run?.images ?? []) {
    const data = await readCheckRunImage(ctx.workspaceRoot, ctx.outputDir, entryPath, run!.id, path.posix.basename(img.path));
    if (data) images.push({ data, mime: 'image/jpeg' });
  }
  const note = run
    ? `Critique input for ${entryPath}. The ${images.length} attached image(s) are this check run's screenshots, in the order of checkRun.images.`
    : `No saved check run for ${entryPath} yet: call check_open_design_artifact first, then ask for the critique input again.`;
  return { text: `${note}\n\n${JSON.stringify({ critiqueInput }, null, 2)}`, images };
}

// ── Browser preview (openspec add-browser-preview) ─────────────────────────
// One preview per workspace root for the life of this MCP process; the
// window and the server close when the process exits.
const previewSessions = new Map<string, PreviewSession>();
const previewOpenedFor = new Set<string>();
/** Entries show_open_design_artifact has shown inline in this process, as `<workspaceRoot>\0<entryPath>`: those copies follow edits by themselves. */
const shownInline = new Set<string>();

function previewSession(ctx: ToolContext): PreviewSession {
  let session = previewSessions.get(ctx.workspaceRoot);
  if (!session) {
    session = new PreviewSession({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, log: (m) => console.error(m) });
    previewSessions.set(ctx.workspaceRoot, session);
  }
  return session;
}

export function previewMode(): PreviewMode {
  return previewModeFromEnv();
}

/** Closes every preview this process started (tests, shutdown). */
export async function closePreviews(): Promise<void> {
  const sessions = [...previewSessions.values()];
  previewSessions.clear();
  previewOpenedFor.clear();
  shownInline.clear();
  await Promise.all(sessions.map((s) => s.close()));
}

/** set_up_open_design_browser_pane: the Code tab's launch entry for the live preview (openspec code-tab-browser-pane). */
export async function setUpBrowserPane(ctx: ToolContext, version: string): Promise<string> {
  try {
    const { outcome, entry, file } = await mergeClaudeLaunchConfig({ workspaceRoot: ctx.workspaceRoot, version });
    const what = outcome === 'unchanged' ? `${file} already has the ${entry.name} configuration` : `${outcome === 'created' ? 'Created' : 'Updated'} ${file} with the ${entry.name} configuration`;
    const tell = outcome === 'unchanged' ? '' : ` Tell the user once, in one sentence, that you added a live-preview entry called "${entry.name}" to .claude/launch.json so the Browser pane can show their designs.`;
    return `${what} (port ${entry.port}, runs ${entry.runtimeExecutable}). Now start "${entry.name}" with the Code tab's preview tool: the Browser pane opens on the newest registered design, reloads when its files change, and has Comment and Checks.${tell} If it fails to start because the port is busy, another project's preview probably uses it: ask the user to stop that one.`;
  } catch (err) {
    return `Couldn't set up the Browser pane: ${err instanceof Error ? err.message : String(err)} Fix or remove that file, or use open_open_design_preview instead.`;
  }
}

/** open_open_design_preview: shows a registered artifact (or the picker) in a live browser preview. */
export async function openPreview(ctx: ToolContext, input: { entryPath?: string; open?: boolean }): Promise<string> {
  if (previewMode() === 'off') return 'The browser preview is turned off (OPEN_DESIGN_PREVIEW=off).';
  if (input.entryPath) {
    const artifact = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath });
    if (!artifact) return `No artifact found at ${input.entryPath}. Write it and call register_open_design_artifact first.`;
    if (!artifact.manifest) return `${input.entryPath} isn't registered yet. Call register_open_design_artifact first.`;
  }
  const outcome = await previewSession(ctx).open(input.entryPath, input.open !== false);
  if (outcome.how !== 'not-opened') previewOpenedFor.add(ctx.workspaceRoot);
  return formatPreviewOutcome(outcome, input.entryPath);
}

// ── Preview MCP App (openspec add-mcp-app-preview) ───────────────────────
// Remote origins the designs shown in this process still load from, declared
// in the `ui://` resource's CSP on its next read.
const previewAppOrigins = new Set<string>();

function notePreviewAppOrigins(urls: string[]): void {
  remoteOrigins(urls).forEach((o) => previewAppOrigins.add(o));
}

// The bundled examples are fixed, so the URLs they load are read once per assets root.
const exampleUrlsByAssetsRoot = new Map<string, Promise<string[]>>();

/** The `ui://open-design/preview` page and the remote domains it may load from: shown designs' origins, plus every bundled example's when a context is given. */
export async function previewAppResource(ctx?: ToolContext): Promise<{ html: string; resourceDomains: string[] }> {
  const assets = await loadPreviewAssets();
  const seen = new Set(previewAppOrigins);
  if (ctx) {
    let urls = exampleUrlsByAssetsRoot.get(ctx.assetsRoot);
    if (!urls) {
      urls = exampleRemoteUrls(ctx.contentIndex, ctx.assetsRoot).catch(() => []);
      exampleUrlsByAssetsRoot.set(ctx.assetsRoot, urls);
    }
    remoteOrigins(await urls).forEach((o) => seen.add(o));
  }
  return { html: renderPreviewAppPage(assets.mcpAppJs), resourceDomains: previewAppResourceDomains(seen) };
}

// A few bundled example previews, newest last: a gallery page asks for each visible card.
const examplePreviewCache = new Map<string, ExamplePreviewResult>();
const EXAMPLE_PREVIEW_CACHE_SIZE = 24;

async function cachedExamplePreview(ctx: ToolContext, exampleId: string): Promise<ExamplePreviewResult> {
  const key = `${ctx.assetsRoot}\0${exampleId}`;
  const hit = examplePreviewCache.get(key);
  if (hit) {
    examplePreviewCache.delete(key);
    examplePreviewCache.set(key, hit);
    return hit;
  }
  const result = await buildExamplePreview(ctx.contentIndex, ctx.assetsRoot, exampleId);
  if (result.ok) {
    examplePreviewCache.set(key, result);
    while (examplePreviewCache.size > EXAMPLE_PREVIEW_CACHE_SIZE) examplePreviewCache.delete(examplePreviewCache.keys().next().value as string);
  }
  return result;
}

/** show_open_design_artifact: the text every host gets, plus the target the preview app renders. */
export async function showArtifact(ctx: ToolContext, input: { entryPath?: string; explorationId?: string; campaign?: boolean }): Promise<ToolOutput> {
  const shown = await prepareShow({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, ...input, hostRendersApp: ctx.rendersMcpApps === true });
  if (!shown.ok) return { text: shown.text };
  if (ctx.rendersMcpApps && input.entryPath && !input.campaign) shownInline.add(`${ctx.workspaceRoot}\0${input.entryPath}`);
  return { text: shown.text, structuredContent: { ...shown.target } };
}

/** The matching gallery hub while the public gallery is live (openspec link-public-gallery). */
async function galleryField(ctx: ToolContext, hub: 'examples' | 'design-systems', query: string | undefined): Promise<{ url: string } | undefined> {
  const site = await ctx.contentIndex.getLiveGallery();
  return site ? { url: galleryHubUrl(site, hub, query) } : undefined;
}

function galleryNote(gallery: { url: string } | undefined): string {
  return gallery
    ? `\n\nGallery: ${JSON.stringify({ gallery })}\nIf the user is browsing (wants to look before deciding), add one line linking gallery.url, unless you already linked the gallery in this conversation. Not on a concrete request, and never in a recurring job run.`
    : '';
}

export interface ShowExamplesInput {
  query?: string;
  mode?: string;
  surface?: string;
}

/** show_open_design_examples: the gallery's target (filters and a title only); a host without MCP Apps gets a short text list. */
export async function showExamples(ctx: ToolContext, input: ShowExamplesInput): Promise<ToolOutput> {
  const filters: ShowExamplesInput = {};
  for (const key of ['query', 'mode', 'surface'] as const) if (typeof input[key] === 'string' && input[key]!.trim()) filters[key] = input[key]!.trim();
  const matched = await matchingExamples(ctx.contentIndex, filters);
  if (!matched.ok) return { text: matched.message };
  const examples = filters.mode ? matched.examples.filter((s) => s.mode === filters.mode!.toLowerCase()) : matched.examples;
  const gallery = await galleryField(ctx, 'examples', filters.query);
  if (!ctx.rendersMcpApps) return { text: `${examplesFallbackText(examples)}${galleryNote(gallery)}` };
  const title = filters.surface ? `Examples: ${filters.surface}` : filters.query ? `Examples: ${filters.query}` : 'Examples to remix';
  return {
    text: `Showing ${examples.length} remixable examples inline. The user picks one with "Remix this", which posts a message here naming its skillId; then call remix_open_design_example (ask what to make first if they haven't said).${galleryNote(gallery)}`,
    structuredContent: { view: 'examples', title, ...filters, ...(gallery ? { gallery } : {}) },
  };
}

export interface ShowDesignSystemsInput {
  query?: string;
  category?: string;
  ids?: string[];
}

/** show_open_design_design_systems: the tiles' target; a host without MCP Apps gets a short text list. */
export async function showDesignSystems(ctx: ToolContext, input: ShowDesignSystemsInput): Promise<ToolOutput> {
  const filters: ShowDesignSystemsInput = {};
  if (Array.isArray(input.ids) && input.ids.length) filters.ids = input.ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim());
  else {
    if (typeof input.query === 'string' && input.query.trim()) filters.query = input.query.trim();
    if (typeof input.category === 'string' && input.category.trim()) filters.category = input.category.trim();
  }
  const state = await buildDesignSystemsState(ctx.contentIndex, await ctx.store.get(), filters);
  const gallery = await galleryField(ctx, 'design-systems', filters.query);
  if (!ctx.rendersMcpApps) return { text: `${designSystemsFallbackText(state)}${galleryNote(gallery)}` };
  const missing = state.unknownIds?.length ? ` Unknown ids, not shown: ${state.unknownIds.join(', ')}.` : '';
  const title = filters.ids ? 'Shortlisted design systems' : filters.category ? `Design systems: ${filters.category}` : filters.query ? `Design systems: ${filters.query}` : 'Design systems';
  return {
    text: `Showing ${state.systems.length} design systems inline.${missing} The user opens one to see it and picks with "Use this design system", which posts a message here; then call set_active_design_system with that id.${galleryNote(gallery)}`,
    structuredContent: { view: 'design-systems', title, ...filters, ...(gallery ? { gallery } : {}) },
  };
}

/** show_open_design_questions: the questions, checked, as the ask view's target; a host without MCP Apps gets them as one numbered message to ask. */
export async function showQuestions(ctx: ToolContext, input: { questions?: unknown; title?: unknown }): Promise<ToolOutput> {
  const parsed = parseAskSchema({ questions: input.questions, ...(input.title !== undefined ? { title: input.title } : {}) });
  if (!parsed.ok) throw new Error(parsed.message);
  if (!ctx.rendersMcpApps) return { text: askFallbackText(parsed.schema) };
  return { text: askShowText(parsed.schema), structuredContent: { view: 'ask', title: parsed.schema.title ?? 'A few quick questions', questions: parsed.schema.questions } };
}

/** One ask-view option picture: a design system's swatches, an example's page, or an artifact's or check run's screenshot. */
async function askImage(ctx: ToolContext, imageRef: string): Promise<PreviewAppAskImage> {
  const ref = parseAskImageRef(imageRef);
  if (typeof ref === 'string') throw new Error(ref);
  switch (ref.kind) {
    case 'designSystem': {
      const detail = await ctx.contentIndex.getDesignSystem(ref.value);
      return detail ? { imageRef, swatches: designSystemTile(detail, undefined).swatches } : { imageRef, fallback: `No design system "${ref.value}".` };
    }
    case 'example': {
      const result = await cachedExamplePreview(ctx, ref.value);
      if (!result.ok) return { imageRef, fallback: result.message };
      notePreviewAppOrigins(result.externalDependencies);
      return { imageRef, html: result.preview.html, fallback: result.preview.fallback };
    }
    case 'artifact':
    case 'checkRun':
      return buildArtifactAskImage({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, imageRef, entryPath: ref.value, runId: ref.runId, pageFallback: ref.kind === 'artifact' });
  }
}

export interface PreviewStateInput {
  imageRef?: string;
  entryPath?: string;
  explorationId?: string;
  view?: string;
  query?: string;
  mode?: string;
  surface?: string;
  category?: string;
  ids?: string[];
  cursor?: string;
  exampleId?: string;
  designSystemId?: string;
  /** Only the shown design's revision, which the inline views poll (openspec inline-preview-in-place). */
  revisionOnly?: boolean;
}

/** get_open_design_preview_state (app only): the data behind each view, one page or one preview per call. */
export async function previewAppState(ctx: ToolContext, input: PreviewStateInput): Promise<ToolOutput> {
  if (input.revisionOnly) {
    const target = input.explorationId ? { explorationId: input.explorationId } : input.entryPath ? { entryPath: input.entryPath, campaign: input.view === 'campaign' } : undefined;
    if (!target) throw new Error('Pass entryPath or explorationId with revisionOnly.');
    const revision = await previewRevision({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, target });
    return { text: `Revision ${revision}.`, structuredContent: { revision } };
  }
  if (input.imageRef) {
    const image = await askImage(ctx, input.imageRef);
    return { text: `Picture for ${input.imageRef}${image.fallback ? `: ${image.fallback}` : ''}.`, structuredContent: { ...image } };
  }
  if (input.exampleId) {
    const result = await cachedExamplePreview(ctx, input.exampleId);
    if (!result.ok) throw new Error(result.message);
    notePreviewAppOrigins(result.externalDependencies);
    return { text: `Example ${input.exampleId}${result.preview.html ? '' : ': no inline preview'}.`, structuredContent: { ...result.preview } };
  }
  if (input.designSystemId) {
    const result = await buildDesignSystemPreview(ctx.contentIndex, input.designSystemId);
    if (!result.ok) throw new Error(result.message);
    return { text: `Design system ${input.designSystemId}.`, structuredContent: { ...result.preview } };
  }
  if (input.view === 'examples') {
    const result = await buildExamplesState(ctx.contentIndex, input);
    if (!result.ok) throw new Error(result.message);
    return { text: `${result.state.examples.length} of ${result.state.total} examples.`, structuredContent: { ...result.state } };
  }
  if (input.view === 'design-systems') {
    const state = await buildDesignSystemsState(ctx.contentIndex, await ctx.store.get(), input);
    return { text: `${state.systems.length} design systems.`, structuredContent: { ...state } };
  }
  if (input.view === 'campaign') {
    if (!input.entryPath) throw new Error('Pass entryPath for the campaign view.');
    const shown = await prepareShow({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, entryPath: input.entryPath, campaign: true, hostRendersApp: true });
    if (!shown.ok) throw new Error(shown.text);
    const state = await buildCampaignState({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath, title: shown.target.title });
    return { text: `Campaign sheet of ${input.entryPath}: ${state.tiles.length} tiles.`, structuredContent: { ...state } };
  }
  if (input.explorationId) {
    const result = await buildExplorationPreviewState({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, explorationId: input.explorationId });
    if (!result.ok) throw new Error(result.message);
    notePreviewAppOrigins(result.externalDependencies);
    return { text: `Exploration ${input.explorationId}: ${result.state.directions.length} directions.`, structuredContent: { ...result.state } };
  }
  if (!input.entryPath) throw new Error('Pass entryPath or explorationId.');
  const { bridgeJs } = await loadPreviewAssets();
  const result = await buildArtifactPreviewState({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, entryPath: input.entryPath, bridgeJs });
  if (!result.ok) throw new Error(result.message);
  notePreviewAppOrigins(result.externalDependencies);
  return { text: `${result.state.title} (${input.entryPath}): ${result.state.comments.length} comments.`, structuredContent: { ...result.state } };
}

/** save_open_design_comment (app only): creates, edits or deletes one comment in the sidecar. */
export async function saveComment(ctx: ToolContext, input: { entryPath: string; comment?: unknown; deleteId?: string }): Promise<ToolOutput> {
  const result = await saveCommentFromApp({ workspaceRoot: ctx.workspaceRoot, ...input });
  if (!result.ok) throw new Error(result.message);
  return { text: `Saved. ${result.comments.length} comments on ${input.entryPath}.`, structuredContent: { comments: result.comments } };
}

async function previewNoteAfterRegister(ctx: ToolContext, entryPath: string): Promise<string> {
  // A host that shows MCP Apps shows the design inline, with no local server (openspec inline-preview-in-place).
  if (ctx.rendersMcpApps) {
    return shownInline.has(`${ctx.workspaceRoot}\0${entryPath}`)
      ? ' The copy shown inline in the chat updates by itself; don\'t show it again.'
      : ' Call show_open_design_artifact with this entryPath to show it inline in the chat; later rounds update that copy by itself.';
  }
  const mode = previewMode();
  if (mode === 'off') return '';
  const session = previewSessions.get(ctx.workspaceRoot);
  if (session?.isRunning() && previewOpenedFor.has(ctx.workspaceRoot)) {
    // An open preview of this entry reloads by itself; another entry needs a navigate.
    return ' The open browser preview reloads by itself; call open_open_design_preview to switch it to this artifact.';
  }
  if (mode === 'auto') {
    try {
      return `\n\n${await openPreview(ctx, { entryPath })}`;
    } catch (err) {
      return `\n\nThe browser preview couldn't open: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return ' Call open_open_design_preview to show it to the user in a live browser preview, where they can also leave comments.';
}

export async function setActiveDesignSystemTool(
  ctx: ToolContext,
  input: { designSystemId?: string; writeProjectDesignMd?: boolean },
): Promise<string> {
  const result = await setActiveDesignSystem(input.designSystemId, ctx.store, (id) => ctx.contentIndex.getDesignSystem(id));
  if (result.outcome === 'cleared') return 'Cleared the active Open Design design system.';
  if (result.outcome === 'unknown') {
    const available = (await ctx.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
    return `Unknown designSystemId "${result.unknownId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`;
  }
  const set = `Active Open Design design system set to "${input.designSystemId}" (${result.designSystem.name}).`;
  if (!input.writeProjectDesignMd) return set;
  // openspec add-impeccable-interop: a project DESIGN.md other tools (Impeccable) read, written only when none exists.
  if (ctx.managedWorkspace) return `${set} Did not write a project DESIGN.md: this is the managed designs folder, not a code project.`;
  const written = await writeProjectDesignMd(ctx.workspaceRoot, result.designSystem);
  return written.outcome === 'written'
    ? `${set} Wrote ${written.path} at the project root (design tokens in its front matter, then the design system's text). Open Design won't change it again.`
    : `${set} Kept your existing ${written.path}; it was not changed.`;
}

export async function createCustomDesignSystem(
  ctx: ToolContext,
  input: { name?: string; brief?: string; sourceUrl?: string; existingDesignSystemId?: string },
): Promise<string> {
  if (input.existingDesignSystemId) {
    const id = input.existingDesignSystemId.trim();
    const result = composeDesignSystemTokensInstructions(id, await ctx.contentIndex.getDesignSystem(id), ctx.outputDir);
    if (!result.ok) return result.error;
    return JSON.stringify({ instructions: result.instructions, suggestedEntryPath: result.suggestedEntryPath, id: result.id }, null, 2);
  }
  if (!input.name?.trim() || !input.brief?.trim()) {
    return 'Both "name" and "brief" are required to create a new design system (or pass "existingDesignSystemId" to write only tokens.css for an existing custom one).';
  }
  const slug = slugify(input.name);
  const id = `user:${slug}`;
  const suggestedEntryPath = path.posix.join(ctx.outputDir, 'design-systems', slug, 'DESIGN.md');
  const evidence = input.sourceUrl ? await extractBrandEvidence(input.sourceUrl) : undefined;
  const instructions = composeCustomDesignSystemInstructions({ name: input.name, brief: input.brief, suggestedEntryPath, id, evidence });
  return JSON.stringify({ instructions, suggestedEntryPath, id }, null, 2);
}

/**
 * extract_open_design_design_system: renders a website, writes the evidence
 * bundle under <outputDir>/.extract/<slug>/ and returns a draft token set with
 * the desktop screenshot. Never writes DESIGN.md or tokens.css.
 */
export async function extractDesignSystemFromSite(
  ctx: ToolContext,
  input: { url?: string; extraUrls?: string[]; theme?: string },
): Promise<ToolOutput> {
  if (typeof input.url !== 'string' || !input.url.trim()) throw new Error('"url" is required: the website to extract a design system from.');
  if (input.extraUrls !== undefined && (!Array.isArray(input.extraUrls) || input.extraUrls.some((u) => typeof u !== 'string'))) {
    throw new Error('"extraUrls" must be a list of URLs on the same site.');
  }
  if (input.theme !== undefined && !['light', 'dark', 'both'].includes(input.theme)) throw new Error('"theme" must be light, dark or both.');
  const result = await extractSite({
    url: input.url.trim(),
    extraUrls: input.extraUrls,
    theme: input.theme as ExtractionTheme | undefined,
    workspaceRoot: ctx.workspaceRoot,
    outputDir: ctx.outputDir,
  });
  if (result.status === 'invalid-args') throw new Error(result.error);
  const shot = result.screenshots.find((s) => s.endsWith('desktop.png')) ?? result.blocked.find((b) => b.screenshot)?.screenshot;
  const image = shot ? await fs.readFile(path.join(ctx.workspaceRoot, shot)).catch(() => undefined) : undefined;
  return { text: formatExtractSiteResult(result), images: image ? [{ data: image, mime: 'image/png' }] : [] };
}

export async function portToAppCode(
  ctx: ToolContext,
  input: { entryPath: string; targetComponentPath?: string; referenceComponentPath?: string },
): Promise<string> {
  const artifact = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath });
  if (!artifact) {
    return `No artifact found at ${input.entryPath}. It may not have been written yet.`;
  }
  const artifactName =
    typeof artifact.manifest?.title === 'string' ? artifact.manifest.title : path.basename(input.entryPath, path.extname(input.entryPath));
  const targetComponentPath = input.targetComponentPath ?? (await suggestTargetComponentPath(ctx.workspaceRoot, artifactName));
  const instructions = composePortToAppInstructions({
    artifactEntryPath: input.entryPath,
    artifactContent: artifact.entryContent,
    targetComponentPath,
    referenceComponentPath: input.referenceComponentPath,
  });
  return JSON.stringify({ instructions, suggestedTargetComponentPath: targetComponentPath }, null, 2);
}

/** prepare_open_design_component_library: staged instructions for a component set; writes only the manifest record. */
export async function prepareComponentLibrary(
  ctx: ToolContext,
  input: { entryPaths?: string[]; collectionId?: string; library?: string; outputDir?: string; record?: unknown },
): Promise<string> {
  const result = await prepareComponentLibraryCore({
    workspaceRoot: ctx.workspaceRoot,
    outputDir: ctx.outputDir,
    entryPaths: input.entryPaths,
    collectionId: input.collectionId,
    library: input.library,
    componentsDir: input.outputDir,
    record: input.record,
    getDesignSystem: (id) => ctx.contentIndex.getDesignSystem(id),
  });
  return result.ok ? result.text : `Component set not prepared (${result.code}): ${result.text}`;
}

export async function pullFigmaFrame(ctx: ToolContext, input: { figmaUrl: string; designSystemId?: string }): Promise<string> {
  return preparePullFigmaFrame({
    figmaUrl: input.figmaUrl,
    designSystemId: input.designSystemId,
    token: ctx.figmaToken,
    outputDir: ctx.outputDir,
    tokenSetupHint:
      `save a personal access token from Figma → Settings → Personal access tokens in ${figmaTokenFilePath()} on the machine this server runs on, or set the OPEN_DESIGN_FIGMA_TOKEN environment variable for this MCP server`,
  });
}

export async function remixExample(ctx: ToolContext, input: { skillId: string }): Promise<string> {
  const skill = await ctx.contentIndex.getSkill(input.skillId);
  if (!skill) {
    const available = (await ctx.contentIndex.listSkills()).map((s) => s.id).slice(0, 20);
    return `Unknown skillId "${input.skillId}". Call list_open_design_skills to see available ids. A few available ids: ${available.join(', ')}`;
  }
  if (!skill.exampleArtifactPath) {
    return `"${input.skillId}" has no remixable starting artifact. Pick an entry with remixable: true from list_open_design_skills, or use prepare_open_design_brief to generate from scratch instead.`;
  }

  const slug = slugify(skill.name);
  const entryPath = path.posix.join(ctx.outputDir, slug, `${slug}.html`);

  const { supportingFiles } = await copyExampleArtifact({
    assetsRoot: ctx.assetsRoot,
    exampleArtifactPath: skill.exampleArtifactPath,
    workspaceRoot: ctx.workspaceRoot,
    entryPath,
  });

  const manifest = await writeArtifactManifest({
    workspaceRoot: ctx.workspaceRoot,
    entryPath,
    artifactManifest: {
      kind: 'html',
      renderer: 'html',
      exports: exportsForKind('html'),
      title: skill.name,
      supportingFiles,
      sourceSkillId: input.skillId,
      metadata: { remixedFrom: input.skillId },
    },
  });

  const brief =
    skill.examplePrompt ?? `Adapt this example ("${skill.name}") to the user's specific request, keeping its overall visual approach.`;
  const instructions = `The file at "${entryPath}" already exists — it's a copy of the "${skill.name}" example. Read it first, then apply the following as a targeted MODIFICATION to the existing content, not a from-scratch regeneration:\n\n${brief}\n\nAfter making changes, call register_open_design_artifact again with the same entryPath if the kind/title/supportingFiles need updating.`;

  return JSON.stringify({ entryPath, instructions, manifest }, null, 2);
}

export async function exportArtifact(
  ctx: ToolContext,
  input: {
    entryPath: string;
    format?: ExportFormat;
    quality?: number;
    width?: number;
    height?: number;
    scale?: number;
    selector?: string;
    maxBytes?: number;
    deck?: boolean;
    slides?: number[];
    badge?: boolean;
    baseUrl?: string;
    embedAssets?: boolean;
    maxResolution?: AssetResolution;
    preset?: string;
    bleed?: number;
    cropMarks?: boolean;
    dpi?: number;
    printHouse?: string;
    checkOnly?: boolean;
    data?: string;
    sheet?: string;
    nameField?: string;
    split?: boolean;
    presets?: string[];
    shapeSheet?: boolean;
    target?: PasteTarget;
    campaignSheet?: boolean;
    transparent?: boolean;
    fps?: number;
    duration?: number;
    loop?: boolean;
  },
): Promise<string> {
  // Browser path: OPEN_DESIGN_BROWSER_PATH is read by core's discovery itself;
  // OPEN_DESIGN_SHARE_BADGE by core's badge resolution.
  const { printHouse: printHouseId, ...rest } = input;
  let printHouse: PrintHouse | undefined;
  if (printHouseId !== undefined) {
    const resolved = await resolvePrintHouse(ctx.contentIndex, printHouseId);
    if (!resolved.ok) return resolved.error;
    printHouse = resolved.printHouse;
  }
  const result = await exportArtifactCore({
    ...rest,
    printHouse,
    workspaceRoot: ctx.workspaceRoot,
    outputDir: ctx.outputDir,
    layout: ctx.layout,
    lookupAspectHint: async (id) => (await ctx.contentIndex.getSkill(id))?.aspectHint,
  });
  return formatExportResult(result);
}

/** A tool result with images: the text always carries the complete result, so clients that ignore images lose nothing. */
export interface ToolOutput {
  text: string;
  /** Further text items after `text`, e.g. a page for the agent to publish. */
  texts?: string[];
  images?: Array<{ data: Buffer; mime: string }>;
  /** For an MCP App: the data its page reads from the tool result. */
  structuredContent?: Record<string, unknown>;
}

/** MCP `content` for a handler's result: one text item, then one image item per image. */
export function toCallToolContent(out: string | ToolOutput): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
  if (typeof out === 'string') return [{ type: 'text', text: out }];
  return [{ type: 'text', text: out.text }, ...(out.texts ?? []).map((text) => ({ type: 'text' as const, text })), ...(out.images ?? []).map((i) => ({ type: 'image' as const, data: i.data.toString('base64'), mimeType: i.mime }))];
}

/** add_open_design_diagram_runtime: inserts or updates the inline diagram runtime in the entry file. */
export async function addDiagramRuntime(ctx: ToolContext, input: { entryPath: string }): Promise<string> {
  return formatAddDiagramRuntimeResult(await addDiagramRuntimeCore({ ...input, workspaceRoot: ctx.workspaceRoot }));
}

export type ListIntegrationsArgs = ListIntegrationsInput;

/** list_open_design_integrations: trusted third-party MCP servers with setup steps for the connected agent; read-only. */
/** list_open_design_print_houses: printers' upload sizes, for export's printHouse; read-only. */
export async function listPrintHouses(ctx: ToolContext): Promise<string> {
  return formatPrintHouses(await ctx.contentIndex.listPrintHouses());
}

export async function listIntegrations(ctx: ToolContext, input: ListIntegrationsInput): Promise<string> {
  return formatIntegrations(await ctx.contentIndex.getIntegrationRegistry(), input, agentFromClientName(ctx.clientName));
}

/** check_open_design_artifact: renders the artifact and returns findings plus screenshots; writes nothing. */
export async function checkArtifact(
  ctx: ToolContext,
  input: { entryPath: string; viewports?: CheckViewport[]; slides?: number[]; maxImages?: number; at?: number[]; views?: ReviewView[] | false; states?: boolean },
): Promise<ToolOutput> {
  // Browser path: OPEN_DESIGN_BROWSER_PATH is read by core's discovery itself.
  const result = await checkArtifactCore({
    ...input,
    workspaceRoot: ctx.workspaceRoot,
    outputDir: ctx.outputDir,
    lookupAspectHint: async (id) => (await ctx.contentIndex.getSkill(id))?.aspectHint,
  });
  return { text: formatCheckResult(result), images: result.ok ? result.images : [] };
}

/** adapt_open_design_artifact: per-format re-composition instructions; writes only the master's collection membership. */
export async function adaptArtifactTool(ctx: ToolContext, input: { entryPath: string; formats: string[]; notes?: string }): Promise<string> {
  return formatAdaptResult(await adaptArtifact({ ...input, workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir }));
}

/** create_open_design_qr_code: writes assets/<name>.svg next to the artifact and returns inline markup. */
export async function createQrCode(
  ctx: ToolContext,
  input: { entryPath: string; text: string; name?: string; errorCorrection?: 'L' | 'M' | 'Q' | 'H'; margin?: number },
): Promise<string> {
  return formatQrCodeResult(await createArtifactQrCode({ ...input, workspaceRoot: ctx.workspaceRoot }));
}

/** publish_open_design_artifact: builds the site bundle and returns publish instructions, or records a deploy. Never deploys. */
export async function publishArtifact(
  ctx: ToolContext,
  input: {
    entryPath: string;
    provider?: string;
    badge?: boolean;
    includeFiles?: string[];
    published?: { provider: string; url: string; claimUrl?: string; expiresAt?: string; siteRef?: string };
    sync?: boolean;
  },
): Promise<ToolOutput> {
  // A managed workspace's files are on this machine, out of reach of the agent's Artifact tool: hand it the page itself.
  const result = await publishArtifactCore({ ...input, workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, inlinePage: ctx.managedWorkspace === true });
  return { text: result.text, ...(result.page !== undefined ? { texts: [result.page] } : {}) };
}

/** restore_open_design_artifact: writes a synced artifact's working files back (openspec add-artifact-sync). */
export async function restoreArtifact(ctx: ToolContext, input: { pagePath: string; artifactUrl: string; overwrite?: boolean }): Promise<string> {
  const result = await restoreArtifactCore({ ...input, workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir });
  return result.text;
}

/** write_open_design_file: saves the agent's file unchanged in a managed workspace (index.ts refuses it anywhere else). */
export async function writeDesignFile(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const written = await writeManagedFile({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, path: input.path, content: input.content, encoding: input.encoding });
  return `Wrote ${written.path} (${written.bytes} bytes, sha256 ${written.sha256}) at ${written.absolutePath}. The file holds exactly the content you sent.`;
}

/**
 * publish_open_design_artifact_to_canva: instructions to get an artifact into Canva (connector-aware); writes nothing.
 * With uploadUrl and filePath (route B), it sends the export to that canva.com upload URL instead.
 */
export async function publishToCanva(ctx: ToolContext, input: { entryPath: string; filePath?: string; uploadUrl?: string }): Promise<string> {
  if (input.uploadUrl !== undefined || input.filePath !== undefined) {
    if (!input.uploadUrl || !input.filePath) return "Route B needs both uploadUrl (from Canva's create-upload-url) and filePath (the exported file). Nothing was uploaded.";
    return (await uploadToCanva({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath, filePath: input.filePath, uploadUrl: input.uploadUrl })).text;
  }
  const artifact = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath });
  if (!artifact) return `No artifact found at ${input.entryPath}. It may not have been written yet.`;
  const manifest = artifact.manifest as Record<string, unknown> | undefined;
  const metadata = manifest?.metadata as Record<string, unknown> | undefined;
  return composePublishCanvaTemplateInstructions({
    artifactEntryPath: input.entryPath,
    artifactContent: artifact.entryContent,
    manifestTitle: typeof manifest?.title === 'string' ? manifest.title : undefined,
    manifestKind: typeof manifest?.kind === 'string' ? manifest.kind : undefined,
    manifestFormat: typeof metadata?.format === 'string' ? metadata.format : undefined,
  });
}

/** publish_open_design_artifact_to_shop: Shopify connector instructions, or the upload-ready hand-off folder. Never contacts the shop. */
export async function publishToShop(ctx: ToolContext, input: { entryPaths: string[]; shop: Shop; data?: string; nameField?: string; folder?: boolean }): Promise<string> {
  // Browser path: OPEN_DESIGN_BROWSER_PATH is read by core's discovery itself.
  return publishToShopCore({ ...input, workspaceRoot: ctx.workspaceRoot, exportOptions: { outputDir: ctx.outputDir, layout: ctx.layout } });
}

/** push_open_design_artifact_to_figma: captures the artifact and writes use_figma parts; returns instructions. Never contacts Figma. */
export async function pushToFigma(ctx: ToolContext, input: { entryPath: string; refresh?: boolean }): Promise<string> {
  // Browser path: OPEN_DESIGN_BROWSER_PATH is read by core's discovery itself.
  return (await prepareFigmaPush({ ...input, workspaceRoot: ctx.workspaceRoot })).text;
}

/** Hand-written prompts (e.g. open-design-social-post) shipped under the content assets' prompts/ folder. */
export async function listLocalPrompts(ctx: ToolContext): Promise<LocalPrompt[]> {
  return (await loadLocalPrompts(ctx.assetsRoot)).filter((p) => !p.hosts || p.hosts.includes('mcp'));
}

export function buildLocalPromptMessage(prompt: LocalPrompt, brief: string | undefined): string {
  const briefText = brief?.trim() ? brief.trim() : `(none given yet — ask the user: "${prompt.placeholder}")`;
  return renderLocalPrompt(prompt, briefText);
}

function explorationContext(ctx: ToolContext, existingAppFrameworks?: string[]): ExplorationToolContext {
  // Browser path: OPEN_DESIGN_BROWSER_PATH is read by core's discovery itself.
  return { contentIndex: ctx.contentIndex, store: ctx.store, workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir, existingAppFrameworks };
}

export async function prepareExploration(ctx: ToolContext, input: PrepareExplorationInput): Promise<string> {
  return prepareExplorationCore(explorationContext(ctx, await detectExistingApp(ctx.workspaceRoot)), input);
}

export async function compareExploration(ctx: ToolContext, input: { explorationId: string; contactSheet?: boolean }): Promise<string> {
  return compareExplorationCore(explorationContext(ctx), input);
}

export async function chooseDirection(ctx: ToolContext, input: ChooseDirectionInput): Promise<string> {
  return chooseDirectionCore(explorationContext(ctx, await detectExistingApp(ctx.workspaceRoot)), input);
}

export async function readSource(ctx: ToolContext, input: { path: string }): Promise<string> {
  return readSourceTool(ctx, input);
}

/** find_open_design_3d_assets: searches Poly Haven for CC0 HDRIs, textures and models; writes nothing. */
export async function find3dAssets(_ctx: ToolContext, input: Find3dAssetsInput): Promise<string> {
  return formatFound3dAssets(await find3dAssetsCore(input));
}

// ── Recurring design jobs (openspec add-recurring-design-jobs) ────────────
// MCP only: VS Code has no scheduler. Browser path: OPEN_DESIGN_BROWSER_PATH
// is read by core's discovery itself.

/** start_open_design_job_run: validates the job, decides skip or run, records a started run and returns the steps. */
export async function startJobRun(ctx: ToolContext, input: { jobPath: string; runNow?: boolean }): Promise<string> {
  return formatStartJobRunResult(await startJobRunCore({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir }, input));
}

/** finish_open_design_job_run: browserless checks, the final status and the run record, plus a summary. */
export async function finishJobRun(ctx: ToolContext, input: FinishJobRunInput): Promise<string> {
  return formatFinishJobRunResult(await finishJobRunCore({ workspaceRoot: ctx.workspaceRoot, outputDir: ctx.outputDir }, input));
}
