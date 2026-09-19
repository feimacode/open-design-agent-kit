// Deterministic design-system import — unlike composeCustomDesignSystemInstructions
// (which hands a brief + evidence to the model to author), this path never
// touches the model at all: a user-supplied file/paste/GitHub source is
// either already DESIGN.md-shaped (used verbatim) or gets its colors/fonts
// regex-extracted and wrapped, with the original content always preserved
// in a "Source Reference" section so nothing the model might paraphrase
// away is ever lost. Fits the "org already has a real design system, don't
// let anything invent or reinterpret it" use case.

import { extractFontFamilies, extractHexColors, rankColors } from './tokenExtraction';

const MAX_COLORS = 12;
const MAX_FONTS = 8;

// Matches contentIndex.ts's parseDesignSystemMarkdown expectation: the
// first non-blank line being a `#` heading is what makes a file already
// "shaped" — same convention every bundled/model-authored DESIGN.md uses.
export function looksLikeDesignMd(text: string): boolean {
  const firstNonBlank = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  return !!firstNonBlank && firstNonBlank.trim().startsWith('#');
}

export interface BuildDesignSystemMarkdownInput {
  name: string;
  category: string;
  sourceLabel: string;
  rawContent: string;
}

export function buildDesignSystemMarkdown(input: BuildDesignSystemMarkdownInput): string {
  const { name, category, sourceLabel, rawContent } = input;

  if (looksLikeDesignMd(rawContent)) return rawContent;

  const colorTally = new Map<string, number>();
  const fonts = new Set<string>();
  extractHexColors(rawContent, colorTally);
  extractFontFamilies(rawContent, fonts);
  const colors = rankColors(colorTally, MAX_COLORS);
  const fontList = [...fonts].slice(0, MAX_FONTS);

  const colorSection = colors.length > 0 ? colors.map((c) => `- ${c}`).join('\n') : '_No colors were found automatically — see the source reference below._';
  const fontSection = fontList.length > 0 ? fontList.map((f) => `- ${f}`).join('\n') : '_No font-family declarations were found automatically — see the source reference below._';

  return [
    `# Design System: ${name}`,
    '',
    `> Category: ${category}`,
    `> Imported from ${sourceLabel}`,
    '',
    '## Color Palette',
    '',
    colorSection,
    '',
    '## Typography',
    '',
    fontSection,
    '',
    '## Source Reference',
    '',
    'Original imported content, preserved verbatim so nothing found automatically above is ever the only record of it:',
    '',
    '```',
    rawContent.trim(),
    '```',
    '',
  ].join('\n');
}
