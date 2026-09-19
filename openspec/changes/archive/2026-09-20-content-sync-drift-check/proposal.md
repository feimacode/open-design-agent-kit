# Process safeguard: catch a bumped pin that wasn't re-synced

## Why

Pinning `sync-open-design-content.mjs` to a tagged release (previous round) fixed reproducibility, but introduced a new, quieter failure mode: someone edits `DEFAULT_OPEN_DESIGN_REF` to a newer tag but forgets to actually run `npm run sync-content` and commit the refreshed `assets/open-design/` — the script and the committed content silently drift apart, with nothing to notice it. The user asked for a process safeguard closing exactly this gap.

## What Changes

- `sync-open-design-content.mjs`: `DEFAULT_OPEN_DESIGN_REPO`/`DEFAULT_OPEN_DESIGN_REF` are now `export`ed, and the script's own `main()` invocation is guarded to only run when the file is the actual entry point (`process.argv[1]` compared against `import.meta.url` via `pathToFileURL`) — otherwise importing the module just to read its two constants would also trigger a real clone as a side effect.
- New `packages/vscode/scripts/check-content-sync.mjs`: reads `DEFAULT_OPEN_DESIGN_REF` from the sync script and compares it against `assets/open-design/MANIFEST.json`'s `sourceRef` (already written by every real sync, from the prior round). Fails with a clear message naming both values and the fix (`npm run sync-content`, then commit) if they don't match. Treats a `sourceRef` of `null` (content synced from a local `OPEN_DESIGN_SRC` override) as unverifiable and warns rather than fails — there's nothing to compare the pin against in that case.
- Wired into the existing `lint` script (`packages/vscode/package.json`): `eslint src --ext ts && node scripts/check-content-sync.mjs` — no new infrastructure (no git hooks, no CI config, since none existed to hook into), just an addition to a command this project already runs every round.
- Verified the safeguard actually catches drift, not just that it runs without crashing: temporarily bumped the pinned ref without re-syncing, confirmed `check-content-sync.mjs` failed with the expected message, then reverted and confirmed it passed again.

## Impact

- New: `packages/vscode/scripts/check-content-sync.mjs`.
- Modified: `packages/vscode/scripts/sync-open-design-content.mjs` (exports + main-module guard), `packages/vscode/package.json` (`lint` script), `README.md`.
- No spec delta — dev-tooling/process safeguard, not runtime behavior.
