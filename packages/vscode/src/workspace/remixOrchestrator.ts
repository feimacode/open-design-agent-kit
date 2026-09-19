import { copyExampleArtifact, type ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot, getOutputDirectory, slugify, registerArtifact } from './artifactWriter';

export interface RemixResult {
  entryPath: string;
  displayName: string;
  instructions: string;
  manifest: unknown;
}

export type RemixOutcome = { ok: true; result: RemixResult } | { ok: false; error: string };

/**
 * Shared by remixExampleTool.ts (the languageModelTool) and
 * browseGalleryCommand.ts (the QuickPick command), so the actual copy +
 * register logic exists once. Kept out of the tool class itself so the
 * command doesn't need to go through vscode.lm.invokeTool's confirmation
 * ceremony just to reuse it.
 */
export async function performRemix(contentIndex: ContentIndex, assetsRoot: string, skillId: string): Promise<RemixOutcome> {
  const skill = await contentIndex.getSkill(skillId);
  if (!skill) {
    const available = (await contentIndex.listSkills()).map((s) => s.id).slice(0, 20);
    return { ok: false, error: `Unknown skillId "${skillId}". Call list_open_design_skills to see available ids. A few available ids: ${available.join(', ')}` };
  }

  if (!skill.exampleArtifactPath) {
    return {
      ok: false,
      error: `"${skillId}" has no remixable starting artifact. Check each result's 'exampleArtifactPath' field via list_open_design_skills, or use prepare_open_design_brief to generate from scratch instead.`,
    };
  }

  const workspaceRoot = getWorkspaceRoot();
  const slug = slugify(skill.name);
  const entryPath = `${getOutputDirectory()}/${slug}/${slug}.html`;

  const { supportingFiles } = await copyExampleArtifact({
    assetsRoot,
    exampleArtifactPath: skill.exampleArtifactPath,
    workspaceRoot,
    entryPath,
  });

  const manifest = await registerArtifact({
    entryPath,
    artifactManifest: {
      kind: 'html',
      renderer: 'html',
      exports: ['html', 'pdf', 'zip'],
      title: skill.name,
      supportingFiles,
      sourceSkillId: skillId,
      metadata: { remixedFrom: skillId },
    },
  });

  const brief =
    skill.examplePrompt ?? `Adapt this example ("${skill.name}") to the user's specific request, keeping its overall visual approach.`;

  const instructions = `The file at "${entryPath}" already exists — it's a copy of the "${skill.name}" example. Read it first, then apply the following as a targeted MODIFICATION to the existing content, not a from-scratch regeneration:\n\n${brief}\n\nAfter making changes, call register_open_design_artifact again with the same entryPath if the kind/title/supportingFiles need updating. Its preview has already been opened automatically in the OpenDesign Artifact Preview editor — do not also open the file yourself (e.g. in Simple Browser or via a file:// URL) to show the result.`;

  return { ok: true, result: { entryPath, displayName: skill.name, instructions, manifest } };
}
