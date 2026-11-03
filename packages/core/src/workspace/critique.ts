// The design critic's last opinion on an artifact: `metadata.critique` in its
// manifest, the latest only (openspec add-design-critic). Written when the
// agent passes `critique` to register_open_design_artifact; read by the
// browser preview's Checks panel and by get_open_design_artifact's critique
// input, which gathers what the critic looks at.
import { flowRecordOf } from '../generation/flowPlan';
import { analyzeFlow } from '../export/flowCheck';
import { loadCollectionFlow } from '../export/collectionFlow';
import * as path from 'node:path';
import type { JsonRecord } from '../vendored/artifactManifest';
import { checkRunsDir, listCheckRuns } from '../export/checkHistory';
import { promises as fs } from 'node:fs';
import { readCritique, validateCritique, type CritiqueRecord } from './critiqueTypes';
import { loadAuditFixes } from '../generation/contentInventory';
import { redesignSiteOf } from '../export/redesignChecks';

export * from './critiqueTypes';

/**
 * The record to store for a `critique` registration input, validated, with
 * `checkRunId` defaulting to the entry's latest saved check run.
 */
export async function prepareCritiqueRecord(workspaceRoot: string, outputDir: string, entryPath: string, input: unknown): Promise<{ ok: true; record: CritiqueRecord } | { ok: false; error: string }> {
  const [latest] = await listCheckRuns(workspaceRoot, outputDir, entryPath);
  return validateCritique(input, { checkRunId: latest?.id });
}

export interface CritiqueInput {
  entryPath: string;
  kind?: string;
  title?: string;
  /** `metadata.brief` when the manifest records one, else undefined (judge from the title and skill id). */
  brief?: unknown;
  sourceSkillId?: string;
  format?: string;
  designSystem?: { id: string; name?: string; designMd?: string };
  /** The latest saved check run, or undefined when there is none yet. */
  checkRun?: {
    id: string;
    dir: string;
    createdAt: string;
    errors: number;
    warnings: number;
    findings: Array<{ severity: string; check: string; message: string }>;
    images: Array<{ label: string; path: string }>;
  };
  lastCritique?: CritiqueRecord;
  /** The tasks the screen or flow is for, with the path the check found through the flow (openspec add-task-walkthrough). */
  tasks?: CritiqueTask[];
  /** For a redesign of a live site: the old site's top audit problems, each of which the new design must fix (openspec add-redesign-from-url). */
  auditFixes?: Array<{ id: string; title: string; where: string; fix: string }>;
}

export interface CritiqueTask {
  name: string;
  start?: string;
  end?: string;
  maxSteps?: number;
  /** Screen ids from start to end over the real links; absent for a single screen or when there is no path. */
  path?: string[];
  /** The label followed at each step. */
  triggers?: string[];
  /** True when the flow has no path for the task. */
  unreachable?: boolean;
}

/** The flow's tasks with their paths, or a single screen's task from the brief's answers. */
async function critiqueTasks(workspaceRoot: string, entryPath: string, manifest: JsonRecord | null, metadata: JsonRecord): Promise<CritiqueTask[] | undefined> {
  const record = flowRecordOf(metadata);
  const collectionId = typeof manifest?.collectionId === 'string' ? manifest.collectionId : undefined;
  if (record?.plan.tasks && record.plan.tasks.length > 0) {
    const flow = collectionId ? await loadCollectionFlow(workspaceRoot, path.posix.dirname(entryPath), collectionId).catch(() => undefined) : undefined;
    const paths = flow ? analyzeFlow({ screens: flow.screens, plan: flow.plan ?? record.plan, sharedNav: flow.sharedNav, collectionDir: flow.collectionDir }).taskPaths : [];
    return record.plan.tasks.map((t) => {
      const found = paths.find((p) => p.task.name === t.name);
      return { ...t, ...(found?.path ? { path: found.path, triggers: found.triggers } : flow ? { unreachable: true } : {}) };
    });
  }
  const brief = metadata.brief && typeof metadata.brief === 'object' ? (metadata.brief as JsonRecord) : undefined;
  const answers = brief?.answers && typeof brief.answers === 'object' ? (brief.answers as Record<string, unknown>) : undefined;
  const task = typeof answers?.task === 'string' ? answers.task.trim() : '';
  return task ? [{ name: task }] : undefined;
}

/** The audit findings of the site a redesign is of, from `data-od-redesign` in the entry HTML. */
async function redesignAuditFixes(workspaceRoot: string, outputDir: string, entryPath: string): Promise<CritiqueInput['auditFixes']> {
  const html = await fs.readFile(path.join(workspaceRoot, entryPath), 'utf8').catch(() => '');
  const site = redesignSiteOf(html);
  if (!site) return undefined;
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    return undefined;
  }
  const audit = await loadAuditFixes(workspaceRoot, outputDir, url);
  return audit && audit.findings.length > 0 ? audit.findings : undefined;
}

/**
 * What the critic looks at, gathered from the manifest and the latest check
 * run: never the builder's conversation. Image paths are workspace-relative.
 */
export async function buildCritiqueInput(options: {
  workspaceRoot: string;
  outputDir: string;
  entryPath: string;
  manifest: JsonRecord | null;
  designSystem?: { id: string; name?: string; designMd?: string };
}): Promise<CritiqueInput> {
  const { manifest } = options;
  const metadata = manifest?.metadata && typeof manifest.metadata === 'object' && !Array.isArray(manifest.metadata) ? (manifest.metadata as JsonRecord) : {};
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const [run] = await listCheckRuns(options.workspaceRoot, options.outputDir, options.entryPath);
  const dir = checkRunsDir(options.outputDir, options.entryPath);
  return {
    entryPath: options.entryPath,
    kind: str(manifest?.kind),
    title: str(manifest?.title),
    brief: metadata.brief,
    sourceSkillId: str(manifest?.sourceSkillId),
    format: str(metadata.format),
    designSystem: options.designSystem,
    checkRun: run
      ? {
          id: run.id,
          dir: path.posix.join(dir, run.id),
          createdAt: run.createdAt,
          errors: run.errors,
          warnings: run.warnings,
          findings: run.findings,
          images: run.images.map((img) => ({ label: img.label, path: path.posix.join(dir, run.id, img.file) })),
        }
      : undefined,
    lastCritique: readCritique(manifest),
    tasks: await critiqueTasks(options.workspaceRoot, options.entryPath, manifest, metadata),
    auditFixes: await redesignAuditFixes(options.workspaceRoot, options.outputDir, options.entryPath),
  };
}

