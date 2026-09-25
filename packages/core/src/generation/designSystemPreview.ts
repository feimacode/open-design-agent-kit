// Entry point for the design-system preview surfaces: resolves a design
// system's tokens once and renders either preview tab from them, so every
// host (the VS Code panel today) feeds built-in and custom systems through
// the same pipeline.

import type { DesignSystemDetail } from '../content/contentIndex';
import { renderDesignSystemShowcase, type ShowcaseResolvedTokens } from '../vendored/designSystemShowcase';
import { resolveDesignSystemTokens, resolveTokenValue, type ResolvedDesignSystemTokens } from './designSystemTokens';
import { renderDesignSystemVisualize } from './designSystemVisualize';

export type DesignSystemPreviewTab = 'visualize' | 'showcase';

/**
 * The one-line summary to show for a design system. DESIGN.md-only systems
 * (custom ones, legacy built-ins) get theirs from the blockquote under the
 * heading, where ContentIndex keeps a `> Category: …` line in the summary
 * text (it's what makes them searchable by category) — shown on its own,
 * that line reads as noise, so it's dropped here.
 */
export function designSystemDisplaySummary(detail: DesignSystemDetail): string {
  if (!/^\s*category\s*:/i.test(detail.summary)) return detail.summary;
  return blockquoteSummary(detail.body) || detail.summary;
}

function blockquoteSummary(body: string): string {
  const lines = body.split(/\r?\n/);
  let i = lines.findIndex((l) => l.trim().startsWith('#'));
  if (i < 0) return '';
  i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  const out: string[] = [];
  for (; i < lines.length && lines[i].trim().startsWith('>'); i++) {
    const line = lines[i].replace(/^\s*>\s?/, '').trim();
    if (!/^category\s*:/i.test(line)) out.push(line);
  }
  return out.join(' ').trim();
}

export function resolveDesignSystemDetailTokens(detail: DesignSystemDetail): ResolvedDesignSystemTokens {
  return resolveDesignSystemTokens({ designMd: detail.body, tokensCss: detail.tokensCss, overrideCss: detail.tokensOverrideCss });
}

// Showcase variable → contract token. A value is passed only once every
// var() reference in it resolved, since the showcase document declares none
// of the contract's custom properties.
const SHOWCASE_TOKENS: ReadonlyArray<[keyof ShowcaseResolvedTokens, string]> = [
  ['bg', '--bg'],
  ['fg', '--fg'],
  ['accent', '--accent'],
  ['accentFg', '--accent-on'],
  ['muted', '--muted'],
  ['border', '--border'],
  ['surface', '--surface'],
  ['display', '--font-display'],
  ['body', '--font-body'],
  ['mono', '--font-mono'],
];

function showcaseTokens(resolved: ResolvedDesignSystemTokens): ShowcaseResolvedTokens {
  const out: ShowcaseResolvedTokens = {};
  for (const [key, name] of SHOWCASE_TOKENS) {
    const value = resolveTokenValue(resolved.tokens, name);
    if (value && !value.includes('var(')) out[key] = value;
  }
  return out;
}

export function renderDesignSystemPreviewTab(
  detail: DesignSystemDetail,
  tab: DesignSystemPreviewTab,
  resolved: ResolvedDesignSystemTokens = resolveDesignSystemDetailTokens(detail),
): string {
  if (tab === 'showcase') return renderDesignSystemShowcase(detail.id, detail.body, showcaseTokens(resolved));
  return renderDesignSystemVisualize({
    name: detail.name,
    category: detail.category,
    summary: designSystemDisplaySummary(detail),
    designMd: detail.body,
    resolved,
  });
}
