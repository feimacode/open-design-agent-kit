# Tasks: sync-from-official-pinned-release

## 1. Verify before building

- [x] Confirmed `https://github.com/nexu-io/open-design` is genuinely public (`git ls-remote --heads` succeeded with no auth) before relying on it
- [x] Listed and sorted all `open-design-vX.Y.Z` tags to find the actual latest (`open-design-v0.22.2`), rather than assuming or guessing one

## 2. Rewrite the sync script

- [x] `resolveSrcRoot()`: local `OPEN_DESIGN_SRC` override (unchanged behavior) vs. default shallow+sparse+partial clone of the pinned tag into a temp dir
- [x] `srcRoot` converted from a top-level `const` to a `let` assigned inside `main()` before any `copy*()` function runs — those functions already closed over the binding, so this was the minimal change preserving the rest of the script untouched
- [x] Sparse checkout limited to the 5 paths actually read (`skills`, `design-templates`, `design-systems`, `craft`, `plugins/_official/examples`) — avoids cloning the whole monorepo
- [x] Cleanup (`rm -rf` the temp clone) wrapped in `try/finally` so it always runs, success or failure
- [x] `OPEN_DESIGN_REPO`/`OPEN_DESIGN_REF` env var overrides, on top of the existing `OPEN_DESIGN_SRC`
- [x] `MANIFEST.json` gains `sourceRepo`/`sourceRef` fields
- [x] Suppressed git's harmless but noisy "detached HEAD" advisory (`-c advice.detachedHead=false`) after seeing it clutter the first real test run

## 3. Verify

- [x] Test-ran the actual script directly first (not just typecheck) — real clone, real sparse checkout, ~16s end to end, correct counts
- [x] Ran the full `npm run sync-content` pipeline (sync + `generate-featured-prompts.mjs`) from the repo root — both steps succeeded together, package.json's `contributes.chatPromptFiles` updated
- [x] Confirmed the temp clone directory was actually removed after a successful run (not just claimed by the code)
- [x] `npm run typecheck`, `npm run lint`, `npm run test:unit` (80 passing) — all clean after the content refresh
- [x] `rm -rf` + `npm run compile` — clean rebuild against the refreshed content
- [x] Inspected the generated `MANIFEST.json` — correct `sourceRepo`/`sourceRef`/`sourceCommit`

## 4. Documentation

- [x] README's "Content" section rewritten: pinned-release default, bump procedure, `OPEN_DESIGN_SRC` override still documented, and — prompted by the same conversation — an explicit explanation of why `assets/open-design/` is committed to git rather than gitignored
- [x] README's Development command-block comment updated
