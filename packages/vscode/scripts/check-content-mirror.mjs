#!/usr/bin/env node
// Process safeguard, sibling to packages/content/scripts/check-content-sync.mjs:
// fails if this extension's mirrored assets/open-design/MANIFEST.json doesn't
// match packages/content's canonical copy — catches someone re-running
// `npm run sync` in packages/content (or hand-editing its content) without
// also re-running copy-content-assets.mjs and committing the refreshed
// mirror, which would otherwise silently drift the two apart. The manifest
// only changes on an upstream sync, so the extension-owned overlay files that
// live outside it (top-level files such as surfaces.json and integrations.json,
// and prompts/) are also compared byte for byte.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const mirrorManifestPath = path.join(repoRoot, 'assets', 'open-design', 'MANIFEST.json');
const canonicalManifestPath = path.resolve(repoRoot, '..', 'content', 'assets', 'open-design', 'MANIFEST.json');

async function readManifest(p, label) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    console.error(`Could not read ${label} manifest at ${p}. Run \`npm run sync-content\`.`);
    process.exit(1);
  }
}

const mirrorRoot = path.join(repoRoot, 'assets', 'open-design');
const canonicalRoot = path.resolve(repoRoot, '..', 'content', 'assets', 'open-design');

async function filesIn(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

/** Differences between the two copies of a directory's own files (not recursive). */
async function compareFiles(rel) {
  const problems = [];
  const [mine, theirs] = await Promise.all([filesIn(path.join(mirrorRoot, rel)), filesIn(path.join(canonicalRoot, rel))]);
  for (const name of new Set([...mine, ...theirs])) {
    const shown = path.posix.join(rel || '.', name);
    if (!mine.includes(name)) problems.push(`missing from the mirror: ${shown}`);
    else if (!theirs.includes(name)) problems.push(`only in the mirror: ${shown}`);
    else {
      const [a, b] = await Promise.all([fs.readFile(path.join(mirrorRoot, rel, name)), fs.readFile(path.join(canonicalRoot, rel, name))]);
      if (!a.equals(b)) problems.push(`differs from packages/content: ${shown}`);
    }
  }
  return problems;
}

async function main() {
  const [mirror, canonical] = await Promise.all([
    readManifest(mirrorManifestPath, 'mirrored'),
    readManifest(canonicalManifestPath, 'canonical'),
  ]);

  if (mirror.syncedAt !== canonical.syncedAt || mirror.sourceCommit !== canonical.sourceCommit) {
    console.error(
      `Content mirror drift detected: packages/vscode/assets/open-design/ was last mirrored from a sync ` +
        `dated ${mirror.syncedAt}, but packages/content/assets/open-design/ is now at ${canonical.syncedAt}.\n` +
        `Run \`npm run sync-content\` and commit the refreshed packages/vscode/assets/open-design/.`,
    );
    process.exit(1);
  }

  const problems = [...(await compareFiles('')), ...(await compareFiles('prompts'))];
  if (problems.length > 0) {
    console.error(
      `Content mirror drift detected:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        `Run \`node packages/vscode/scripts/copy-content-assets.mjs\` (or \`npm run sync-content\`) and commit the refreshed packages/vscode/assets/open-design/.`,
    );
    process.exit(1);
  }

  console.log('packages/vscode/assets/open-design/ mirror is in sync with packages/content.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
