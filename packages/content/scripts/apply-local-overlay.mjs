#!/usr/bin/env node
// Layers extension-owned content (local/, see local/README.md) on top of the
// vendored upstream tree in assets/open-design/. Run automatically at the end
// of sync-open-design-content.mjs, and standalone (`npm run apply-overlay`)
// to refresh the overlay without re-cloning upstream. Idempotent.
//
// Upstream files are never modified: an overlay skill (or a new,
// no-upstream-counterpart design system) whose id collides with an upstream
// entry fails loudly instead of shadowing it. Each copied overlay dir
// carries an OVERLAY_MARKER file, so a standalone re-run can tell "our
// previous copy" (safe to replace/remove) apart from "an upstream entry
// that now has the same id" (a collision).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
export const LOCAL_ROOT = path.join(packageRoot, 'local');
export const OVERLAY_MARKER = '.od-local-overlay';
/** The surface catalog (openspec add-surface-picker): local/surfaces.json, copied to the assets root. */
export const SURFACES_FILE = 'surfaces.json';
// The only file an overlay may contribute to an EXISTING upstream design
// system: additive token overrides, applied on top of (never instead of) the
// vendored tokens.css by core's resolveDesignSystemTokens().
export const TOKENS_OVERRIDE_FILE = 'tokens.override.css';
// The files a NEW design system (one with no upstream counterpart) must
// contain — same v1 manifest shape as every bundled entry (manifest.json +
// DESIGN.md + tokens.css; see design-systems/README.md upstream). Which of
// the two shapes a given local/design-systems/<id>/ directory is using is
// inferred purely from its own file set (see applyLocalOverlay): exactly
// TOKENS_OVERRIDE_FILE alone is an override, exactly these three is a new
// package — never both, never a partial set of either.
export const NEW_DESIGN_SYSTEM_FILES = ['DESIGN.md', 'manifest.json', 'tokens.css'];

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
  for (const id of await listDirs(path.join(localRoot, 'examples'))) await walk(path.join('examples', id));
  for (const name of await listFiles(path.join(localRoot, 'prompts'))) files.push(path.join('prompts', name));
  if (await pathExists(path.join(localRoot, SURFACES_FILE))) files.push(SURFACES_FILE);
  for (const id of await listDirs(path.join(localRoot, 'design-systems'))) {
    const names = new Set(await listFiles(path.join(localRoot, 'design-systems', id)));
    if (names.size === 1 && names.has(TOKENS_OVERRIDE_FILE)) {
      files.push(path.join('design-systems', id, TOKENS_OVERRIDE_FILE));
    } else {
      for (const name of NEW_DESIGN_SYSTEM_FILES) files.push(path.join('design-systems', id, name));
    }
  }
  return files;
}

/** `--name: value;` declarations in a CSS text, last one wins (same regex upstream's asset generator uses). */
export function parseCssCustomProperties(css) {
  const out = new Map();
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
    out.set(match[1], match[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

/**
 * Override declarations whose value the vendored upstream tokens.css now
 * already has — i.e. upstream fixed it and the override can be deleted.
 * Returns `<id>: --name` strings.
 */
export async function findRedundantOverrides(targetRoot, localRoot = LOCAL_ROOT) {
  const redundant = [];
  for (const id of await listDirs(path.join(localRoot, 'design-systems'))) {
    // Skip new-package entries (no TOKENS_OVERRIDE_FILE to speak of) — this
    // check only applies to the override shape.
    if (!(await pathExists(path.join(localRoot, 'design-systems', id, TOKENS_OVERRIDE_FILE)))) continue;
    const override = parseCssCustomProperties(await fs.readFile(path.join(localRoot, 'design-systems', id, TOKENS_OVERRIDE_FILE), 'utf8'));
    const upstreamPath = path.join(targetRoot, 'design-systems', id, 'tokens.css');
    const upstream = (await pathExists(upstreamPath)) ? parseCssCustomProperties(await fs.readFile(upstreamPath, 'utf8')) : new Map();
    for (const [name, value] of override) {
      if (upstream.get(name)?.toLowerCase() === value.toLowerCase()) redundant.push(`${id}: ${name}`);
    }
  }
  return redundant;
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
  // Examples pair with a skill of the same id (as upstream's do), so they only collide with upstream examples.
  const exampleIds = await listDirs(path.join(localRoot, 'examples'));
  for (const id of exampleIds) {
    const dst = path.join(targetRoot, 'examples', id);
    if ((await pathExists(dst)) && !(await pathExists(path.join(dst, OVERLAY_MARKER)))) collisions.push(`${id} (upstream example)`);
  }
  if (collisions.length > 0) {
    throw new Error(
      `Local overlay id collision: ${collisions.join(', ')}. Rename the overlay entry under packages/content/local/skills/ or local/examples/ — overlay entries never shadow upstream ones.`,
    );
  }

  // local/design-systems/<id>/ is one of two shapes, disambiguated by its own
  // file set: an override (exactly TOKENS_OVERRIDE_FILE) targets an EXISTING
  // upstream design system — the opposite of skills, which must NOT collide.
  // A new package (exactly NEW_DESIGN_SYSTEM_FILES) is the mirror of skills:
  // it must NOT already exist upstream. Anything else is ambiguous/malformed.
  const allDesignSystemIds = await listDirs(path.join(localRoot, 'design-systems'));
  const overrideIds = [];
  const newPackageIds = [];
  const designSystemProblems = [];
  for (const id of allDesignSystemIds) {
    const names = new Set(await listFiles(path.join(localRoot, 'design-systems', id)));
    const upstreamExists = await pathExists(path.join(targetRoot, 'design-systems', id, 'DESIGN.md'));
    if (names.size === 1 && names.has(TOKENS_OVERRIDE_FILE)) {
      if (!upstreamExists) designSystemProblems.push(`${id} (override of a non-existent upstream design system)`);
      overrideIds.push(id);
    } else if (NEW_DESIGN_SYSTEM_FILES.every((name) => names.has(name)) && names.size === NEW_DESIGN_SYSTEM_FILES.length) {
      const dst = path.join(targetRoot, 'design-systems', id);
      if (upstreamExists && !(await pathExists(path.join(dst, OVERLAY_MARKER)))) {
        designSystemProblems.push(`${id} (upstream design system already has this id)`);
      } else {
        newPackageIds.push(id);
      }
    } else {
      designSystemProblems.push(
        `${id} (must contain exactly ${TOKENS_OVERRIDE_FILE}, or exactly ${NEW_DESIGN_SYSTEM_FILES.join(', ')}; found: ${[...names].join(', ') || 'nothing'})`,
      );
    }
  }
  if (designSystemProblems.length > 0) {
    throw new Error(`Invalid design-system overlay entry: ${designSystemProblems.join(', ')}. See packages/content/local/README.md.`);
  }

  for (const id of skillIds) {
    const dst = path.join(targetRoot, 'skills', id);
    await fs.rm(dst, { recursive: true, force: true });
    await fs.cp(path.join(localRoot, 'skills', id), dst, { recursive: true });
    await fs.writeFile(path.join(dst, OVERLAY_MARKER), 'Copied from packages/content/local/ by apply-local-overlay.mjs. Do not edit here.\n');
  }

  for (const id of exampleIds) {
    const dst = path.join(targetRoot, 'examples', id);
    await fs.rm(dst, { recursive: true, force: true });
    await fs.cp(path.join(localRoot, 'examples', id), dst, { recursive: true });
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

  // surfaces.json has no upstream counterpart either: copied, or removed when local/ has none.
  const hasSurfaces = await pathExists(path.join(localRoot, SURFACES_FILE));
  if (hasSurfaces) await fs.copyFile(path.join(localRoot, SURFACES_FILE), path.join(targetRoot, SURFACES_FILE));
  else await fs.rm(path.join(targetRoot, SURFACES_FILE), { force: true });

  // Drop overrides from a previous run that local/ no longer has, so a
  // standalone re-apply after deleting one doesn't leave it in effect.
  const overrideIdSet = new Set(overrideIds);
  const newPackageIdSet = new Set(newPackageIds);
  for (const id of await listDirs(path.join(targetRoot, 'design-systems'))) {
    if (!overrideIdSet.has(id)) await fs.rm(path.join(targetRoot, 'design-systems', id, TOKENS_OVERRIDE_FILE), { force: true });
    // A previously-overlaid new package that local/ no longer has: remove the
    // whole copied folder, but only ours to remove (OVERLAY_MARKER present) —
    // never a genuine upstream entry that happens to share the id.
    if (!newPackageIdSet.has(id)) {
      const dst = path.join(targetRoot, 'design-systems', id);
      if (await pathExists(path.join(dst, OVERLAY_MARKER))) await fs.rm(dst, { recursive: true, force: true });
    }
  }
  for (const id of overrideIds) {
    await fs.copyFile(
      path.join(localRoot, 'design-systems', id, TOKENS_OVERRIDE_FILE),
      path.join(targetRoot, 'design-systems', id, TOKENS_OVERRIDE_FILE),
    );
  }
  for (const id of newPackageIds) {
    const dst = path.join(targetRoot, 'design-systems', id);
    await fs.rm(dst, { recursive: true, force: true });
    await fs.cp(path.join(localRoot, 'design-systems', id), dst, { recursive: true });
    await fs.writeFile(path.join(dst, OVERLAY_MARKER), 'Copied from packages/content/local/ by apply-local-overlay.mjs. Do not edit here.\n');
  }

  const counts = {
    skills: skillIds.length,
    examples: exampleIds.length,
    prompts: promptNames.length,
    designSystemOverrides: overrideIds.length,
    designSystemPackages: newPackageIds.length,
  };
  const manifestPath = path.join(targetRoot, 'MANIFEST.json');
  if (await pathExists(manifestPath)) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.localOverlay = counts;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  return counts;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const targetRoot = path.join(packageRoot, 'assets', 'open-design');
  applyLocalOverlay(targetRoot)
    .then(({ skills, examples, prompts, designSystemOverrides, designSystemPackages }) =>
      console.log(
        `Applied local overlay: ${skills} skills, ${examples} examples, ${prompts} prompts, ${designSystemOverrides} design-system token overrides, ${designSystemPackages} new design-system packages.`,
      ),
    )
    .catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    });
}
