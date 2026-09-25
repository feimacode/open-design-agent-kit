import * as path from 'node:path';
import type { DesignSystemDetail } from '../content/contentIndex';
import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import type { BrandEvidence } from './brandExtraction';

export interface ComposeCustomDesignSystemInstructionsInput {
  name: string;
  brief: string;
  suggestedEntryPath: string;
  id: string;
  evidence?: BrandEvidence;
}

/** `<dir of DESIGN.md>/tokens.css` — custom design systems keep both files side by side, like bundled ones. */
export function tokensPathFor(designMdPath: string): string {
  return path.posix.join(path.posix.dirname(designMdPath), 'tokens.css');
}

/**
 * The token contract as model-facing instructions, generated from the
 * vendored upstream schema (designTokenSchema.ts) so it can never drift from
 * what the preview resolves against. Required = A1 (no default exists);
 * optional = A2 (contract fallback) and B-slot (alias to a sibling).
 */
export function composeTokenContractSection(): string {
  const line = (name: string, description: string) => `- \`${name}\` — ${description}`;
  const required = TOKEN_SCHEMA.filter((t) => t.layer === 'A1-identity' || t.layer === 'A1-structure').map((t) => line(t.name, t.description));
  const optional = TOKEN_SCHEMA.filter((t) => t.layer === 'A2' || t.layer === 'B-slot').map((t) =>
    line(t.name, `${t.description} Default: \`${t.fallback ?? t.aliasTo}\`.`),
  );
  return [
    'Write it as a single top-level `:root { … }` block of CSS custom properties — the same contract all ~150 bundled design systems\' `tokens.css` follow. No other selectors, no `@import`, no `url(…)`.',
    '',
    '**Required** (there is no default for these):',
    ...required,
    '',
    '**Optional** (omit any you have no opinion on — the default shown is used):',
    ...optional,
    '',
    'Values must be consistent with the DESIGN.md: the same hex colours in the same roles, the same font families (as full font stacks with generic fallbacks, e.g. `"Inter", system-ui, sans-serif`). Brand-specific extra tokens beyond this list are allowed but unused by previews.',
  ].join('\n');
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
    `# Create a custom Open Design design system\n\nYou are authoring a new, custom design system as two files side by side: a \`DESIGN.md\` (the design prose) and a \`tokens.css\` (its tokens, used to render its visual preview). Once written, it becomes a first-class, selectable design system — the exact same mechanism and file shape as the ~150 bundled ones, just workspace-local instead of built into the extension.`,
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
    `\n\n## First file: DESIGN.md\n\nWrite it at \`${input.suggestedEntryPath}\` with this exact structure — the \`#\` heading and the blockquote immediately under it are read structurally (name + category + one-line summary), everything after that is free-form guidance you should make genuinely specific to this brand, not generic filler:\n\n\`\`\`markdown\n# Design System Inspired by ${input.name}\n\n> Category: <a short category, e.g. "Technology & SaaS">\n> <one-line summary of the visual identity>\n\n## Color Palette\n<primary/secondary/accent/neutral colors as hex values with a short role description each>\n\n## Typography\n<display and body font choices, weights, scale>\n\n## Voice & Tone\n<how copy in this style should read>\n\n## Imagery & Iconography\n<photography style, icon style, illustration approach>\n\n## Layout & Spacing\n<grid/spacing/radius/shadow conventions>\n\n## Agent Prompt Guide\n<a short paragraph summarizing how a generation should apply this system>\n\`\`\``,
  );

  parts.push(`\n\n## Second file: tokens.css\n\nThen write \`${tokensPathFor(input.suggestedEntryPath)}\`.\n\n${composeTokenContractSection()}`);

  parts.push(
    `\n\n## After writing both files\n\nCall \`set_active_design_system\` with designSystemId "${input.id}" so it's used for this and future requests — there is no separate "register" or "publish" step for design systems; the file becomes selectable the moment it exists.`,
  );

  return parts.join('');
}

export type ComposeDesignSystemTokensResult =
  | { ok: true; instructions: string; suggestedEntryPath: string; id: string }
  | { ok: false; error: string };

/**
 * Tokens-only mode for an EXISTING custom design system that has a DESIGN.md
 * but no (or an outdated) tokens.css — e.g. one created before tokens.css
 * existed, or imported from a source with no verbatim tokens. Instructions
 * only; the model writes the file. `outputDir` is the workspace-relative
 * Open Design output directory custom design systems live under.
 */
export function composeDesignSystemTokensInstructions(
  id: string,
  designSystem: DesignSystemDetail | undefined,
  outputDir: string,
): ComposeDesignSystemTokensResult {
  if (!designSystem || designSystem.source !== 'user' || !id.startsWith('user:')) {
    return {
      ok: false,
      error: `"${id}" is not an existing custom design system. Tokens-only mode only applies to custom (user:…) design systems; bundled ones already ship a tokens.css. Call list_open_design_design_systems to see ids.`,
    };
  }
  const suggestedEntryPath = path.posix.join(outputDir, 'design-systems', id.slice('user:'.length), 'tokens.css');
  const instructions = [
    `# Write tokens.css for the custom design system "${designSystem.name}"`,
    '',
    `This design system already has a DESIGN.md. Write only its \`tokens.css\` at \`${suggestedEntryPath}\`${designSystem.hasTokens ? ' (replacing the existing one)' : ''}. Do NOT change the DESIGN.md — it is the source of truth; every token value must come from it, or be a faithful derivation where it is silent.`,
    '',
    '## Contract',
    '',
    composeTokenContractSection(),
    '',
    '## The DESIGN.md (source of truth)',
    '',
    '````markdown',
    designSystem.body,
    '````',
  ].join('\n');
  return { ok: true, instructions, suggestedEntryPath, id };
}
