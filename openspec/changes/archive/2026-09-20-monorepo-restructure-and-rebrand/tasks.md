# Tasks: monorepo-restructure-and-rebrand

## 1. Research and plan

- [x] Two research passes (not guesses) before moving anything: (1) full `src/` file tree + exact per-file `vscode` import audit of `src/core/*` + cross-reference map of what non-core files import from core + which unit tests touch which modules; (2) exact current build config (`.esbuild.ts`, all `tsconfig.json`s, `.eslintrc.js`, `.vscodeignore`, `package.json` scripts/contribution paths, `sync-open-design-content.mjs`'s path logic)
- [x] Clarified the two genuinely open decisions with the user via `AskUserQuestion` before planning: project name (`open-design-agent-kit`) and restructuring scope now vs. later (full monorepo shape now)
- [x] Entered plan mode given the scale (~40 files moved, ~35 import statements rewritten across ~18 files, new package.json ×2, new tsconfig ×3, new icons ×2); plan approved before implementation

## 2. Move files

- [x] `packages/core/src/{content,generation,vendored,workspace}` — the vscode-free modules (confirmed: `appDetection.ts`, `artifactComments.ts`, `remixExample.ts` from the old `core/workspace/`, plus all of `content/`/`generation/`/`vendored/`)
- [x] `packages/vscode/src/{extension,tools,webview}` — unchanged internally
- [x] `packages/vscode/src/workspace/{activeDesignSystem,artifactWriter,remixOrchestrator}.ts` — the vscode-coupled (or transitively coupled) workspace files
- [x] `packages/core/src/test/unit/*.test.ts` — all 11 existing test files (confirmed none touch vscode-coupled code)
- [x] `packages/vscode/{assets,instructions,prompts,scripts,.esbuild.ts,.vscodeignore,package.json}` — everything that packages/vscode still needs as-is
- [x] `.eslintrc.js` kept at the repo root (not moved into packages/vscode) so both packages inherit it via ESLint's directory-walk resolution — a deliberate correction from the original plan's assumption

## 3. Fix cross-references

- [x] All 11 relocated test files: `../../core/X` → `../../X` (same-package, `core/` segment removed)
- [x] ~18 files under `packages/vscode/src/`: content/generation/vendored/appDetection/artifactComments/remixExample imports → `@feimacode/open-design-agent-kit-core`; activeDesignSystem/artifactWriter imports → local relative `../workspace/X`
- [x] **Caught by a broad grep sweep, not by the mechanical sed alone**: `remixOrchestrator.ts` and `artifactWriter.ts` themselves had internal relative imports (`../content/contentIndex`, `./remixExample`, `../vendored/artifactCreate`, `../vendored/artifactManifest`) that were correct at their OLD location but silently wrong at their NEW one — these don't contain the literal string `core/` so the mechanical `sed` pass didn't touch them; found by checking every moved file's own imports individually rather than trusting the bulk replace was exhaustive
- [x] `commentOverlay.ts`: fixed a stale path reference in a comment (not an import, but inaccurate after the move)

## 4. Config

- [x] `tsconfig.base.json` (new, root) — shared compiler options extracted from the old single root `tsconfig.json`
- [x] `packages/core/tsconfig.json`, `packages/vscode/tsconfig.json` — both extend the base; `packages/vscode/src/webview/tsconfig.json` needed no changes (self-relative `outDir`)
- [x] Root `package.json` — workspaces root, hoisted shared devDependencies, delegating scripts
- [x] `packages/core/package.json` — `gray-matter` dependency (moved with `contentIndex.ts`, its only consumer), its own `typecheck`/`lint`/`test:unit` scripts
- [x] `packages/vscode/package.json` — branding fields, `@feimacode/open-design-agent-kit-core` dependency, **`gray-matter` added back explicitly** (its own `sync-content` script's `generate-featured-prompts.mjs` imports it directly — relying on npm hoisting alone was judged too implicit/fragile)
- [x] `.vscode/launch.json` — updated `extensionDevelopmentPath`/`outFiles` for the new nested location
- [x] `.gitignore` — added `out-webview/` (a real pre-existing gap, noticed while auditing build output paths, not something this round introduced)

## 5. Icons

- [x] Read open-design's actual `apps/web/public/app-icon.svg` directly for inspiration (a colorful gradient badge with a dark four-point-sparkle mark) rather than guessing
- [x] New monochrome activity-bar sparkle icon, same stroke convention as the file it replaces
- [x] New extension marketplace icon: ink badge + lime-accent sparkle, using this project's own established brand tokens instead of copying open-design's literal color gradient
- [x] Confirmed network access to npm was available before relying on it; installed `sharp` (shared devDependency) and rasterized the SVG to the required 128×128 PNG; visually reviewed both renders before finalizing

## 6. Verify

- [x] `npm install` at the root — workspace symlink (`node_modules/@feimacode/open-design-agent-kit-core` → `packages/core`) confirmed present
- [x] `npm run typecheck` — clean on the **first** full run after all moves, both packages, no `paths` fallback needed
- [x] `npm run lint` — clean, both packages
- [x] `npm run test:unit` — 80 passing, unchanged, just relocated
- [x] `npm run compile` — all 4 bundles produced in the new `packages/vscode/dist/` location; grepped the output to confirm the core package's code was actually inlined (not a silently-broken/empty cross-package import)
- [x] `node -e` sanity checks: both `package.json`s parse; `packages/vscode/package.json` has the new `name`/`displayName`/`publisher`/`icon`; tool/command/prompt-file counts (9/8/26) unchanged from before the move
- [ ] **Not performed**: manual verification in a live Extension Development Host from the new location. Same documented, recurring gap as every prior change in this repo.

## 7. Documentation

- [x] README: new intro framing + "Project structure" section; fixed every stale `src/...` path reference across the rest of the file to its new `packages/core/src/...` or `packages/vscode/src/...` location
- [x] This OpenSpec change (no spec.md delta — zero behavioral change)
- [x] Memory: new dated round entry
