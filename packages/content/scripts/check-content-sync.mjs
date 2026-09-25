#!/usr/bin/env node
// Process safeguard: fails if the pinned release in
// sync-open-design-content.mjs (DEFAULT_OPEN_DESIGN_REF) doesn't match what
// was actually last synced into assets/open-design/ (MANIFEST.json's
// sourceRef). Catches the case someone bumps the pin without re-running
// `npm run sync-content` and committing the refreshed content — the two
// would otherwise silently drift apart with nothing to notice it. Wired
// into `npm run lint`, which this project already runs every round.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPEN_DESIGN_REF } from './sync-open-design-content.mjs';
import { LOCAL_ROOT, listOverlayFiles } from './apply-local-overlay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsRoot = path.join(__dirname, '..', 'assets', 'open-design');
const manifestPath = path.join(assetsRoot, 'MANIFEST.json');

// Every file under local/ must be present, byte-identical, in the assets tree
// — catches an overlay edit that wasn't followed by `npm run apply-overlay`.
async function checkLocalOverlay() {
  const problems = [];
  for (const rel of await listOverlayFiles()) {
    const expected = await fs.readFile(path.join(LOCAL_ROOT, rel));
    let actual;
    try {
      actual = await fs.readFile(path.join(assetsRoot, rel));
    } catch {
      problems.push(`missing ${rel}`);
      continue;
    }
    if (!expected.equals(actual)) problems.push(`stale ${rel}`);
  }
  if (problems.length > 0) {
    console.error(
      `Local overlay drift in assets/open-design/: ${problems.join(', ')}.\nRun \`npm run apply-overlay --workspace=@feimacode/open-design-agent-kit-content\` (then \`npm run sync-content\`'s mirror/generate steps) and commit the result.`,
    );
    process.exit(1);
  }
}

async function main() {
  await checkLocalOverlay();

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    console.error(
      `Could not read ${manifestPath} — assets/open-design/ has never been synced. Run \`npm run sync-content\`.`,
    );
    process.exit(1);
  }

  if (manifest.sourceRef == null) {
    // Synced from a local OPEN_DESIGN_SRC override rather than a real
    // tagged clone (e.g. testing against a fork) — nothing to compare the
    // pin against, so this isn't drift. Flagged, not failed: this state
    // shouldn't reach a real commit, but detecting THAT is a separate,
    // harder problem (whether a git-ignored local path was used) this
    // check doesn't attempt to solve.
    console.warn(
      `Note: assets/open-design/MANIFEST.json has no sourceRef (last synced from a local OPEN_DESIGN_SRC override) — skipping the pinned-ref drift check.`,
    );
    return;
  }

  if (manifest.sourceRef !== DEFAULT_OPEN_DESIGN_REF) {
    console.error(
      `Content drift detected: sync-open-design-content.mjs is pinned to "${DEFAULT_OPEN_DESIGN_REF}", ` +
        `but assets/open-design/ was last synced from "${manifest.sourceRef}".\n` +
        `Run \`npm run sync-content\` and commit the refreshed assets/open-design/ (and prompts/featured/).`,
    );
    process.exit(1);
  }

  console.log(`assets/open-design/ is in sync with the pinned release (${DEFAULT_OPEN_DESIGN_REF}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
