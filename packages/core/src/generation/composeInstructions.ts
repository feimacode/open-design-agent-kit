// New, minimal instruction composer for this project — NOT a port of
// open-design's composeSystemPrompt(). See ../vendored/SOURCE.md for why.
import type { CraftSection } from '../content/contentIndex';

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
}

export function composeInstructions(input: ComposeInstructionsInput): string {
  const parts: string[] = [];

  parts.push(
    `# OpenDesign generation brief\n\nYou are authoring a new design artifact using the OpenDesign skill "${input.skillName}". Follow the skill's workflow below, treat the active design system's tokens (if any) as authoritative, and author the files yourself with your own file-editing tools — do not look for any tool that writes design content on your behalf.\n\n**Everything below is delivered to you as plain text; none of it is a file path you can open.** The skill text, craft rules, and design system notes below are copied verbatim from OpenDesign's own upstream catalog and may mention file names or source paths (e.g. "example.html", "apps/daemon/src/...", a "Resource map" of sibling files) that describe OpenDesign's own separate codebase or runtime — none of those exist in this workspace or are readable by you. Never search for, open, or navigate to any file path mentioned anywhere below; if you want reference examples, call remix_open_design_example or list_open_design_skills instead of searching the filesystem. Treat every path-looking string below as descriptive prose only.`,
  );

  parts.push(`\n\n## User's brief\n\n${input.brief.trim()}`);

  if (input.designSystemBody && input.designSystemBody.trim().length > 0) {
    parts.push(
      `\n\n## Active design system${input.designSystemTitle ? ` — ${input.designSystemTitle}` : ''}\n\nTreat the following as authoritative for color, typography, spacing, and component rules. Do not invent tokens outside this palette.\n\n${input.designSystemBody.trim()}`,
    );
  }

  parts.push(`\n\n## Active skill — ${input.skillName}\n\nFollow this skill's workflow exactly (see the disclaimer above about path-looking text).\n\n${input.skillBody.trim()}`);

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

  parts.push(
    `\n\n## Semantic output file names\n\nChoose a short semantic filename derived from the brief, product, or artifact type rather than always writing \`index.html\`. Good examples: \`coffee-shop-landing.html\`, \`investor-pitch-deck.html\`, \`refund-dashboard.html\`. Use \`index.html\` only when the skill's own convention requires a fixed entry name.`,
  );

  parts.push(
    `\n\n## Output\n\nAuthor the artifact's entry file at \`${input.suggestedEntryPath}\` (adjust the filename to follow the semantic-naming guidance above, or the skill's own fixed-name convention, but keep it under the same directory). Write any supporting files (stylesheets, scripts, imported assets) as siblings under that directory. After writing all files, call register_open_design_artifact with the entry path, a kind, a title, and the supporting file paths (relative to the entry file's own directory) so it is recognized as an OpenDesign artifact.`,
  );

  return parts.join('');
}
