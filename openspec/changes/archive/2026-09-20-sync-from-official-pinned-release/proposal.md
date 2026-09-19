# Vendor content from the official open-design repo, pinned to a release tag

## Why

The vendoring script (`sync-open-design-content.mjs`) defaulted `OPEN_DESIGN_SRC` to `/home/iven/tools/open-design` — a private local checkout that only exists on the original developer's machine. The user flagged this as sub-optimal (anyone else, or CI, or a future `vsce package` run, would have no way to regenerate the vendored content) and asked whether pulling from the official public repo (`https://github.com/nexu-io/open-design`) would be better. Confirmed the repo is genuinely public (`git ls-remote` reached it with no auth) before committing to this. Agreed direction: yes, and pin to a tagged release rather than `main`, so the sync stays reproducible instead of silently drifting with whatever `main` contains whenever the script happens to run.

## What Changes

- `sync-open-design-content.mjs` now defaults to a shallow, sparse, partial clone of the official repo (`https://github.com/nexu-io/open-design.git`), pinned to `open-design-v0.22.2` (the latest tagged release at the time, confirmed by listing and sorting all `open-design-vX.Y.Z` tags — not assumed) — into a temp directory, cleaned up after the sync regardless of success or failure.
  - `git clone --depth 1 --filter=blob:none --sparse --branch <tag>` + `git sparse-checkout set skills design-templates design-systems craft plugins/_official/examples`: only fetches the 5 top-level paths this script actually reads, not the whole monorepo (`apps/web`, `apps/daemon`, `e2e/`, `docs/`, etc.) — confirmed fast in practice (~16s for the full clone + sync).
  - `OPEN_DESIGN_SRC` still works exactly as before as a local-directory override (for testing against a modified fork), bypassing cloning entirely.
  - `OPEN_DESIGN_REPO`/`OPEN_DESIGN_REF` env vars allow overriding the clone target without editing the script.
  - `MANIFEST.json` (written alongside the vendored content) now records `sourceRepo`/`sourceRef` in addition to the existing `sourceCommit`, so it's traceable which tagged release produced the current content.
- Test-ran the real end-to-end pipeline (not just typecheck) as the actual verification: `npm run sync-content` successfully cloned the pinned tag and re-vendored all content, producing counts consistent with what was already vendored (163 skills, 114 design templates, 152 design systems, 11 craft files, 167 examples) — confirming the pinned release's content matches what the extension was already built against.

## Impact

- Modified: `packages/vscode/scripts/sync-open-design-content.mjs`, `README.md` (documents the pinned-release default, the bump procedure, and — prompted by the same conversation — explicitly documents why `assets/open-design/` is committed rather than gitignored).
- Re-ran the sync for real: `packages/vscode/assets/open-design/` and `packages/vscode/prompts/featured/` refreshed from the pinned tag (content unchanged in substance — same counts as before).
- No spec delta — this changes a build-time dev-tooling mechanism, not runtime/user-facing behavior.
