# Monorepo restructure, rename, and rebrand

## Why

This project will eventually ship two things: the current VS Code extension, and (later, not this round) an npm package usable from Claude Code/Codex/other agent CLIs. The user asked to prepare the structure and name for that now — before the second surface exists — so the split happens along the boundary that will actually matter later (genuinely portable logic vs. VS-Code-specific integration), rather than as a bigger, riskier reshuffle once a second package is already being built against the old single-package layout.

Decided with the user: new name `open-design-agent-kit`, published under the **feimacode** entity with VS Code publisher `feima`, a real npm-workspaces monorepo now (one real workspace today, the extension, with portable logic already separated), and new icons — inspired by open-design's own real app icon, not copied — for both the extension marketplace listing and the activity-bar/TreeView.

## What Changes

- **Package split**, verified file-by-file rather than assumed: of the 6 files under the old `src/core/workspace/`, only `activeDesignSystem.ts` and `artifactWriter.ts` actually import `vscode` directly; `remixOrchestrator.ts` is transitively coupled (imports `artifactWriter`); `appDetection.ts`, `artifactComments.ts`, and `remixExample.ts` are genuinely vscode-free. All of `content/`, `generation/`, and `vendored/` were already vscode-free, and all 11 existing unit tests only ever imported from vscode-free modules.
  - `packages/core/` (`@feimacode/open-design-agent-kit-core`): `content/`, `generation/`, `vendored/`, and the 3 vscode-free `workspace/*` files, plus a new `src/index.ts` barrel and all 11 relocated unit tests. No build step — `packages/vscode`'s esbuild bundle and `tsc` both resolve it directly from TS source through the npm workspace symlink (confirmed working, no `tsconfig` `paths` fallback needed).
  - `packages/vscode/`: the extension itself — `extension/`, `tools/`, `webview/` unchanged internally, plus a new top-level `workspace/` holding the 2 vscode-coupled files (moved out from under `core/`) and the transitively-coupled `remixOrchestrator.ts`. `assets/`, `instructions/`, `prompts/`, `scripts/`, `.esbuild.ts`, `.vscodeignore`, and the actual extension manifest (`package.json`) all live here.
  - Root: new `package.json` (npm workspaces root, shared devDependencies, delegating scripts), new `tsconfig.base.json` (shared compiler options both packages extend), `.eslintrc.js` kept at the root (not duplicated per package) so both packages inherit it via ESLint's own directory-walk resolution.
- **Rename/rebrand**: `packages/vscode/package.json`'s `name` → `open-design-agent-kit`, `displayName` → "OpenDesign Agent Kit", `publisher` → `feima`. Root project name → `open-design-agent-kit`.
- **New icons**, inspired by open-design's real app icon (`apps/web/public/app-icon.svg`, read directly — a colorful gradient badge with a dark four-pointed-sparkle mark), reinterpreted using this project's own already-established brand tokens rather than copied:
  - Activity-bar/TreeView icon (`packages/vscode/assets/icons/gallery.svg`, replacing the old generic 4-square grid): a monochrome stroked four-point sparkle, same convention VS Code requires (recolored via CSS mask).
  - New extension marketplace icon (`packages/vscode/assets/icons/extension-icon.svg` → rasterized `extension-icon.png`, 128×128): a rounded-square badge in this project's near-black ink with the sparkle in its lime-green brand accent. Rasterized with `sharp` (installed as a shared devDependency — network access to npm was available in this environment, confirmed before relying on it).
- `.vscode/launch.json` updated for the new extension location (`--extensionDevelopmentPath=${workspaceFolder}/packages/vscode`).

## Explicit scope cuts (flagged, not silently dropped)

- **Vendored content stays with `packages/vscode`**, not split into `packages/core`, even though a future npm package would likely want the same skill/design-system content pool — solving cross-package content sharing/packaging is real, non-trivial scope that doesn't need solving before that second package exists.
- **The working directory itself was not renamed** (`open-design-extension` → `open-design-agent-kit`). Renaming the directory this session operates inside of, mid-session, risks breaking this very session's cwd and any open editor windows for near-zero benefit right now — left as a manual step for the user.
- **No npm package built** — that was explicit from the request. This round only prepares the shape.

## Impact

- Every source file under the old `src/` moved to either `packages/core/src/` or `packages/vscode/src/`; every cross-reference between them updated (verified via two research passes before moving anything, and via a clean `npm run typecheck`/`lint`/`test:unit`/`compile` afterward — zero errors on the first full run after the moves).
- New: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `tsconfig.base.json`, root `package.json` (rewritten), the two new icon files.
- Modified: `packages/vscode/package.json` (branding, dependencies, new `icon` field), `.vscode/launch.json`, `.gitignore` (added `out-webview/`, a pre-existing gap noticed while auditing build output paths), `README.md`.
- No spec delta — this is an internal reorganization and rebrand with zero behavioral/SHALL-level change, matching this project's established convention of skipping the spec for purely non-functional rounds.
