// The `site` export of a design that is one screen of a flow (openspec
// add-linked-flows): every built screen of its collection, each with the
// shared navigation filled in, and the flow map, so the links between screens
// work at the published URL. The map is the bundle's index.html unless a
// screen is itself named index.html; then the map is flow.html.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BEFORE_AFTER_FILE } from './beforeAfter';
import type { JsonRecord } from '../vendored/artifactManifest';
import { flowMapFor, loadCollectionFlow } from './collectionFlow';
import { resolveIncludes } from './flowIncludes';
import { FLOW_MAP_FILE } from './flowMap';
import { planSiteBundle, type SiteFile } from './siteBundle';

export interface CollectionSitePage {
  /** Path inside the bundle. */
  bundlePath: string;
  /** Workspace path of the screen; undefined for the flow map and the before/after page. */
  entryPath?: string;
  html: string;
}

export interface CollectionSitePlan {
  collectionId: string;
  collectionName: string;
  /** Workspace-relative folder of the screens: the bundle root. */
  collectionDir: string;
  /** Screens in plan order, then the map. */
  pages: CollectionSitePage[];
  /** Bundle path of the map: index.html, or flow.html when a screen is index.html. For a website (flow kind "site"), the home page's path, with no map published. */
  mapPath: string;
  /** True for a website (flow kind "site"): no map page; mapPath is the home page. */
  website?: boolean;
  /** Files the screens reference, deduplicated. */
  files: SiteFile[];
  warnings: string[];
}

export type CollectionSiteResult = { kind: 'single' } | { kind: 'collection'; ok: true; plan: CollectionSitePlan } | { kind: 'collection'; ok: false; error: string };

/**
 * Plans the site of the collection `entryPath` belongs to. `single` when the
 * design is in no collection, or its collection has fewer than two built
 * screens in the design's folder: then the ordinary one-page site applies.
 */
export async function planCollectionSite(input: { workspaceRoot: string; entryPath: string; manifest: JsonRecord }): Promise<CollectionSiteResult> {
  const collectionId = typeof input.manifest.collectionId === 'string' ? input.manifest.collectionId : undefined;
  if (!collectionId) return { kind: 'single' };
  const collectionDir = path.posix.dirname(input.entryPath);
  // Screens of a collection share a folder, so scanning the design's own folder finds them all.
  const flow = await loadCollectionFlow(input.workspaceRoot, collectionDir, collectionId);
  if (!flow) return { kind: 'single' };
  const warnings: string[] = [];
  const screens = flow.screens.filter((s) => {
    if (s.html === undefined) {
      warnings.push(`${s.id}: the file is missing, so it isn't on the site.`);
      return false;
    }
    if (path.posix.dirname(s.entryPath) !== collectionDir) {
      warnings.push(`${s.id}: ${s.entryPath} is outside the collection folder ${collectionDir}/, so it isn't on the site.`);
      return false;
    }
    return true;
  });
  if (screens.length < 2) return { kind: 'single' };

  const absRoot = path.resolve(input.workspaceRoot);
  const pages: CollectionSitePage[] = [];
  const files = new Map<string, SiteFile>();
  for (const s of screens) {
    const resolved = await resolveIncludes(s.html!, path.join(absRoot, s.entryPath), absRoot);
    if (resolved.missing.length > 0) warnings.push(`${s.id}: couldn't include ${resolved.missing.join(', ')}.`);
    const planned = await planSiteBundle({ workspaceRoot: input.workspaceRoot, entryPath: s.entryPath, html: resolved.html });
    if (!planned.ok) {
      const parts = [...planned.missing.map((m) => `missing ${m}`), ...planned.invalid.map((m) => `can't place ${m}`)];
      return { kind: 'collection', ok: false, error: `Screen ${s.id} (${s.entryPath}) references files that can't be bundled: ${parts.join('; ')}. Fix or remove those references and try again.` };
    }
    if (planned.plan.baseDir !== collectionDir) {
      return {
        kind: 'collection',
        ok: false,
        error: `Screen ${s.id} (${s.entryPath}) uses files outside the collection folder ${collectionDir}/. Move them into the folder (or a subfolder) so every screen can sit at the site's root.`,
      };
    }
    const bundlePath = path.posix.basename(s.entryPath);
    pages.push({ bundlePath, entryPath: s.entryPath, html: planned.plan.indexHtml });
    for (const f of planned.plan.files) files.set(f.bundlePath, f);
  }
  const screenPaths = new Set(pages.map((p) => p.bundlePath));
  for (const p of screenPaths) files.delete(p);
  // A website (flow kind "site", openspec add-portfolio-site-and-deck): its index screen is the home page and the map isn't published.
  if (flow.plan?.kind === 'site' && screenPaths.has('index.html')) {
    return { kind: 'collection', ok: true, plan: { collectionId, collectionName: flow.collectionName, collectionDir, pages, mapPath: 'index.html', website: true, files: [...files.values()], warnings } };
  }
  const mapPath = screenPaths.has('index.html') ? FLOW_MAP_FILE : 'index.html';
  if (screenPaths.has(mapPath)) return { kind: 'collection', ok: false, error: `A screen is named ${mapPath}, which the flow map needs; rename that screen.` };
  files.delete(mapPath);
  // A redesign's before/after page (openspec add-before-after) goes on the site too, linked from the map.
  let mapHtml = flowMapFor(flow).html;
  const comparison = await fs.readFile(path.join(absRoot, collectionDir, BEFORE_AFTER_FILE), 'utf8').catch(() => undefined);
  if (comparison !== undefined && !screenPaths.has(BEFORE_AFTER_FILE)) {
    pages.push({ bundlePath: BEFORE_AFTER_FILE, html: comparison });
    files.delete(BEFORE_AFTER_FILE);
    const link = `<p data-od-before-after style="margin:24px;font:600 15px/1.4 system-ui,sans-serif"><a href="${BEFORE_AFTER_FILE}">Before and after: the site today beside the new design</a></p>`;
    mapHtml = /<\/body>/i.test(mapHtml) ? mapHtml.replace(/<\/body>/i, `${link}\n</body>`) : mapHtml + link;
  }
  pages.push({ bundlePath: mapPath, html: mapHtml });
  return { kind: 'collection', ok: true, plan: { collectionId, collectionName: flow.collectionName, collectionDir, pages, mapPath, files: [...files.values()], warnings } };
}
