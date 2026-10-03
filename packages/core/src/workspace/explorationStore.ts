// A design exploration's plan file, `<outputDir>/<explorationId>/exploration.json`,
// plus discovery of its registered directions. Unlike collections, an
// exploration needs a plan: the comparison page shows directions that are
// planned but not yet written, and the user's choice has to persist
// somewhere. Membership itself still lives in each artifact's manifest
// (`explorationId` / `directionId`), discovered by scanning, never cached.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SkillMode } from '../content/contentIndex';
import type { ExplorationAxis, PlannedDirection } from '../generation/explorationPlan';
import { slugifyExplorationPart } from '../generation/explorationPlan';
import { scanArtifactManifests } from './collectionScan';

export const EXPLORATION_PLAN_FILE = 'exploration.json';
export const EXPLORATION_COMPARE_FILE = 'compare.html';

/** Exploration ids become directory names, so they are restricted to slugs (no path traversal). */
const EXPLORATION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

export type ChooseNext = 'build-out' | 'merge' | 'save-design-system';

export interface ExplorationPlanDirection extends PlannedDirection {
  /** Workspace-relative entry path the direction's instructions ask for. */
  entryPath: string;
}

export interface ExplorationPlan {
  version: 1;
  explorationId: string;
  title: string;
  brief: string;
  skillId: string;
  skillMode: SkillMode;
  axis: ExplorationAxis;
  designSystemId?: string;
  designSystemName?: string;
  designSystemSetAside?: boolean;
  createdAt: string;
  directions: ExplorationPlanDirection[];
  chosen?: { directionId: string; next: ChooseNext; notes?: string; chosenAt: string };
}

export interface ExplorationArtifact {
  entryPath: string;
  title: string;
  /** Absent for a built-out or merged version registered against the exploration. */
  directionId?: string;
}

export function isValidExplorationId(id: string): boolean {
  return EXPLORATION_ID_PATTERN.test(id);
}

export function explorationDir(outputDir: string, explorationId: string): string {
  return path.posix.join(outputDir, explorationId);
}

/** Workspace-relative paths of an exploration's generated files. */
export function explorationPaths(outputDir: string, explorationId: string): { dir: string; plan: string; compare: string; contactSheet: string } {
  const dir = explorationDir(outputDir, explorationId);
  return {
    dir,
    plan: path.posix.join(dir, EXPLORATION_PLAN_FILE),
    compare: path.posix.join(dir, EXPLORATION_COMPARE_FILE),
    contactSheet: path.posix.join(dir, 'exports', 'contact-sheet.png'),
  };
}

/** A short title from the brief: its first line, cut at a word boundary. */
export function explorationTitleFromBrief(brief: string): string {
  const firstLine = brief.trim().split(/\r?\n/)[0] ?? '';
  if (firstLine.length <= 60) return firstLine || 'Exploration';
  const cut = firstLine.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** A slug of the title, with `-2`, `-3`… appended when the directory already exists. */
export async function allocateExplorationId(workspaceRoot: string, outputDir: string, title: string): Promise<string> {
  const base = slugifyExplorationPart(title, 'exploration');
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(path.join(workspaceRoot, explorationDir(outputDir, candidate))))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function writeExplorationPlan(workspaceRoot: string, outputDir: string, plan: ExplorationPlan): Promise<string> {
  if (!isValidExplorationId(plan.explorationId)) throw new Error(`Invalid explorationId "${plan.explorationId}".`);
  const rel = explorationPaths(outputDir, plan.explorationId).plan;
  const abs = path.join(workspaceRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return rel;
}

/** The plan, or undefined when the id is invalid, the file is missing, or it is malformed. */
export async function readExplorationPlan(workspaceRoot: string, outputDir: string, explorationId: string): Promise<ExplorationPlan | undefined> {
  if (!isValidExplorationId(explorationId)) return undefined;
  try {
    const raw = await fs.readFile(path.join(workspaceRoot, explorationPaths(outputDir, explorationId).plan), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ExplorationPlan>;
    if (parsed?.version !== 1 || parsed.explorationId !== explorationId || !Array.isArray(parsed.directions)) return undefined;
    return parsed as ExplorationPlan;
  } catch {
    return undefined;
  }
}

/** Artifacts registered against an exploration, directions first in plan order when a plan is given. */
export async function findExplorationArtifacts(
  workspaceRoot: string,
  outputDir: string,
  explorationId: string,
  plan?: ExplorationPlan,
): Promise<ExplorationArtifact[]> {
  const found = (await scanArtifactManifests(workspaceRoot, outputDir))
    .filter(({ manifest }) => manifest.explorationId === explorationId)
    .map(({ entryPath, manifest }) => toExplorationArtifact(entryPath, manifest));
  return sortByPlanOrder(found, plan);
}

/** Directions first in plan order, then anything else (built-out versions), each group by path. */
function sortByPlanOrder(artifacts: ExplorationArtifact[], plan: ExplorationPlan | undefined): ExplorationArtifact[] {
  const order = new Map((plan?.directions ?? []).map((d, i) => [d.id, i]));
  const rank = (a: ExplorationArtifact): number => (a.directionId !== undefined ? (order.get(a.directionId) ?? order.size) : Number.MAX_SAFE_INTEGER);
  return artifacts.sort((a, b) => rank(a) - rank(b) || a.entryPath.localeCompare(b.entryPath));
}

function toExplorationArtifact(entryPath: string, manifest: Record<string, unknown>): ExplorationArtifact {
  return {
    entryPath,
    title: typeof manifest.title === 'string' && manifest.title ? manifest.title : entryPath,
    directionId: typeof manifest.directionId === 'string' && manifest.directionId ? manifest.directionId : undefined,
  };
}

/** The registered artifact for each planned direction (the most recently listed one wins if several claim it). */
export function directionArtifactMap(artifacts: ExplorationArtifact[]): Map<string, ExplorationArtifact> {
  const map = new Map<string, ExplorationArtifact>();
  for (const a of artifacts) if (a.directionId) map.set(a.directionId, a);
  return map;
}

export interface ExplorationSummary {
  plan: ExplorationPlan;
  /** Registered artifacts (sketches and built-out versions), directions first in plan order. */
  artifacts: ExplorationArtifact[];
  comparePath: string;
}

/** Every exploration with a readable plan directly under outputDir, newest first. Powers the VS Code Collections view. */
export async function listExplorations(workspaceRoot: string, outputDir: string): Promise<ExplorationSummary[]> {
  let names: string[];
  try {
    names = (await fs.readdir(path.join(workspaceRoot, outputDir), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const plans = (await Promise.all(names.filter(isValidExplorationId).map((id) => readExplorationPlan(workspaceRoot, outputDir, id)))).filter(
    (p): p is ExplorationPlan => p !== undefined,
  );
  if (plans.length === 0) return [];

  // One scan for all explorations, rather than one per plan.
  const manifests = await scanArtifactManifests(workspaceRoot, outputDir);
  return plans
    .map((plan) => ({
      plan,
      artifacts: sortByPlanOrder(
        manifests.filter(({ manifest }) => manifest.explorationId === plan.explorationId).map(({ entryPath, manifest }) => toExplorationArtifact(entryPath, manifest)),
        plan,
      ),
      comparePath: explorationPaths(outputDir, plan.explorationId).compare,
    }))
    .sort((a, b) => b.plan.createdAt.localeCompare(a.plan.createdAt));
}
