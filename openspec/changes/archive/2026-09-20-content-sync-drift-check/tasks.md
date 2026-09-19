# Tasks: content-sync-drift-check

## 1. Make the sync script's pin importable without side effects

- [x] `export`ed `DEFAULT_OPEN_DESIGN_REPO`/`DEFAULT_OPEN_DESIGN_REF`
- [x] **Real bug caught before it shipped**: a naive `import` of the module for its constants would also execute `main()` (a real clone) as a side effect, since the script unconditionally called `main().catch(...)` at module scope — fixed by guarding it behind an `isMainModule` check (`process.argv[1]` vs. `import.meta.url` via `pathToFileURL`), verified directly by importing the module in isolation and confirming no clone ran

## 2. The check script

- [x] `packages/vscode/scripts/check-content-sync.mjs`: compares the exported pin against `MANIFEST.json`'s `sourceRef`; fails with a clear, actionable message on mismatch; warns (doesn't fail) when `sourceRef` is `null` (local-override sync, nothing to compare against); fails clearly if `MANIFEST.json` doesn't exist at all (never synced)

## 3. Wire it in

- [x] Appended to `packages/vscode/package.json`'s existing `lint` script — no new git hooks or CI config, since neither existed in this repo to hook into; reuses a command already run every round

## 4. Verify the safeguard actually works, not just that it runs

- [x] Confirmed importing `sync-open-design-content.mjs` for its constants alone does not trigger a clone (isolated test)
- [x] Confirmed the check passes when the pin and `MANIFEST.json` agree (the normal, already-synced state)
- [x] **Deliberately introduced drift** (temporarily bumped the pinned constant without re-syncing) and confirmed the check fails with the expected message naming both values
- [x] Reverted the test edit and confirmed the check passes again
- [x] `npm run typecheck`, `npm run lint` (now visibly runs and passes the new check), `npm run test:unit` (80 passing) — all clean
- [x] `rm -rf` + `npm run compile` — clean rebuild

## 5. Documentation

- [x] README's tag-bump instructions extended to mention the enforced pairing
