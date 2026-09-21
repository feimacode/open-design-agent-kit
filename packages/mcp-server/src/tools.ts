import * as path from 'node:path';
import {
  composeCustomDesignSystemInstructions,
  composeInstructions,
  composePortToAppInstructions,
  copyExampleArtifact,
  detectExistingApp,
  extractBrandEvidence,
  readArtifact,
  readArtifactComments,
  resolveActiveDesignSystem,
  selectCraftSections,
  setActiveDesignSystem,
  suggestTargetComponentPath,
  writeArtifactManifest,
  type ActiveDesignSystemStore,
  type ContentIndex,
} from '@feimacode/open-design-agent-kit-core';

export interface ToolContext {
  contentIndex: ContentIndex;
  store: ActiveDesignSystemStore;
  workspaceRoot: string;
  outputDir: string;
  assetsRoot: string;
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

const KIND_TO_EXPORTS: Record<string, string[]> = {
  html: ['html', 'pdf', 'zip'],
  deck: ['html', 'pdf', 'zip'],
  'react-component': ['jsx', 'zip'],
  'markdown-document': ['md', 'html', 'pdf', 'zip'],
  svg: ['svg', 'zip'],
  diagram: ['svg', 'zip'],
  'code-snippet': ['txt', 'zip'],
  'mini-app': ['zip'],
  'design-system': ['zip'],
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
  input: { skillId: string; designSystemId?: string; brief: string },
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
  const suggestedEntryPath = suggestEntryPath(ctx, input.brief, skill.name);
  const existingAppFrameworks = await detectExistingApp(ctx.workspaceRoot);

  const instructions = composeInstructions({
    skillName: skill.name,
    skillBody: skill.body,
    designSystemTitle: designSystem?.name,
    designSystemBody: designSystem?.body,
    craftSections,
    brief: input.brief,
    suggestedEntryPath,
    existingAppFrameworks,
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
  },
): Promise<string> {
  const renderer = KIND_TO_RENDERER[input.kind];
  const exportsList = KIND_TO_EXPORTS[input.kind];
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
  if (result.outcome === 'cleared') return 'Cleared the active OpenDesign design system.';
  if (result.outcome === 'unknown') {
    const available = (await ctx.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
    return `Unknown designSystemId "${result.unknownId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`;
  }
  return `Active OpenDesign design system set to "${input.designSystemId}" (${result.designSystem.name}).`;
}

export async function createCustomDesignSystem(
  ctx: ToolContext,
  input: { name: string; brief: string; sourceUrl?: string },
): Promise<string> {
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
      exports: ['html', 'pdf', 'zip'],
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
