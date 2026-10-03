// Host-agnostic implementations of the three exploration tools
// (prepare_open_design_exploration, compare_open_design_exploration,
// choose_open_design_direction). The MCP server and the VS Code tools only
// adapt arguments and wrap the returned text. See
// openspec/changes/add-explorations/design.md.

import * as path from 'node:path';
import type { ContentIndex, DesignSystemDetail } from '../content/contentIndex';
import { resolveActiveDesignSystem, type ActiveDesignSystemStore } from '../workspace/activeDesignSystemStore';
import { renderExplorationContactSheet, refreshExplorationCompare } from '../workspace/explorationCompare';
import {
  allocateExplorationId,
  directionArtifactMap,
  explorationDir,
  explorationPaths,
  explorationTitleFromBrief,
  findExplorationArtifacts,
  isValidExplorationId,
  readExplorationPlan,
  writeExplorationPlan,
  type ChooseNext,
  type ExplorationPlan,
} from '../workspace/explorationStore';
import { composeExplorationDirectionInstructions, composeInstructions, selectCraftSections } from './composeInstructions';
import { composeCustomDesignSystemInstructions } from './customDesignSystemInstructions';
import { resolveExplorationDirections, slugifyExplorationPart, type CustomDirectionInput } from './explorationPlan';
import { hostOverrideFor } from './hostOverrides';

export interface ExplorationToolContext {
  contentIndex: ContentIndex;
  store: ActiveDesignSystemStore;
  /** Undefined when the host has no open workspace (VS Code with no folder). */
  workspaceRoot: string | undefined;
  outputDir: string;
  /** Framework names detected in the workspace (see appDetection.ts). */
  existingAppFrameworks?: string[];
  browserPath?: string;
}

export interface PrepareExplorationInput {
  skillId: string;
  brief: string;
  count?: number;
  axis?: string;
  directionIds?: string[];
  customDirections?: CustomDirectionInput[];
  designSystemId?: string;
}

export const CHOOSE_NEXT_VALUES: readonly ChooseNext[] = ['build-out', 'merge', 'save-design-system'];

const NO_WORKSPACE = 'No workspace folder is open. Open a folder before starting a design exploration; its files are written into the workspace.';

function kindForMode(mode: string): string {
  return mode === 'deck' ? 'deck' : 'html';
}

export async function prepareExploration(ctx: ExplorationToolContext, input: PrepareExplorationInput): Promise<string> {
  if (!ctx.workspaceRoot) return NO_WORKSPACE;
  if (!input.brief?.trim()) return 'brief is required: the request in the user\'s words.';

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

  const resolved = resolveExplorationDirections({
    count: input.count,
    axis: input.axis,
    directionIds: input.directionIds,
    customDirections: input.customDirections,
    hasActiveDesignSystem: Boolean(designSystem),
    skillMode: skill.mode,
  });
  if (!resolved.ok) return resolved.error;

  const title = explorationTitleFromBrief(input.brief);
  const explorationId = await allocateExplorationId(ctx.workspaceRoot, ctx.outputDir, title);
  const dir = explorationDir(ctx.outputDir, explorationId);
  const directions = resolved.directions.map((d) => ({ ...d, entryPath: path.posix.join(dir, `${d.id}.html`) }));
  const appliedDesignSystem = resolved.designSystemSetAside ? undefined : designSystem;

  const craftSections = selectCraftSections(await ctx.contentIndex.craftSections(), appliedDesignSystem?.craftSuggested);
  const sharedInstructions = composeInstructions({
    skillName: skill.name,
    skillBody: skill.body,
    designSystemTitle: appliedDesignSystem?.name,
    designSystemBody: appliedDesignSystem?.body,
    craftSections,
    brief: input.brief,
    suggestedEntryPath: directions[0].entryPath,
    existingAppFrameworks: ctx.existingAppFrameworks,
    hostOverride: hostOverrideFor(skill.id, skill.body),
    omitOutput: true,
  });

  const plan: ExplorationPlan = {
    version: 1,
    explorationId,
    title,
    brief: input.brief.trim(),
    skillId: skill.id,
    skillMode: skill.mode,
    axis: resolved.axis,
    designSystemId: designSystem ? designSystemId : undefined,
    designSystemName: designSystem?.name,
    designSystemSetAside: resolved.designSystemSetAside || undefined,
    createdAt: new Date().toISOString(),
    directions,
  };
  await writeExplorationPlan(ctx.workspaceRoot, ctx.outputDir, plan);
  const compare = await refreshExplorationCompare(ctx.workspaceRoot, ctx.outputDir, explorationId);

  const payload = {
    explorationId,
    title,
    axis: resolved.axis,
    designSystemId: plan.designSystemId,
    designSystemName: plan.designSystemName,
    designSystemSetAside: resolved.designSystemSetAside
      ? `The active design system "${designSystem?.name}" is deliberately NOT applied: this is a visual exploration, so each direction brings its own tokens. Tell the user.`
      : undefined,
    comparePath: compare.ok ? compare.comparePath : undefined,
    howToUse:
      `Generate ${directions.length} directions. For each one, follow sharedInstructions followed by that direction's instructions: write its file at its suggestedEntryPath, then register it with this explorationId and its directionId. ` +
      'If you can delegate to sub-agents, generate the directions in parallel and pass each one sharedInstructions plus its own instructions. ' +
      'When all are registered, call compare_open_design_exploration (contactSheet: true), check the directions really differ, then show the user and ask which one to take forward.',
    sharedInstructions,
    directions: directions.map((d, i) => ({
      directionId: d.id,
      label: d.label,
      suggestedEntryPath: d.entryPath,
      suggestedKind: kindForMode(skill.mode),
      instructions: composeExplorationDirectionInstructions(
        {
          explorationId,
          explorationTitle: title,
          direction: d,
          siblings: directions.filter((o) => o.id !== d.id).map((o) => ({ id: o.id, label: o.label })),
          index: i + 1,
          total: directions.length,
          fidelity: 'sketch',
          skillMode: skill.mode,
          designSystemSetAside: resolved.designSystemSetAside,
        },
        d.entryPath,
      ),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function compareExploration(ctx: ExplorationToolContext, input: { explorationId: string; contactSheet?: boolean }): Promise<string> {
  if (!ctx.workspaceRoot) return NO_WORKSPACE;
  const compare = await refreshExplorationCompare(ctx.workspaceRoot, ctx.outputDir, input.explorationId);
  if (!compare.ok) return compare.warning;

  let contactSheetPath: string | undefined;
  let contactSheetNote: string | undefined;
  if (input.contactSheet) {
    if (compare.registered.length === 0) {
      contactSheetNote = 'Contact sheet skipped: no direction has been registered yet.';
    } else {
      const sheet = await renderExplorationContactSheet({
        workspaceRoot: ctx.workspaceRoot,
        outputDir: ctx.outputDir,
        explorationId: input.explorationId,
        browserPath: ctx.browserPath,
      });
      if (sheet.ok) {
        contactSheetPath = sheet.path;
        if (sheet.warnings.length > 0) contactSheetNote = sheet.warnings.join('\n');
      } else {
        contactSheetNote = sheet.reason;
      }
    }
  }

  const payload = {
    explorationId: input.explorationId,
    title: compare.plan.title,
    comparePath: compare.comparePath,
    compareFile: path.join(ctx.workspaceRoot, compare.comparePath),
    registered: compare.registered,
    missing: compare.missing,
    chosen: compare.plan.chosen?.directionId,
    contactSheetPath,
    contactSheetNote,
    next:
      compare.missing.length > 0
        ? `Directions still missing: ${compare.missing.join(', ')}. Generate and register them before presenting.`
        : (contactSheetPath
            ? 'If you can view images, open the contact sheet and check that the directions are visibly different (layout and hero pattern, not just colour); regenerate any that look like another. '
            : '') +
          'Then show the user the comparison page path (it opens in any browser from the file system) and ask which direction to take forward, and whether to build it out, merge in parts of another, or save it as a design system.',
  };
  return JSON.stringify(payload, null, 2);
}

export interface ChooseDirectionInput {
  explorationId: string;
  directionId: string;
  next: string;
  notes?: string;
  mergeFrom?: Array<{ directionId: string; aspect: string }>;
}

export async function chooseDirection(ctx: ExplorationToolContext, input: ChooseDirectionInput): Promise<string> {
  if (!ctx.workspaceRoot) return NO_WORKSPACE;
  if (!CHOOSE_NEXT_VALUES.includes(input.next as ChooseNext)) {
    return `Unknown next "${input.next}". Allowed: ${CHOOSE_NEXT_VALUES.join(', ')}.`;
  }
  const next = input.next as ChooseNext;
  if (!isValidExplorationId(input.explorationId)) return `Invalid explorationId "${input.explorationId}".`;
  const plan = await readExplorationPlan(ctx.workspaceRoot, ctx.outputDir, input.explorationId);
  if (!plan) return `No exploration found with explorationId "${input.explorationId}".`;

  const direction = plan.directions.find((d) => d.id === input.directionId);
  if (!direction) {
    return `Unknown directionId "${input.directionId}" in exploration "${plan.explorationId}". Its directions: ${plan.directions.map((d) => d.id).join(', ')}.`;
  }
  const artifacts = directionArtifactMap(await findExplorationArtifacts(ctx.workspaceRoot, ctx.outputDir, plan.explorationId, plan));
  const sketch = artifacts.get(direction.id);
  if (!sketch) {
    return `Direction "${direction.id}" hasn't been generated and registered yet. Generate it (write ${direction.entryPath}, then register it with explorationId and directionId) before choosing it.`;
  }

  const mergeSources: Array<{ label: string; entryPath: string; aspect: string }> = [];
  if (next === 'merge') {
    if (!input.mergeFrom?.length) {
      return 'next "merge" needs mergeFrom: a list of { directionId, aspect } naming what to take from which other direction (e.g. { directionId: "editorial-monocle", aspect: "hero" }).';
    }
    for (const m of input.mergeFrom) {
      const source = plan.directions.find((d) => d.id === m.directionId);
      const sourceArtifact = source ? artifacts.get(source.id) : undefined;
      if (!source || source.id === direction.id) {
        return `mergeFrom directionId "${m.directionId}" must be another direction of this exploration (${plan.directions
          .filter((d) => d.id !== direction.id)
          .map((d) => d.id)
          .join(', ')}).`;
      }
      if (!sourceArtifact) return `mergeFrom direction "${source.id}" hasn't been registered yet, so there's nothing to take from it.`;
      if (!m.aspect?.trim()) return `mergeFrom entry for "${source.id}" needs an aspect, e.g. "hero" or "colour palette".`;
      mergeSources.push({ label: source.label, entryPath: sourceArtifact.entryPath, aspect: m.aspect.trim() });
    }
  }

  const notes = input.notes?.trim();
  const dir = explorationDir(ctx.outputDir, plan.explorationId);
  let instructions: string;
  let suggestedEntryPath: string;
  let suggestedKind: string | undefined;
  let designSystemIdOut: string | undefined;

  if (next === 'save-design-system') {
    const name = direction.label.split(/\s+[—-]\s+/)[0].trim() || direction.label;
    const slug = slugifyExplorationPart(`${plan.explorationId}-${direction.id}`, 'exploration-direction');
    designSystemIdOut = `user:${slug}`;
    suggestedEntryPath = path.posix.join(ctx.outputDir, 'design-systems', slug, 'DESIGN.md');
    const brief = [
      `Derived from the "${direction.label}" direction the user chose in the design exploration "${plan.title}" (brief: ${plan.brief}).`,
      `Read the chosen sketch at \`${sketch.entryPath}\` with your own file tools and treat its \`:root\` custom properties, fonts, radii and spacing as the source of truth for the tokens; the direction's spec below is the intent behind them.`,
      notes ? `User notes: ${notes}` : '',
      `\n${direction.spec.trim()}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    instructions = composeCustomDesignSystemInstructions({ name, brief, suggestedEntryPath, id: designSystemIdOut });
  } else {
    const skill = await ctx.contentIndex.getSkill(plan.skillId);
    if (!skill) return `The exploration's skill "${plan.skillId}" is no longer available.`;
    let designSystem: DesignSystemDetail | undefined;
    if (plan.designSystemId && !plan.designSystemSetAside) designSystem = await ctx.contentIndex.getDesignSystem(plan.designSystemId);
    suggestedEntryPath = path.posix.join(dir, next === 'merge' ? 'merged.html' : `${direction.id}-full.html`);
    suggestedKind = kindForMode(skill.mode);
    const briefParts = [plan.brief];
    if (notes) briefParts.push(`User notes on the chosen direction: ${notes}`);
    if (mergeSources.length > 0) {
      briefParts.push(
        `Merge: keep the chosen direction as the base, but take these aspects from other directions, adapting them to the base's tokens so the result reads as one design:\n${mergeSources
          .map((m) => `- **${m.aspect}** from "${m.label}" (read \`${m.entryPath}\`)`)
          .join('\n')}`,
      );
    }
    instructions = composeInstructions({
      skillName: skill.name,
      skillBody: skill.body,
      designSystemTitle: designSystem?.name,
      designSystemBody: designSystem?.body,
      craftSections: selectCraftSections(await ctx.contentIndex.craftSections(), designSystem?.craftSuggested),
      brief: briefParts.join('\n\n'),
      suggestedEntryPath,
      existingAppFrameworks: ctx.existingAppFrameworks,
      hostOverride: hostOverrideFor(skill.id, skill.body),
      explorationContext: {
        explorationId: plan.explorationId,
        explorationTitle: plan.title,
        direction,
        siblings: [],
        index: plan.directions.indexOf(direction) + 1,
        total: plan.directions.length,
        fidelity: 'full',
        skillMode: skill.mode,
        designSystemSetAside: plan.designSystemSetAside,
        startingPointPath: sketch.entryPath,
      },
    });
  }

  plan.chosen = { directionId: direction.id, next, notes: notes || undefined, chosenAt: new Date().toISOString() };
  await writeExplorationPlan(ctx.workspaceRoot, ctx.outputDir, plan);
  const compare = await refreshExplorationCompare(ctx.workspaceRoot, ctx.outputDir, plan.explorationId);

  const payload = {
    explorationId: plan.explorationId,
    chosen: direction.id,
    next,
    suggestedEntryPath,
    suggestedKind,
    id: designSystemIdOut,
    comparePath: compare.ok ? compare.comparePath : explorationPaths(ctx.outputDir, plan.explorationId).compare,
    afterwards:
      next === 'save-design-system'
        ? 'Once it is active, later requests (including multi-screen collections) use it automatically.'
        : 'Once registered, it can be exported, extended into a multi-screen collection, or ported into the app with port_open_design_artifact_to_app.',
    instructions,
  };
  return JSON.stringify(payload, null, 2);
}
