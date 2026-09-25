import * as path from 'node:path';
import {
  composeCustomDesignSystemInstructions,
  composeDesignSystemTokensInstructions,
  composeInstructions,
  composePortToAppInstructions,
  composePullFigmaInstructions,
  copyExampleArtifact,
  detectExistingApp,
  exportArtifact as exportArtifactCore,
  exportsForKind,
  formatExportResult,
  loadLocalPrompts,
  renderLocalPrompt,
  extractBrandEvidence,
  fetchFigmaFrameImage,
  fetchFigmaNode,
  findCollectionArtifacts,
  hostOverrideFor,
  parseFigmaUrl,
  readArtifact,
  readArtifactComments,
  resolveActiveDesignSystem,
  selectCraftSections,
  setActiveDesignSystem,
  suggestCollectionScreenEntryPath,
  summarizeFigmaNode,
  suggestTargetComponentPath,
  writeArtifactManifest,
  FigmaApiError,
  type ActiveDesignSystemStore,
  type ContentIndex,
  type ExportFormat,
  type LocalPrompt,
} from '@feimacode/open-design-agent-kit-core';

export interface ToolContext {
  contentIndex: ContentIndex;
  store: ActiveDesignSystemStore;
  workspaceRoot: string;
  outputDir: string;
  assetsRoot: string;
  figmaToken?: string;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'artifact';
}

function suggestEntryPath(ctx: ToolContext, brief: string, skillName: string): string {
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

export async function listSkills(
  ctx: ToolContext,
  input: { query?: string; mode?: string; source?: string; remixableOnly?: boolean },
): Promise<unknown> {
  const skills = await ctx.contentIndex.listSkills(input.query, input.mode, input.source, input.remixableOnly);
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    triggers: s.triggers,
    category: s.category,
    mode: s.mode,
    source: s.source,
    examplePrompt: s.examplePrompt,
    exampleArtifactPath: s.exampleArtifactPath,
  }));
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
  },
): Promise<string> {
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
  const craftSections = selectCraftSections(allCraftSections, designSystem?.craftSuggested);
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
    suggestedEntryPath = suggestEntryPath(ctx, input.brief, skill.name);
  }

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
  });

  const payload = {
    instructions,
    suggestedEntryPath,
    suggestedKind: 'html',
    designSystemId: designSystem ? designSystemId : undefined,
    designSystemName: designSystem?.name,
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
  },
): Promise<string> {
  const renderer = KIND_TO_RENDERER[input.kind];
  const exportsList = exportsForKind(input.kind);
  if (!renderer || !exportsList) {
    return `Unsupported kind "${input.kind}". Allowed: ${Object.keys(KIND_TO_RENDERER).join(', ')}`;
  }

  try {
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
      },
    });

    return `Artifact registered at ${input.entryPath}.artifact.json\n\n${JSON.stringify(manifest, null, 2)}\n\nWritten to ${path.join(ctx.workspaceRoot, input.entryPath)}. This host has no live preview editor — there is nothing further to open.`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Failed to register artifact: ${message}`;
  }
}

export async function getArtifact(ctx: ToolContext, input: { entryPath: string }): Promise<string> {
  const result = await readArtifact({ workspaceRoot: ctx.workspaceRoot, entryPath: input.entryPath });
  if (!result) {
    return `No artifact found at ${input.entryPath}. It may not have been written yet.`;
  }
  const comments = await readArtifactComments(ctx.workspaceRoot, input.entryPath);
  const openComments = comments.filter((c) => c.status === 'open');
  const payload = {
    manifest: result.manifest,
    supportingFiles: result.supportingFiles,
    entryContent: result.entryContent,
    openComments,
  };
  return JSON.stringify(payload, null, 2);
}

export async function setActiveDesignSystemTool(ctx: ToolContext, input: { designSystemId?: string }): Promise<string> {
  const result = await setActiveDesignSystem(input.designSystemId, ctx.store, (id) => ctx.contentIndex.getDesignSystem(id));
  if (result.outcome === 'cleared') return 'Cleared the active Open Design design system.';
  if (result.outcome === 'unknown') {
    const available = (await ctx.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
    return `Unknown designSystemId "${result.unknownId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`;
  }
  return `Active Open Design design system set to "${input.designSystemId}" (${result.designSystem.name}).`;
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

export async function pullFigmaFrame(ctx: ToolContext, input: { figmaUrl: string; designSystemId?: string }): Promise<string> {
  if (!ctx.figmaToken) {
    return 'No Figma access token configured. Set the OPEN_DESIGN_FIGMA_TOKEN environment variable for this MCP server to a Figma personal access token (Figma → Settings → Personal access tokens) and try again.';
  }

  const ref = parseFigmaUrl(input.figmaUrl);
  if (!ref) {
    return `"${input.figmaUrl}" does not look like a Figma file/design URL.`;
  }

  let node;
  try {
    node = await fetchFigmaNode(ctx.figmaToken, ref);
  } catch (err) {
    return err instanceof FigmaApiError ? err.message : `Failed to fetch the Figma frame: ${err instanceof Error ? err.message : String(err)}`;
  }

  const frameSummary = summarizeFigmaNode(node);
  const imageUrl = await fetchFigmaFrameImage(ctx.figmaToken, ref.fileKey, ref.nodeId!);
  const slug = slugify(node.name);
  const suggestedEntryPath = path.posix.join(ctx.outputDir, 'figma', `${slug}.html`);

  const instructions = composePullFigmaInstructions({
    frameSummary,
    frameName: node.name,
    imageUrl,
    designSystemId: input.designSystemId,
    suggestedEntryPath,
  });

  return JSON.stringify({ instructions, suggestedEntryPath }, null, 2);
}

export async function remixExample(ctx: ToolContext, input: { skillId: string }): Promise<string> {
  const skill = await ctx.contentIndex.getSkill(input.skillId);
  if (!skill) {
    const available = (await ctx.contentIndex.listSkills()).map((s) => s.id).slice(0, 20);
    return `Unknown skillId "${input.skillId}". Call list_open_design_skills to see available ids. A few available ids: ${available.join(', ')}`;
  }
  if (!skill.exampleArtifactPath) {
    return `"${input.skillId}" has no remixable starting artifact. Check each result's 'exampleArtifactPath' field via list_open_design_skills, or use prepare_open_design_brief to generate from scratch instead.`;
  }

  const slug = slugify(skill.name);
  const entryPath = `${ctx.outputDir}/${slug}/${slug}.html`;

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
  },
): Promise<string> {
  // Browser path: OPEN_DESIGN_BROWSER_PATH is read by core's discovery itself.
  const result = await exportArtifactCore({
    ...input,
    workspaceRoot: ctx.workspaceRoot,
    lookupAspectHint: async (id) => (await ctx.contentIndex.getSkill(id))?.aspectHint,
  });
  return formatExportResult(result);
}

/** Hand-written prompts (e.g. open-design-social-post) shipped under the content assets' prompts/ folder. */
export function listLocalPrompts(ctx: ToolContext): Promise<LocalPrompt[]> {
  return loadLocalPrompts(ctx.assetsRoot);
}

export function buildLocalPromptMessage(prompt: LocalPrompt, brief: string | undefined): string {
  const briefText = brief?.trim() ? brief.trim() : `(none given yet — ask the user: "${prompt.placeholder}")`;
  return renderLocalPrompt(prompt, briefText);
}
