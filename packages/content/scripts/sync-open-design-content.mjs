#!/usr/bin/env node
// Vendors skills/design-systems/craft markdown from an open-design checkout
// into assets/open-design/. Idempotent — safe to re-run whenever upstream
// open-design content changes. Does NOT touch packages/core/src/vendored/
// (the ported TS logic there is hand-adapted, not mechanically copied — see
// packages/core/src/vendored/SOURCE.md).
//
// Default source is a shallow, sparse clone of the OFFICIAL public repo
// (https://github.com/nexu-io/open-design), pinned to a tagged release —
// not `main` — so this script is reproducible for anyone who runs it, not
// just a machine with a specific local checkout, and doesn't silently pull
// different content depending on when it's run. To pick up newer upstream
// content: check https://github.com/nexu-io/open-design/tags for the
// latest `open-design-vX.Y.Z` tag, bump DEFAULT_OPEN_DESIGN_REF below, run
// `npm run sync-content`, and review the diff before committing.
//
// Set OPEN_DESIGN_SRC to a local directory to bypass cloning entirely
// (e.g. for testing against a modified fork) — unchanged from before.
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyLocalOverlay } from './apply-local-overlay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const targetRoot = path.join(repoRoot, 'assets', 'open-design');

// Exported (not just module-local) so check-content-sync.mjs can compare
// this pin against what's actually committed in MANIFEST.json's sourceRef,
// without parsing this file as text.
export const DEFAULT_OPEN_DESIGN_REPO = 'https://github.com/nexu-io/open-design.git';
export const DEFAULT_OPEN_DESIGN_REF = 'open-design-v0.22.2';
const SPARSE_PATHS = ['skills', 'design-templates', 'design-systems', 'craft', 'plugins/_official/examples'];

const explicitSrcRoot = process.env.OPEN_DESIGN_SRC;
const repoUrl = process.env.OPEN_DESIGN_REPO || DEFAULT_OPEN_DESIGN_REPO;
const ref = process.env.OPEN_DESIGN_REF || DEFAULT_OPEN_DESIGN_REF;

// Resolved in main() before any copy*() function runs — they close over
// this binding, so assigning it early (not const) is what lets the rest of
// the script stay unchanged regardless of whether the source came from a
// local override or a fresh clone.
let srcRoot;

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copySkillLikeDir(subdir) {
  const srcDir = path.join(srcRoot, subdir);
  const dstDir = path.join(targetRoot, subdir);
  await rmrf(dstDir);
  if (!(await pathExists(srcDir))) return 0;
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(srcDir, entry.name, 'SKILL.md');
    if (!(await pathExists(skillMd))) continue;
    const dstFile = path.join(dstDir, entry.name, 'SKILL.md');
    await fs.mkdir(path.dirname(dstFile), { recursive: true });
    await fs.copyFile(skillMd, dstFile);
    count++;
  }
  return count;
}

async function copyDesignSystems() {
  const srcDir = path.join(srcRoot, 'design-systems');
  const dstDir = path.join(targetRoot, 'design-systems');
  await rmrf(dstDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const designMd = path.join(srcDir, entry.name, 'DESIGN.md');
    if (!(await pathExists(designMd))) continue;
    const dstDesignMd = path.join(dstDir, entry.name, 'DESIGN.md');
    await fs.mkdir(path.dirname(dstDesignMd), { recursive: true });
    await fs.copyFile(designMd, dstDesignMd);
    // manifest.json (id/name/category/description/craft.suggested) is the
    // canonical machine-readable source when present; a small number of
    // legacy folders ship DESIGN.md only (see design-systems/README.md),
    // so this is best-effort, not required.
    const manifestJson = path.join(srcDir, entry.name, 'manifest.json');
    if (await pathExists(manifestJson)) {
      await fs.copyFile(manifestJson, path.join(dstDir, entry.name, 'manifest.json'));
    }
    count++;
  }
  return count;
}

const MAX_EXAMPLE_DIR_BYTES = 2 * 1024 * 1024; // see SOURCE.md: caps vendored size, ~2 outlier examples excluded out of 169

async function dirSizeBytes(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSizeBytes(full);
    else if (entry.isFile()) total += (await fs.stat(full)).size;
  }
  return total;
}

async function copyExamples() {
  const srcDir = path.join(srcRoot, 'plugins', '_official', 'examples');
  const dstDir = path.join(targetRoot, 'examples');
  await rmrf(dstDir);
  if (!(await pathExists(srcDir))) return { count: 0, skippedForSize: 0 };

  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  let skippedForSize = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryDir = path.join(srcDir, entry.name);
    const exampleHtml = path.join(entryDir, 'example.html');
    // Only entries with a rendered example.html are remixable; many
    // plugins/_official/examples/* folders are skill-only (no artifact).
    if (!(await pathExists(exampleHtml))) continue;

    const size = await dirSizeBytes(entryDir);
    if (size > MAX_EXAMPLE_DIR_BYTES) {
      skippedForSize++;
      continue;
    }

    const dstEntryDir = path.join(dstDir, entry.name);
    await fs.mkdir(dstEntryDir, { recursive: true });
    await fs.copyFile(exampleHtml, path.join(dstEntryDir, 'example.html'));

    const skillMd = path.join(entryDir, 'SKILL.md');
    if (await pathExists(skillMd)) await fs.copyFile(skillMd, path.join(dstEntryDir, 'SKILL.md'));

    const manifestJson = path.join(entryDir, 'open-design.json');
    if (await pathExists(manifestJson)) await fs.copyFile(manifestJson, path.join(dstEntryDir, 'open-design.json'));

    const assetsDir = path.join(entryDir, 'assets');
    if (await pathExists(assetsDir)) {
      await fs.cp(assetsDir, path.join(dstEntryDir, 'assets'), { recursive: true });
    }
    count++;
  }
  return { count, skippedForSize };
}

async function copyCraft() {
  const srcDir = path.join(srcRoot, 'craft');
  const dstDir = path.join(targetRoot, 'craft');
  await rmrf(dstDir);
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name === 'README.md' || entry.name === 'FUTURE_SECTIONS.md') continue;
    await fs.copyFile(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
    count++;
  }
  return count;
}

function resolveSourceCommit() {
  try {
    return execFileSync('git', ['-C', srcRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// Resolves srcRoot either to the explicit local override, or a fresh
// shallow+sparse+partial clone of the pinned tag — cloning only the 5
// top-level paths this script actually reads (`--filter=blob:none` defers
// blob downloads until sparse-checkout requests them), not the whole
// monorepo (apps/web, apps/daemon, e2e/, docs/, etc.). Returns a cleanup
// function; a no-op for the local-override case (nothing to remove), an
// rm-rf of the temp clone otherwise.
async function resolveSrcRoot() {
  if (explicitSrcRoot) {
    if (!(await pathExists(explicitSrcRoot))) {
      console.error(`OPEN_DESIGN_SRC is set but "${explicitSrcRoot}" does not exist.`);
      process.exit(1);
    }
    console.log(`Using local OPEN_DESIGN_SRC override: ${explicitSrcRoot}`);
    return { srcRoot: explicitSrcRoot, usedRef: null, cleanup: async () => {} };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-design-src-'));
  console.log(`Cloning ${repoUrl} @ ${ref} (sparse: ${SPARSE_PATHS.join(', ')})...`);
  try {
    execFileSync(
      'git',
      ['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', ref, repoUrl, tmpDir],
      { stdio: 'inherit' },
    );
    execFileSync('git', ['sparse-checkout', 'set', ...SPARSE_PATHS], { cwd: tmpDir, stdio: 'inherit' });
  } catch (err) {
    await rmrf(tmpDir);
    console.error(
      `Failed to clone ${repoUrl} @ ${ref}: ${err.message}\n` +
        `Set OPEN_DESIGN_SRC to a local open-design checkout to bypass cloning.`,
    );
    process.exit(1);
  }
  return { srcRoot: tmpDir, usedRef: ref, cleanup: () => rmrf(tmpDir) };
}

async function main() {
  const resolved = await resolveSrcRoot();
  srcRoot = resolved.srcRoot;

  try {
    await fs.mkdir(targetRoot, { recursive: true });

    const [skillCount, templateCount, designSystemCount, craftCount, examplesResult] = await Promise.all([
      copySkillLikeDir('skills'),
      copySkillLikeDir('design-templates'),
      copyDesignSystems(),
      copyCraft(),
      copyExamples(),
    ]);

    const manifest = {
      sourceRepo: explicitSrcRoot ? null : repoUrl,
      sourceRef: resolved.usedRef,
      sourceCommit: resolveSourceCommit(),
      syncedAt: new Date().toISOString(),
      counts: {
        skills: skillCount,
        designTemplates: templateCount,
        designSystems: designSystemCount,
        craft: craftCount,
        examples: examplesResult.count,
        examplesSkippedForSize: examplesResult.skippedForSize,
      },
    };
    await fs.writeFile(path.join(targetRoot, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');

    // Extension-owned content (local/) goes on top of the fresh upstream
    // copy — see apply-local-overlay.mjs. Throws on an id collision.
    const overlay = await applyLocalOverlay(targetRoot);

    console.log(
      `Synced ${skillCount} skills, ${templateCount} design templates, ${designSystemCount} design systems, ${craftCount} craft files, ` +
        `${examplesResult.count} remixable examples (${examplesResult.skippedForSize} skipped for size) from ` +
        (resolved.usedRef ? `${repoUrl} @ ${resolved.usedRef}` : srcRoot) +
        (manifest.sourceCommit ? ` (${manifest.sourceCommit.slice(0, 12)})` : '') +
        `, plus local overlay (${overlay.skills} skills, ${overlay.prompts} prompts)`,
    );
  } finally {
    await resolved.cleanup();
  }
}

// Guarded so check-content-sync.mjs can `import` this module purely for its
// exported constants (above) without also triggering a real clone+sync as
// a side effect — only run main() when this file is the actual entry point.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
