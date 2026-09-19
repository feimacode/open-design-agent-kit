import type { BrandEvidence } from './brandExtraction';

export interface ComposeCustomDesignSystemInstructionsInput {
  name: string;
  brief: string;
  suggestedEntryPath: string;
  id: string;
  evidence?: BrandEvidence;
}

// Composes instructions for the MODEL to author a new DESIGN.md — this
// tool never writes the file itself, same principle as
// composeInstructions()/prepare_open_design_brief: the model authors
// content with its own file-editing tools. Only the `#` heading and the
// immediately-following blockquote lines are read structurally
// (contentIndex.ts's parseDesignSystemMarkdown) — everything else is
// free-form prose, so the required shape below only constrains those two
// parts, leaving the rest to the model's own judgment/quality.
export function composeCustomDesignSystemInstructions(input: ComposeCustomDesignSystemInstructionsInput): string {
  const parts: string[] = [];

  parts.push(
    `# Create a custom OpenDesign design system\n\nYou are authoring a new, custom design system as a single \`DESIGN.md\` file. Once written, it becomes a first-class, selectable design system — the exact same mechanism as the ~150 bundled ones, just workspace-local instead of built into the extension.`,
  );

  parts.push(`\n\n## Brand brief\n\n${input.brief.trim()}`);

  if (input.evidence) {
    const { fetchedUrl, colors, fonts, faviconUrl, warnings } = input.evidence;
    const lines: string[] = [`Fetched from ${fetchedUrl}:`];
    lines.push(colors.length > 0 ? `- Candidate colors (most frequently referenced first): ${colors.join(', ')}` : '- No color candidates were found on the page.');
    lines.push(fonts.length > 0 ? `- Candidate fonts: ${fonts.join(', ')}` : '- No font-family declarations were found on the page.');
    if (faviconUrl) lines.push(`- Favicon/logo image: ${faviconUrl}`);
    if (warnings.length > 0) lines.push(...warnings.map((w) => `- Note: ${w}`));
    parts.push(
      `\n\n## Extracted evidence from the reference site\n\n${lines.join('\n')}\n\nTreat this as a rough starting point, not ground truth: discard anything that looks like a syntax-highlighting or editor-theme artifact rather than a real brand color, cross-check that the colors make sense together, and fill any gaps with your own judgment from the brief.`,
    );
  }

  parts.push(
    `\n\n## Required file shape\n\nWrite the file at \`${input.suggestedEntryPath}\` with this exact structure — the \`#\` heading and the blockquote immediately under it are read structurally (name + category + one-line summary), everything after that is free-form guidance you should make genuinely specific to this brand, not generic filler:\n\n\`\`\`markdown\n# Design System Inspired by ${input.name}\n\n> Category: <a short category, e.g. "Technology & SaaS">\n> <one-line summary of the visual identity>\n\n## Color Palette\n<primary/secondary/accent/neutral colors as hex values with a short role description each>\n\n## Typography\n<display and body font choices, weights, scale>\n\n## Voice & Tone\n<how copy in this style should read>\n\n## Imagery & Iconography\n<photography style, icon style, illustration approach>\n\n## Layout & Spacing\n<grid/spacing/radius/shadow conventions>\n\n## Agent Prompt Guide\n<a short paragraph summarizing how a generation should apply this system>\n\`\`\``,
  );

  parts.push(
    `\n\n## After writing the file\n\nCall \`set_active_design_system\` with designSystemId "${input.id}" so it's used for this and future requests — there is no separate "register" or "publish" step for design systems; the file becomes selectable the moment it exists.`,
  );

  return parts.join('');
}
