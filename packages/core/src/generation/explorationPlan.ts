// Resolves the directions of a design exploration before anything is
// generated. The tool assigns directions (never the model) so they diverge:
// see openspec/changes/add-explorations/design.md, decisions 1–4. Pure, no I/O.

import type { SkillMode } from '../content/contentIndex';
import { DESIGN_DIRECTIONS, findDesignDirection, renderDirectionSpec, type DesignDirection } from '../vendored/designDirections';
import { DECK_STRUCTURES, PAGE_STRUCTURES, renderStructuralDirectionSpec, type StructuralDirection } from './structuralDirections';

export type ExplorationAxis = 'visual' | 'structure' | 'custom';
export const EXPLORATION_AXES: readonly ExplorationAxis[] = ['visual', 'structure', 'custom'];

export const MIN_DIRECTIONS = 2;
export const MAX_DIRECTIONS = 4;
export const DEFAULT_DIRECTION_COUNT = 3;

/**
 * Default visual assignment order. Upstream's own direction notes say
 * editorial should not be the default for commerce, SaaS or dashboards, and
 * brutalist suits art and manifesto briefs, so both come last; the agent
 * passes `directionIds` when the brief's tone points to them.
 */
export const DEFAULT_VISUAL_DIRECTION_ORDER: readonly string[] = [
  'modern-minimal',
  'human-approachable',
  'tech-utility',
  'editorial-monocle',
  'brutalist-experimental',
];

export interface CustomDirectionInput {
  label: string;
  brief: string;
}

export interface PlannedDirection {
  /** Stable id within the exploration; also the entry file's basename. */
  id: string;
  label: string;
  axis: ExplorationAxis;
  /** One line for comparison cards. */
  summary: string;
  /** Full markdown spec embedded in the direction's instructions. */
  spec: string;
}

export interface ResolveExplorationInput {
  count?: number;
  axis?: string;
  directionIds?: string[];
  customDirections?: CustomDirectionInput[];
  hasActiveDesignSystem: boolean;
  skillMode: SkillMode;
}

export type ResolveExplorationResult =
  | { ok: true; axis: ExplorationAxis; directions: PlannedDirection[]; designSystemSetAside: boolean }
  | { ok: false; error: string };

export function slugifyExplorationPart(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || fallback;
}

function structuresFor(mode: SkillMode): StructuralDirection[] {
  return mode === 'deck' ? DECK_STRUCTURES : PAGE_STRUCTURES;
}

function fromVisual(d: DesignDirection): PlannedDirection {
  return { id: d.id, label: d.label, axis: 'visual', summary: d.mood.split('. ')[0].replace(/\.$/, ''), spec: renderDirectionSpec(d) };
}

function fromStructure(d: StructuralDirection): PlannedDirection {
  return { id: d.id, label: d.label, axis: 'structure', summary: d.summary, spec: renderStructuralDirectionSpec(d) };
}

function countError(n: number): string | undefined {
  if (!Number.isInteger(n) || n < MIN_DIRECTIONS || n > MAX_DIRECTIONS) {
    return `An exploration needs ${MIN_DIRECTIONS}–${MAX_DIRECTIONS} directions (got ${n}).`;
  }
  return undefined;
}

export function resolveExplorationDirections(input: ResolveExplorationInput): ResolveExplorationResult {
  if (input.axis !== undefined && !EXPLORATION_AXES.includes(input.axis as ExplorationAxis)) {
    return { ok: false, error: `Unknown axis "${input.axis}". Allowed: ${EXPLORATION_AXES.join(', ')}.` };
  }
  if (input.directionIds?.length && input.customDirections?.length) {
    return { ok: false, error: 'Pass either directionIds or customDirections, not both.' };
  }

  const axis: ExplorationAxis =
    (input.axis as ExplorationAxis | undefined) ??
    (input.customDirections?.length ? 'custom' : input.directionIds?.length ? 'visual' : input.hasActiveDesignSystem ? 'structure' : 'visual');

  if (input.count !== undefined) {
    const err = countError(input.count);
    if (err) return { ok: false, error: err };
  }

  if (axis === 'custom') {
    const custom = input.customDirections ?? [];
    if (custom.length === 0) {
      return { ok: false, error: 'axis "custom" needs customDirections: 2–4 entries of { label, brief }.' };
    }
    const err = countError(custom.length);
    if (err) return { ok: false, error: err };
    if (input.count !== undefined && input.count !== custom.length) {
      return { ok: false, error: `count (${input.count}) doesn't match the ${custom.length} customDirections given.` };
    }
    const seenLabels = new Set<string>();
    const seenIds = new Set<string>();
    const directions: PlannedDirection[] = [];
    for (const [i, c] of custom.entries()) {
      const label = c.label?.trim() ?? '';
      const brief = c.brief?.trim() ?? '';
      if (!label || !brief) return { ok: false, error: `customDirections[${i}] needs a non-empty label and brief.` };
      const key = label.toLowerCase();
      if (seenLabels.has(key)) return { ok: false, error: `customDirections labels must be distinct ("${label}" repeats).` };
      seenLabels.add(key);
      let id = slugifyExplorationPart(label, `direction-${i + 1}`);
      while (seenIds.has(id)) id = `${id}-${i + 1}`;
      seenIds.add(id);
      directions.push({
        id,
        label,
        axis: 'custom',
        summary: brief.length > 140 ? `${brief.slice(0, 137)}…` : brief,
        spec: `### ${label}  \`(id: ${id})\`\n\n${brief}\n`,
      });
    }
    return { ok: true, axis, directions, designSystemSetAside: false };
  }

  const library: Array<{ id: string; toPlanned: () => PlannedDirection }> =
    axis === 'visual'
      ? DEFAULT_VISUAL_DIRECTION_ORDER.map((id) => ({ id, toPlanned: () => fromVisual(findDesignDirection(id)!) }))
      : structuresFor(input.skillMode).map((d) => ({ id: d.id, toPlanned: () => fromStructure(d) }));
  const validIds = library.map((l) => l.id);

  let chosen: string[];
  if (input.directionIds?.length) {
    const ids = input.directionIds.map((id) => id.trim().toLowerCase());
    const unknown = ids.filter((id) => !validIds.includes(id));
    if (unknown.length > 0) {
      return { ok: false, error: `Unknown ${axis} direction id(s): ${unknown.join(', ')}. Valid ids: ${validIds.join(', ')}.` };
    }
    if (new Set(ids).size !== ids.length) return { ok: false, error: 'directionIds must not repeat.' };
    const err = countError(ids.length);
    if (err) return { ok: false, error: err };
    if (input.count !== undefined && input.count !== ids.length) {
      return { ok: false, error: `count (${input.count}) doesn't match the ${ids.length} directionIds given.` };
    }
    chosen = ids;
  } else {
    chosen = validIds.slice(0, input.count ?? DEFAULT_DIRECTION_COUNT);
  }

  const directions = chosen.map((id) => library.find((l) => l.id === id)!.toPlanned());
  return { ok: true, axis, directions, designSystemSetAside: axis === 'visual' && input.hasActiveDesignSystem };
}

/** The visual library's ids, for tool descriptions and error messages. */
export function visualDirectionIds(): string[] {
  return DESIGN_DIRECTIONS.map((d) => d.id);
}
