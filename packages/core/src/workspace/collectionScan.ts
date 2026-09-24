// Discovers design-collection screens by scanning the workspace's own
// output directory for `*.artifact.json` sidecars whose manifest carries a
// `collectionId` — there is no central collection registry anywhere in this
// codebase (see ../vendored/SOURCE.md's "Design collections" note), so
// "a collection" is just several artifacts whose manifests happen to agree
// on one id, discovered live. Same posture as contentIndex.ts's
// loadUserDesignSystems(): tolerant of a missing/empty directory and of
// individual malformed sidecars (skipped, never aborts the whole scan), and
// deliberately never cached — the set of sibling screens can grow between
// calls in the same session as the model registers more of them.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parsePersistedManifest, type JsonRecord } from '../vendored/artifactManifest';

const ARTIFACT_SIDECAR_SUFFIX = '.artifact.json';

export interface CollectionScreen {
  entryPath: string;
  title: string;
  screenIndex?: number;
  screenRole?: string;
}

export interface Collection {
  collectionId: string;
  collectionName: string;
  screens: CollectionScreen[];
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkArtifactSidecars(
  absDir: string,
  workspaceRoot: string,
  out: Array<{ entryPath: string; manifest: JsonRecord }>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absChild = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      await walkArtifactSidecars(absChild, workspaceRoot, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(ARTIFACT_SIDECAR_SUFFIX)) continue;
    const entryPath = path
      .relative(workspaceRoot, absChild)
      .slice(0, -ARTIFACT_SIDECAR_SUFFIX.length)
      .split(path.sep)
      .join('/');
    try {
      const raw = await fs.readFile(absChild, 'utf8');
      const manifest = parsePersistedManifest(raw, entryPath);
      if (manifest) out.push({ entryPath, manifest });
    } catch {
      // Skip an unreadable/malformed sidecar — one bad file must not abort the whole scan.
    }
  }
}

function toScreen(entryPath: string, manifest: JsonRecord): CollectionScreen {
  return {
    entryPath,
    title: typeof manifest.title === 'string' && manifest.title ? manifest.title : entryPath,
    screenIndex: typeof manifest.screenIndex === 'number' ? manifest.screenIndex : undefined,
    screenRole: typeof manifest.screenRole === 'string' ? manifest.screenRole : undefined,
  };
}

function sortScreens(screens: CollectionScreen[]): CollectionScreen[] {
  return [...screens].sort((a, b) => (a.screenIndex ?? Number.MAX_SAFE_INTEGER) - (b.screenIndex ?? Number.MAX_SAFE_INTEGER));
}

/** Screens already registered under the given collectionId, sorted by screenIndex. */
export async function findCollectionArtifacts(workspaceRoot: string, outputDir: string, collectionId: string): Promise<CollectionScreen[]> {
  const absOutputDir = path.join(workspaceRoot, outputDir);
  if (!(await pathExists(absOutputDir))) return [];
  const found: Array<{ entryPath: string; manifest: JsonRecord }> = [];
  await walkArtifactSidecars(absOutputDir, workspaceRoot, found);
  return sortScreens(
    found.filter(({ manifest }) => manifest.collectionId === collectionId).map(({ entryPath, manifest }) => toScreen(entryPath, manifest)),
  );
}

/** Every collection with at least one registered screen under outputDir, grouped by collectionId — powers the "Open Design Collections" tree view. */
export async function listCollections(workspaceRoot: string, outputDir: string): Promise<Collection[]> {
  const absOutputDir = path.join(workspaceRoot, outputDir);
  if (!(await pathExists(absOutputDir))) return [];
  const found: Array<{ entryPath: string; manifest: JsonRecord }> = [];
  await walkArtifactSidecars(absOutputDir, workspaceRoot, found);

  const byId = new Map<string, Collection>();
  for (const { entryPath, manifest } of found) {
    if (typeof manifest.collectionId !== 'string' || !manifest.collectionId) continue;
    const collectionId = manifest.collectionId;
    const collectionName = typeof manifest.collectionName === 'string' && manifest.collectionName ? manifest.collectionName : collectionId;
    let collection = byId.get(collectionId);
    if (!collection) {
      collection = { collectionId, collectionName, screens: [] };
      byId.set(collectionId, collection);
    }
    collection.screens.push(toScreen(entryPath, manifest));
  }
  for (const collection of byId.values()) {
    collection.screens = sortScreens(collection.screens);
  }
  return [...byId.values()].sort((a, b) => a.collectionName.localeCompare(b.collectionName));
}
