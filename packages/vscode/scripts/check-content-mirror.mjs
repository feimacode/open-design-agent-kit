#!/usr/bin/env node
// Process safeguard, sibling to packages/content/scripts/check-content-sync.mjs:
// fails if this extension's mirrored assets/open-design/MANIFEST.json doesn't
// match packages/content's canonical copy — catches someone re-running
// `npm run sync` in packages/content (or hand-editing its content) without
// also re-running copy-content-assets.mjs and committing the refreshed
// mirror, which would otherwise silently drift the two apart.
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

  console.log('packages/vscode/assets/open-design/ mirror is in sync with packages/content.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
