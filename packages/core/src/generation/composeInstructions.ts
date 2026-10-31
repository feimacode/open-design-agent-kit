// New, minimal instruction composer for this project — NOT a port of
// open-design's composeSystemPrompt(). See ../vendored/SOURCE.md for why.
import type { CraftSection, SkillMode } from '../content/contentIndex';
import type { PlannedDirection } from './explorationPlan';
import { composeCanvasSection, composeFluidCanvasSection, type CanvasFormat } from '../poster/formats';
import { composeSourceMaterialSection, composeSourceWorkflowSection, type SourceContext } from './sourceInstructions';
import { composeDecisionsSection, composeRegisterBriefNote, type BriefDecisions } from './briefDecisions';
import { composeRecentDesignsSection, type RecentDesignsContext } from '../workspace/designHistory';

const CRAFT_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function normalizeCraftSlugs(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== 'string') continue;
    const slug = value.trim().toLowerCase();
    if (!CRAFT_SLUG.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export interface CraftRequirements {
  /** The skill's `od.craft.requires`. */
  skillRequires?: readonly string[];
  /** The skill's mode: decks always get `typography`. */
  skillMode?: SkillMode;
  /** The active design system's manifest `craft.applies`. */
  designSystemApplies?: readonly string[];
  /** The active design system's manifest `craft.exemptions`. */
  designSystemExemptions?: readonly string[];
}

/**
 * The craft docs for one brief, resolved as upstream Open Design does
 * (`resolveCraftRequirements` + `loadCraftSections` in apps/daemon/src/craft.ts,
 * open-design 7abd6fc2b1; openspec match-upstream-craft-selection): the
 * skill's requires, the design system's applies and `typography` for decks,
 * minus the design system's exemptions, deduplicated in that order. Slugs
 * with no craft doc are skipped, so skills can name docs not written yet.
 * A design system's `craft.suggested` list is metadata and isn't used.
 */
/** The craft requirements of a skill and the design system applied with it. */
export function craftRequirementsFor(
  skill: { craftRequires?: readonly string[]; mode?: SkillMode },
  designSystem?: { craftApplies?: readonly string[]; craftExemptions?: readonly string[] },
): CraftRequirements {
  return { skillRequires: skill.craftRequires, skillMode: skill.mode, designSystemApplies: designSystem?.craftApplies, designSystemExemptions: designSystem?.craftExemptions };
}

export function resolveCraftSections(all: CraftSection[], req: CraftRequirements): CraftSection[] {
  const requested = normalizeCraftSlugs([...(req.skillRequires ?? []), ...(req.designSystemApplies ?? []), ...(req.skillMode === 'deck' ? ['typography'] : [])]);
  const excluded = new Set(normalizeCraftSlugs(req.designSystemExemptions));
  const byId = new Map(all.map((section) => [section.id, section]));
  return requested.filter((slug) => !excluded.has(slug)).flatMap((slug) => byId.get(slug) ?? []);
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
  /** With canvasFormat: the fluid (reflowing) contract instead of the fixed one — see ../poster/formats.ts. */
  fluid?: boolean;
  /** The user's answers and the agent's assumptions — see briefDecisions.ts. */
  decisions?: BriefDecisions;
  /** Recent designs in the workspace to differ from or match — see ../workspace/designHistory.ts. */
  recentDesigns?: RecentDesignsContext;
  /** The project's PRODUCT.md, already capped (openspec add-impeccable-interop). */
  productContext?: { path: string; text: string };
  /** A project DESIGN.md found while no design system is active (openspec add-impeccable-interop). */
  projectDesignMdPath?: string;
}

/**
 * "Checked in this kit" (openspec add-taste-checks, add-state-accessibility-checks): the craft docs are upstream's,
 * unedited, and anti-ai-slop.md says the daemon's lint-artifact enforces some rules. That linter doesn't run here;
 * check_open_design_artifact does, so say which rules it reports and under which code.
 */
export function checkedInThisKitNote(craftIds: readonly string[]): string | undefined {
  const lines: string[] = [];
  if (craftIds.includes('anti-ai-slop')) {
    lines.push(
      '- **anti-ai-slop.** The daemon `lint-artifact` linter that section mentions does not run in this kit; nothing blocks on these rules. `check_open_design_artifact` reports, as warnings: default Tailwind indigo as the accent and purple-blue "trust" gradients or glows (`slop-glow`), emoji in text (`emoji`), h1/h2 off the `--text-*` scale or not in `--font-display`/`--font-body` (`type-scale`), a row of three or four identical icon-heading-text cards (`card-row`), every card with one radius and one shadow (`uniform-surface`), and destructive buttons (delete, remove, discard, erase, revoke, reset, cancel subscription, close account, or `data-intent="destructive"`) not coloured as danger, or a primary action styled like the secondary ones (`intent`). The other rules (left-border cards, invented metrics, filler copy, the section sequence) are not checked: follow them yourself. Fix taste warnings unless the brief or design system asks for that look; `data-od-allow="<code> …"` on an element marks a deliberate exception, never a way to pass.',
    );
  }
  if (craftIds.includes('accessibility-baseline')) {
    lines.push(
      '- **accessibility-baseline.** On pages, `check_open_design_artifact` also forces hover and keyboard focus on up to 60 interactive elements (`state-contrast` for text below 4.5:1 in those states, `focus-visible` as an error when focus shows no visible change), measures tap targets on the phone viewport (`tap-target`, WCAG 2.2 target size: under 24×24 px with no room around them), renders at 320 px wide (`reflow`, an error when the page scrolls sideways or clips text) and with reduced motion (`reduced-motion`, animations still running). Default-state `contrast` is checked too. Screen-reader naming, ARIA and keyboard traps are not checked.',
    );
  }
  return lines.length > 0 ? `### Checked in this kit\n\n${lines.join('\n')}` : undefined;
}

export function composeInstructions(input: ComposeInstructionsInput): string {
  const parts: string[] = [];

  parts.push(
    `# Open Design generation brief\n\nYou are authoring a new design artifact using the Open Design skill "${input.skillName}". Follow the skill's workflow below, treat the active design system's tokens (if any) as authoritative, and author the files yourself with your own file-editing tools — do not look for any tool that writes design content on your behalf.\n\n**Everything below is delivered to you as plain text; none of it is a file path you can open.** The skill text, craft rules, and design system notes below are copied verbatim from Open Design's own upstream catalog and may mention file names or source paths (e.g. "example.html", "apps/daemon/src/...", a "Resource map" of sibling files) that describe Open Design's own separate codebase or runtime — none of those exist in this workspace or are readable by you. Never search for, open, or navigate to any file path mentioned anywhere below; if you want reference examples, call remix_open_design_example or list_open_design_skills instead of searching the filesystem. Treat every path-looking string below as descriptive prose only.`,
  );

  parts.push(`\n\n## User's brief\n\n${input.brief.trim()}`);

  const decisions = composeDecisionsSection(input.decisions);
  if (decisions) parts.push(`\n\n${decisions}`);

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
    const canvas = input.fluid ? composeFluidCanvasSection(input.canvasFormat) : composeCanvasSection(input.canvasFormat);
    parts.push(`\n\n${canvas}\n\nThis canvas takes precedence over any size or fixed layout the skill text above names.`);
  }

  if (input.craftSections && input.craftSections.length > 0) {
    parts.push(
      `\n\n## Craft rules\n\nThis skill applies these craft rules.\n\n${input.craftSections
        .map((s) => `### ${s.id}\n\n${s.body.trim()}`)
        .join('\n\n')}`,
    );
    const checked = checkedInThisKitNote(input.craftSections.map((s) => s.id));
    if (checked) parts.push(`\n\n${checked}`);
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

  const recent = composeRecentDesignsSection(input.recentDesigns, Boolean(input.designSystemBody?.trim()));
  if (recent) parts.push(`\n\n${recent}`);

  if (input.productContext) {
    parts.push(
      `\n\n## Product context\n\nFrom the project's \`${input.productContext.path}\` (who the product is for and why). Use it for audience, tone and constraints; the brief above wins where they differ.\n\n${input.productContext.text}`,
    );
  }
  if (input.projectDesignMdPath && !input.designSystemBody?.trim()) {
    parts.push(
      `\n\n## Project DESIGN.md found\n\nThis project has \`${input.projectDesignMdPath}\` describing its visual system, and no Open Design design system is active. Before building, offer once to make it the active design system: call create_open_design_design_system with name and brief taken from that file (read it yourself), write the DESIGN.md and tokens.css it asks for, then set_active_design_system. Never edit \`${input.projectDesignMdPath}\` itself.`,
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
    `\n\n## Output\n\nAuthor the artifact's entry file at \`${input.suggestedEntryPath}\` (adjust the filename to follow the semantic-naming guidance above, or the skill's own fixed-name convention, but keep it under the same directory). Write any supporting files (stylesheets, scripts, imported assets) as siblings under that directory. After writing all files, call register_open_design_artifact with the entry path, a kind, a title, and the supporting file paths (relative to the entry file's own directory)${input.canvasFormat ? `, and \`format: "${input.canvasFormat.id}"\`` : ''} so it is recognized as an Open Design artifact. ${composeRegisterBriefNote(input.decisions)}`,
  );

  return parts.join('');
}
