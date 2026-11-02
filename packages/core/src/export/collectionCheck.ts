// A collection as one design (openspec add-linked-flows): check every screen
// and the flow between them, write the flow map, and export the screens as one
// clickable prototype file.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { flowMapFor, loadCollectionFlow, type CollectionFlow } from './collectionFlow';
import { formatPreflight, type Finding } from '../poster/preflight';
import { checkArtifact, type CheckArtifactOptions, type CheckImage } from './checkArtifact';
import { analyzeFlow, storeRuleFindings } from './flowCheck';

export { flowMapFor, loadCollectionFlow, type CollectionFlow } from './collectionFlow';
export { exportCollectionPrototype, prototypeShellHtml, type CollectionPrototypeResult } from './collectionPrototype';
import { FLOW_MAP_FILE } from './flowMap';
import type { CollectionPrototypeResult } from './collectionPrototype';

/** Screenshots across the whole collection, shared between its screens. */
export const COLLECTION_MAX_IMAGES = 6;

/** Writes <collection>/flow.html and returns its workspace-relative path with the flow analysis. */
export async function writeFlowMap(workspaceRoot: string, flow: CollectionFlow, frameWidth?: number): Promise<{ mapPath: string; analysis: ReturnType<typeof analyzeFlow> }> {
  const { html, analysis } = flowMapFor(flow, frameWidth);
  const mapPath = path.posix.join(flow.collectionDir, FLOW_MAP_FILE);
  await fs.writeFile(path.join(workspaceRoot, mapPath), html);
  return { mapPath, analysis };
}

export interface CheckCollectionOptions extends Omit<CheckArtifactOptions, 'entryPath'> {
  collectionId: string;
}

export type CheckCollectionResult =
  | {
      ok: true;
      collectionId: string;
      findings: Finding[];
      images: CheckImage[];
      omitted: string[];
      screens: Array<{ id: string; entryPath: string; checked: boolean }>;
      mapPath: string;
      warnings: string[];
      browserPath?: string;
    }
  | { ok: false; code: string; error: string };

/**
 * Checks every built screen of a collection (the image budget split across
 * them, findings tagged with the screen), adds the flow findings and
 * store-rules notes, and rewrites the flow map.
 */
export async function checkCollection(options: CheckCollectionOptions): Promise<CheckCollectionResult> {
  const outputDir = options.outputDir ?? '.open-design';
  const flow = await loadCollectionFlow(options.workspaceRoot, outputDir, options.collectionId);
  if (!flow) return { ok: false, code: 'not-found', error: `No screens are registered with collectionId "${options.collectionId}".` };
  const { mapPath, analysis } = await writeFlowMap(options.workspaceRoot, flow);
  const findings: Finding[] = [...analysis.findings, ...storeRuleFindings(flow.screens, flow.brief)];
  const images: CheckImage[] = [];
  const omitted: string[] = [];
  const warnings: string[] = [];
  const screens: Array<{ id: string; entryPath: string; checked: boolean }> = [];
  const built = flow.screens.filter((s) => s.html !== undefined);
  const budget = Math.min(options.maxImages ?? COLLECTION_MAX_IMAGES, COLLECTION_MAX_IMAGES);
  let browserPath: string | undefined;
  for (const [i, s] of built.entries()) {
    // One image per screen while the budget lasts, the earlier screens first.
    const share = Math.max(0, Math.floor(budget / built.length) + (i < budget % built.length ? 1 : 0));
    const result = await checkArtifact({ ...options, outputDir, entryPath: s.entryPath, maxImages: share });
    if (!result.ok) {
      screens.push({ id: s.id, entryPath: s.entryPath, checked: false });
      if (result.code === 'no-browser') return { ok: false, code: result.code, error: result.error };
      warnings.push(`${s.id}: ${result.error}`);
      continue;
    }
    browserPath = result.browserPath;
    screens.push({ id: s.id, entryPath: s.entryPath, checked: true });
    findings.push(...result.findings.map((f) => ({ ...f, screen: s.id })));
    images.push(...result.images.map((img) => ({ ...img, label: `${s.id}: ${img.label}` })));
    omitted.push(...result.omitted.map((o) => `${s.id}: ${o}`));
    warnings.push(...result.warnings.map((w) => `${s.id}: ${w}`));
  }
  return { ok: true, collectionId: options.collectionId, findings, images, omitted, screens, mapPath, warnings, browserPath };
}

export function formatCollectionCheckResult(result: CheckCollectionResult): string {
  if (!result.ok) return `Check failed (${result.code}): ${result.error}`;
  const checked = result.screens.filter((s) => s.checked).map((s) => s.id);
  const lines = [`Checked the collection "${result.collectionId}": ${checked.length} screen(s) (${checked.join(', ') || 'none'}) and the links between them. Findings name their screen.`];
  lines.push(...formatPreflight(result.findings, 're-check'));
  lines.push(`Flow map: ${result.mapPath} (each screen with its links; planned links not built are dashed red). Open it in the preview to show the user the whole flow.`);
  if (result.images.length > 0) lines.push(`Screenshots (${result.images.length}, attached in this order, shared across the screens): ${result.images.map((i) => `${i.label} ${i.width}×${i.height}`).join('; ')}.`);
  if (result.omitted.length > 0) lines.push(`Not attached: ${result.omitted.join('; ')}.`);
  const warnings = result.warnings.filter((w) => !/Failed to load: /.test(w));
  if (warnings.length > 0) lines.push('Warnings:', ...warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

export function formatCollectionPrototypeResult(result: CollectionPrototypeResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  const lines = [`Wrote a clickable prototype of ${result.screens.length} screen(s) to ${result.output} (${(result.bytes / 1024).toFixed(0)} KB). It is one self-contained file: open it in a browser, offline too, and its links move between the screens (${result.screens.join(', ')}); the corner menu jumps to any screen.`];
  if (result.warnings.length > 0) lines.push('Warnings:', ...result.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
