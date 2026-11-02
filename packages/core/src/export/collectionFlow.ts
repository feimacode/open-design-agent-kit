// A collection's screens, plan and shared navigation, read from the workspace
// (openspec add-linked-flows). Shared by the collection check, the clickable
// prototype and the site export, which can't import the check without a cycle.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { findCollectionArtifacts, latestFlowPlan, scanArtifactManifests, type CollectionScreen } from '../workspace/collectionScan';
import { SHARED_NAV_PATH, slugifyScreenId, type FlowPlan } from '../generation/flowPlan';
import { analyzeFlow, type FlowScreenSource } from './flowCheck';
import { flowMapHtml } from './flowMap';

export interface CollectionFlow {
  collectionId: string;
  collectionName: string;
  /** Workspace-relative directory of the collection's screens. */
  collectionDir: string;
  plan?: FlowPlan;
  screens: FlowScreenSource[];
  sharedNav?: string;
  /** The brief text recorded on the screens, for store rules. */
  brief?: string;
}

function screenIdOf(s: CollectionScreen): string {
  return s.flow?.screenId ?? (s.screenRole ? slugifyScreenId(s.screenRole) : path.posix.basename(s.entryPath, path.posix.extname(s.entryPath)));
}

/** Reads a collection's screens, plan and shared navigation; undefined when no screen is registered. */
export async function loadCollectionFlow(workspaceRoot: string, outputDir: string, collectionId: string): Promise<CollectionFlow | undefined> {
  const registered = await findCollectionArtifacts(workspaceRoot, outputDir, collectionId);
  if (registered.length === 0) return undefined;
  const plan = latestFlowPlan(registered);
  const collectionDir = path.posix.dirname(registered[0].entryPath);
  const manifests = new Map((await scanArtifactManifests(workspaceRoot, outputDir)).map((m) => [m.entryPath, m.manifest]));
  const screens: FlowScreenSource[] = [];
  let collectionName = collectionId;
  let brief: string | undefined;
  for (const s of registered) {
    let html: string | undefined;
    try {
      html = await fs.readFile(path.join(workspaceRoot, s.entryPath), 'utf8');
    } catch {
      html = undefined;
    }
    const manifest = manifests.get(s.entryPath);
    if (manifest && typeof manifest.collectionName === 'string') collectionName = manifest.collectionName;
    const b = (manifest?.metadata as { brief?: { text?: unknown } } | undefined)?.brief?.text;
    if (typeof b === 'string') brief = brief ? `${brief}\n${b}` : b;
    screens.push({ id: screenIdOf(s), title: s.title, entryPath: s.entryPath, html });
  }
  // Order screens as the plan does; unplanned ones after.
  if (plan) {
    const order = new Map(plan.screens.map((p, i) => [p.id, i]));
    screens.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }
  let sharedNav: string | undefined;
  try {
    sharedNav = await fs.readFile(path.join(workspaceRoot, collectionDir, SHARED_NAV_PATH), 'utf8');
  } catch {
    sharedNav = undefined;
  }
  return { collectionId, collectionName, collectionDir, plan, screens, sharedNav, brief };
}

/** The flow map page of a collection (screen links relative to its folder) and the flow analysis it draws. */
export function flowMapFor(flow: CollectionFlow, frameWidth?: number): { html: string; analysis: ReturnType<typeof analyzeFlow> } {
  const analysis = analyzeFlow({ screens: flow.screens, plan: flow.plan, sharedNav: flow.sharedNav, collectionDir: flow.collectionDir });
  const built = new Map(flow.screens.map((s) => [s.id, s]));
  const planned = flow.plan?.screens ?? [];
  const hrefOf = (s: FlowScreenSource | undefined) => (s?.html !== undefined ? path.posix.relative(flow.collectionDir, s.entryPath) : undefined);
  const mapScreens = [
    ...planned.map((p) => {
      const s = built.get(p.id);
      return { id: p.id, title: s?.title ?? p.title, href: hrefOf(s) };
    }),
    ...flow.screens.filter((s) => !planned.some((p) => p.id === s.id)).map((s) => ({ id: s.id, title: s.title, href: hrefOf(s) })),
  ];
  const html = flowMapHtml({ title: flow.collectionName, screens: mapScreens, links: analysis.links, plan: flow.plan, missingLinks: analysis.missingLinks, frameWidth });
  return { html, analysis };
}
