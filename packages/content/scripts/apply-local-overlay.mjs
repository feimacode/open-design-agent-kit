#!/usr/bin/env node
// Layers extension-owned content (local/, see local/README.md) on top of the
// vendored upstream tree in assets/open-design/. Run automatically at the end
// of sync-open-design-content.mjs, and standalone (`npm run apply-overlay`)
// to refresh the overlay without re-cloning upstream. Idempotent.
//
// Upstream files are never modified: an overlay skill whose id collides with
// an upstream skill or design template fails loudly instead of shadowing it.
// Each copied overlay skill dir carries an OVERLAY_MARKER file, so a
// standalone re-run can tell "our previous copy" (safe to replace) apart
// from "an upstream entry that now has the same id" (a collision).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
export const LOCAL_ROOT = path.join(packageRoot, 'local');
export const OVERLAY_MARKER = '.od-local-overlay';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dir) {
  if (!(await pathExists(dir))) return [];
  return (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listFiles(dir) {
  if (!(await pathExists(dir))) return [];
  return (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
}

/**
 * Every source file the overlay contributes, as { src, dst } pairs relative to
 * (localRoot, targetRoot). Shared with check-content-sync.mjs so the check
 * verifies exactly what this script writes.
 */
export async function listOverlayFiles(localRoot = LOCAL_ROOT) {
  const files = [];
  async function walk(relDir) {
    const abs = path.join(localRoot, relDir);
    for (const entry of await fs.readdir(abs, { withFileTypes: true })) {
      const rel = path.join(relDir, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else if (entry.isFile()) files.push(rel);
    }
  }
  for (const id of await listDirs(path.join(localRoot, 'skills'))) await walk(path.join('skills', id));
  for (const name of await listFiles(path.join(localRoot, 'prompts'))) files.push(path.join('prompts', name));
  return files;
}

export async function applyLocalOverlay(targetRoot, localRoot = LOCAL_ROOT) {
  const skillIds = await listDirs(path.join(localRoot, 'skills'));
  const templateIds = new Set(await listDirs(path.join(targetRoot, 'design-templates')));

  const collisions = [];
  for (const id of skillIds) {
    if (templateIds.has(id)) {
      collisions.push(`${id} (upstream design-template)`);
      continue;
    }
    const dst = path.join(targetRoot, 'skills', id);
    if ((await pathExists(dst)) && !(await pathExists(path.join(dst, OVERLAY_MARKER)))) {
      collisions.push(`${id} (upstream skill)`);
    }
  }
  if (collisions.length > 0) {
    throw new Error(
      `Local overlay id collision: ${collisions.join(', ')}. Rename the overlay entry under packages/content/local/skills/ — overlay entries never shadow upstream ones.`,
    );
  }

  for (const id of skillIds) {
    const dst = path.join(targetRoot, 'skills', id);
    await fs.rm(dst, { recursive: true, force: true });
    await fs.cp(path.join(localRoot, 'skills', id), dst, { recursive: true });
    await fs.writeFile(path.join(dst, OVERLAY_MARKER), 'Copied from packages/content/local/ by apply-local-overlay.mjs. Do not edit here.\n');
  }

  // prompts/ has no upstream counterpart: wholly overlay-owned, so replaced outright.
  const promptsDst = path.join(targetRoot, 'prompts');
  await fs.rm(promptsDst, { recursive: true, force: true });
  const promptNames = await listFiles(path.join(localRoot, 'prompts'));
  if (promptNames.length > 0) {
    await fs.mkdir(promptsDst, { recursive: true });
    for (const name of promptNames) await fs.copyFile(path.join(localRoot, 'prompts', name), path.join(promptsDst, name));
  }

  const manifestPath = path.join(targetRoot, 'MANIFEST.json');
  if (await pathExists(manifestPath)) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.localOverlay = { skills: skillIds.length, prompts: promptNames.length };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  return { skills: skillIds.length, prompts: promptNames.length };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const targetRoot = path.join(packageRoot, 'assets', 'open-design');
  applyLocalOverlay(targetRoot)
    .then(({ skills, prompts }) => console.log(`Applied local overlay: ${skills} skills, ${prompts} prompts.`))
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    });
}
