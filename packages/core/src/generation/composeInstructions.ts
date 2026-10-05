// New, minimal instruction composer for this project — NOT a port of
// open-design's composeSystemPrompt(). See ../vendored/SOURCE.md for why.
import type { CraftSection, SkillMode } from '../content/contentIndex';
import type { PlannedDirection } from './explorationPlan';
import { composeCanvasSection, type CanvasFormat } from '../poster/formats';
import { composeSourceMaterialSection, composeSourceWorkflowSection, type SourceContext } from './sourceInstructions';

/**
 * Each design system's manifest.json carries its own `craft.suggested` list
 * (e.g. Starbucks suggests only `color` + `accessibility-baseline` out of
 * the full ~11-doc craft catalog). When a design system is active and it
 * names a non-empty suggestion list, narrow to that; otherwise (no design
 * system, or one with an empty/legacy-parsed suggestion list) fall back to
 * applying every craft doc, which was the only behavior before this filter
 * existed.
 */
export function selectCraftSections(all: CraftSection[], suggestedIds: string[] | undefined): CraftSection[] {
  if (!suggestedIds || suggestedIds.length === 0) return all;
  const suggested = new Set(suggestedIds);
  return all.filter((section) => suggested.has(section.id));
}

export interface CollectionSiblingScreen {
  role: string;
  title: string;
}

export interface CollectionContext {
  collectionName: string;
  index: number;
  total: number;
  role: string;
  siblingScreens: CollectionSiblingScreen[];
}

export interface ExplorationDirectionContext {
  explorationId: string;
  explorationTitle: string;
  direction: PlannedDirection;
  /** The other directions in this exploration, in plan order. */
  siblings: Array<{ id: string; label: string }>;
  index: number;
  total: number;
  /** `sketch` while exploring; `full` when building out the chosen direction. */
  fidelity: 'sketch' | 'full';
  skillMode: SkillMode;
  /** True when an active design system was deliberately left out for a visual exploration. */
  designSystemSetAside?: boolean;
  /** Build-out only: the registered sketch to extend. */
  startingPointPath?: string;
}

/** What "sketch" means for each kind of output. See design.md decision 4. */
export function sketchFidelityText(mode: SkillMode): string {
  if (mode === 'deck') {
    return 'Produce a **cover slide plus two content slides** only, not the whole deck. Make them representative of how the rest would look.';
  }
  if (mode === 'prototype' || mode === 'template' || mode === 'other') {
    return 'Produce **one screen**: what sits above the fold plus one key section below it, not the whole page. Make that one screen fully designed rather than a wireframe.';
  }
  return 'Produce **one representative view** of the output, not the full set.';
}

function bindingGuidance(direction: PlannedDirection): string {
  if (direction.axis === 'visual') {
    return "Bind this direction's `:root` palette and font stacks **verbatim**; do not improvise palette values. Honour its posture cues in layout, border, radius and accent choices.";
  }
  if (direction.axis === 'structure') {
    return "Keep the active design system's tokens exactly (if any). This direction changes **structure only**: layout, order and density. Apply its cues literally.";
  }
  return 'Follow this direction literally; it is what makes this version different from the others.';
}

function explorationSection(ctx: ExplorationDirectionContext): string {
  const { direction } = ctx;
  const parts: string[] = [];
  if (ctx.fidelity === 'sketch') {
    parts.push(
      `\n\n## Exploration — direction ${ctx.index} of ${ctx.total}: ${direction.label}\n\nThis is one of ${ctx.total} deliberately different directions for the same brief, in the exploration "${ctx.explorationTitle}". The user will compare them side by side and pick one, so **divergence matters more than polish**. ${bindingGuidance(direction)}\n\n${direction.spec.trim()}`,
    );
    if (ctx.siblings.length > 0) {
      parts.push(
        `\n\n### Differ from the other directions\n\nThe other directions in this exploration are:\n\n${ctx.siblings
          .map((s) => `- ${s.label} (\`${s.id}\`)`)
          .join('\n')}\n\nDo **not** resemble them. A person looking at all ${ctx.total} thumbnails side by side should see a different idea, not the same layout recoloured: vary the hero pattern, grid rhythm and type scale, not only the colours. Don't read their files.`,
      );
    }
    parts.push(`\n\n### Fidelity: sketch\n\n${sketchFidelityText(ctx.skillMode)} Use real copy where the brief gives it, and honest labelled placeholders otherwise.`);
  } else {
    parts.push(
      `\n\n## Build out the chosen direction: ${direction.label}\n\nThe user compared ${ctx.total} directions in the exploration "${ctx.explorationTitle}" and chose this one. Build it out at **full fidelity** (the complete page, deck or view the skill calls for). ${bindingGuidance(direction)}\n\n${direction.spec.trim()}`,
    );
    if (ctx.startingPointPath) {
      parts.push(
        `\n\n### Starting point\n\nRead the chosen sketch at \`${ctx.startingPointPath}\` with your own file tools and extend it, keeping its look, structure and copy. Leave the sketch file itself unchanged; write the full version to the output path below.`,
      );
    }
  }
  if (ctx.designSystemSetAside) {
    parts.push('\n\n### Design system set aside\n\nThe workspace has an active design system, but this is a **visual** exploration, so it is deliberately not applied here. Use this direction\'s tokens instead.');
  }
  return parts.join('');
}

/** The direction-specific part of an exploration brief: direction spec, divergence, fidelity, and Output. */
export function composeExplorationDirectionInstructions(ctx: ExplorationDirectionContext, suggestedEntryPath: string): string {
  const registerIds =
    ctx.fidelity === 'sketch'
      ? `**explorationId \`${ctx.explorationId}\` and directionId \`${ctx.direction.id}\`** so it joins the exploration's comparison page`
      : `**explorationId \`${ctx.explorationId}\` but no directionId** (this is the built-out version, not a sketch), so the comparison page links to it`;
  return (
    explorationSection(ctx) +
    `\n\n## Output\n\nWrite the entry file at exactly \`${suggestedEntryPath}\` (don't rename it). Write any supporting files as siblings in that directory. After writing all files, call register_open_design_artifact with that entry path, a kind, a title, the supporting file paths (relative to the entry file's own directory), and ${registerIds}.`
  );
}

export interface ComposeInstructionsInput {
  skillName: string;
  skillBody: string;
  designSystemTitle?: string;
  designSystemBody?: string;
  craftSections?: CraftSection[];
  brief: string;
  suggestedEntryPath: string;
  /** Framework names detected in the workspace's own package.json (see appDetection.ts), if any. */
  existingAppFrameworks?: string[];
  /** Set when this artifact is one screen of a multi-screen design collection — see workspace/collectionScan.ts. */
  collectionContext?: CollectionContext;
  /** Daemon-free replacement/notice for the skill's daemon-backed steps — see hostOverrides.ts. */
  hostOverride?: string;
  /** Set for one direction of a design exploration — see explorationPlan.ts. */
  explorationContext?: ExplorationDirectionContext;
  /**
   * Leave out the file-naming and Output sections. Used for an exploration's
   * shared instructions, where each direction gets its own output section
   * from composeExplorationDirectionInstructions().
   */
  omitOutput?: boolean;
  /** Set when generating from source documents — see sourceInstructions.ts. */
  sourceContext?: SourceContext;
  /** Set when the brief targets a named canvas format — see ../poster/formats.ts. */
  canvasFormat?: CanvasFormat;
}

export function composeInstructions(input: ComposeInstructionsInput): string {
  const parts: string[] = [];

  parts.push(
    `# Open Design generation brief\n\nYou are authoring a new design artifact using the Open Design skill "${input.skillName}". Follow the skill's workflow below, treat the active design system's tokens (if any) as authoritative, and author the files yourself with your own file-editing tools — do not look for any tool that writes design content on your behalf.\n\n**Everything below is delivered to you as plain text; none of it is a file path you can open.** The skill text, craft rules, and design system notes below are copied verbatim from Open Design's own upstream catalog and may mention file names or source paths (e.g. "example.html", "apps/daemon/src/...", a "Resource map" of sibling files) that describe Open Design's own separate codebase or runtime — none of those exist in this workspace or are readable by you. Never search for, open, or navigate to any file path mentioned anywhere below; if you want reference examples, call remix_open_design_example or list_open_design_skills instead of searching the filesystem. Treat every path-looking string below as descriptive prose only.`,
  );

  parts.push(`\n\n## User's brief\n\n${input.brief.trim()}`);

  if (input.sourceContext && input.sourceContext.sources.length > 0) {
    parts.push(`\n\n${composeSourceMaterialSection(input.sourceContext)}`);
  }

  if (input.designSystemBody && input.designSystemBody.trim().length > 0) {
    parts.push(
      `\n\n## Active design system${input.designSystemTitle ? ` — ${input.designSystemTitle}` : ''}\n\nTreat the following as authoritative for color, typography, spacing, and component rules. Do not invent tokens outside this palette.\n\n${input.designSystemBody.trim()}`,
    );
  }

  parts.push(`\n\n## Active skill — ${input.skillName}\n\nFollow this skill's workflow exactly (see the disclaimer above about path-looking text).\n\n${input.skillBody.trim()}`);

  if (input.hostOverride) {
    parts.push(`\n\n## Host override — takes precedence over the skill text above\n\n${input.hostOverride.trim()}`);
  }

  if (input.canvasFormat) {
    parts.push(`\n\n${composeCanvasSection(input.canvasFormat)}\n\nThis canvas takes precedence over any size the skill text above names.`);
  }

  if (input.craftSections && input.craftSections.length > 0) {
    parts.push(
      `\n\n## Universal craft rules\n\nApply these general design-quality rules regardless of skill or design system.\n\n${input.craftSections
        .map((s) => `### ${s.id}\n\n${s.body.trim()}`)
        .join('\n\n')}`,
    );
  }

  if (input.existingAppFrameworks && input.existingAppFrameworks.length > 0) {
    parts.push(
      `\n\n## This workspace already contains an application\n\nDetected: ${input.existingAppFrameworks.join(', ')}. Before generating, consider looking at a few of its real existing components/pages for actual conventions (styling approach, layout patterns, component structure) with your own file-reading tools, so the artifact you produce is closer to how this app already looks. This does NOT change where or how you write the artifact — it's still a standalone prototype at the output path below, not a real app file; it's purely a nudge toward visual consistency, not a requirement to integrate with the app's code.`,
    );
  }

  if (input.collectionContext) {
    const { collectionName, index, total, role, siblingScreens } = input.collectionContext;
    const siblingsText =
      siblingScreens.length > 0
        ? siblingScreens.map((s) => `- **${s.role}** — "${s.title}"`).join('\n')
        : '(none yet — this is the first screen)';
    parts.push(
      `\n\n## Part of a design collection\n\nThis artifact is screen ${index} of ${total} in the design collection "${collectionName}" — this screen's role: **${role}**. The other screens in this collection so far:\n\n${siblingsText}\n\nKeep this screen visually and stylistically consistent with the others (same design system, same header/nav treatment, same component style) without re-reading their HTML — you already have their role and title above as context. Do not duplicate content that belongs on a different screen.`,
    );
  }

  if (input.sourceContext && input.sourceContext.sources.length > 0) {
    parts.push(`\n\n${composeSourceWorkflowSection(input.sourceContext)}`);
  }

  if (input.explorationContext) {
    parts.push(composeExplorationDirectionInstructions(input.explorationContext, input.suggestedEntryPath));
    return parts.join('');
  }
  if (input.omitOutput) return parts.join('');

  parts.push(
    `\n\n## Semantic output file names\n\nChoose a short semantic filename derived from the brief, product, or artifact type rather than always writing \`index.html\`. Good examples: \`coffee-shop-landing.html\`, \`investor-pitch-deck.html\`, \`refund-dashboard.html\`. Use \`index.html\` only when the skill's own convention requires a fixed entry name.`,
  );

  parts.push(
    `\n\n## Output\n\nAuthor the artifact's entry file at \`${input.suggestedEntryPath}\` (adjust the filename to follow the semantic-naming guidance above, or the skill's own fixed-name convention, but keep it under the same directory). Write any supporting files (stylesheets, scripts, imported assets) as siblings under that directory. After writing all files, call register_open_design_artifact with the entry path, a kind, a title, and the supporting file paths (relative to the entry file's own directory)${input.canvasFormat ? `, and \`format: "${input.canvasFormat.id}"\`` : ''} so it is recognized as an Open Design artifact.`,
  );

  return parts.join('');
}
