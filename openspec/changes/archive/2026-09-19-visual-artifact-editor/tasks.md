# Tasks: visual-artifact-editor

## 1. Research

- [x] Trace open-design's `FileViewer.tsx`/edit-mode/comments implementation end-to-end, identify the framework-agnostic portable pieces
- [x] Confirm the "comments are never applied by a special engine" finding by reading the actual comment-status lifecycle and chat-attachment code
- [x] Ground VS Code's Custom Editor / Webview / Comments APIs against current docs; confirm Comments API is text-range-only and rejected for this use case
- [x] Trace Gallery/Remix end-to-end; confirm no daemon/project-database dependency in the core mechanic
- [x] Fold Gallery + Remix into this same change (user asked to consider them together) rather than defer

## 2. Content vendoring (Gallery/Remix)

- [x] `scripts/sync-open-design-content.mjs`: `copyExamples()` — only entries with `example.html`, copies sibling `assets/`, 2MB-per-example size cap
- [x] `ContentIndex`: `loadExamples()` fourth pool, `source: 'example'`, `exampleArtifactPath`, `examplePrompt` from `open-design.json`'s `od.useCase.query.en`
- [x] Verified: 167 examples vendored (2 skipped for size), ~8.3MB added

## 3. Comments (extension-host, pure)

- [x] `src/core/workspace/artifactComments.ts` — `ArtifactComment` type, sidecar read/write, workspace-escape guard
- [x] `getArtifactTool.ts` — `openComments` field in response

## 4. Remix (extension-host, pure + tool + command)

- [x] `src/core/workspace/remixExample.ts` — pure file-copy (+ assets), workspace-escape guard
- [x] `src/core/workspace/remixOrchestrator.ts` — shared `performRemix()` used by both the tool and the command
- [x] `src/tools/remixExampleTool.ts` — `remix_open_design_example` tool
- [x] `src/extension/commands/browseGalleryCommand.ts` — `OpenDesign: Browse Gallery` QuickPick, grouped by category

## 5. Visual editor (webview + custom editor)

- [x] Second esbuild target (browser platform, IIFE) + `src/webview/tsconfig.json` (DOM lib) + root tsconfig exclude + `typecheck` script update
- [x] `src/webview/dom/elementTargeting.ts` — adapted from `edit-mode/bridge.ts` (direct `contentDocument` access, no bridge script)
- [x] `src/webview/dom/sourcePatches.ts` — adapted from `edit-mode/source-patches.ts` (curated patch set)
- [x] `src/webview/dom/commentOverlay.ts` — adapted from `comments.ts` (simplified anchor resolution)
- [x] `src/webview/main.ts` — toolbar, mode switching, comment pins, edit panel, postMessage protocol
- [x] `src/extension/customEditors/artifactEditorProvider.ts` — `CustomTextEditorProvider`, CSP-safe webview HTML, message handling, `WorkspaceEdit`-based patch application
- [x] `src/extension/commands/openArtifactPreviewCommand.ts`
- [x] `registerArtifactTool.ts` — auto-open preview for `.html` entries on successful registration
- [x] `package.json` — `customEditors`, `commands` (browseGallery, openArtifactPreview), Explorer context-menu entry, `remix_open_design_example` tool contribution, updated `list_open_design_skills`/`get_open_design_artifact` modelDescriptions
- [x] Fixed a real bug caught during implementation: the webview HTML template originally generated two different nonces (one for the CSP header, one for the `<script>` tag), which would have silently broken the script under CSP — fixed to generate once and reuse

## 6. Verify

- [x] `npm run sync-content` — `assets/open-design/examples/` populated with `SKILL.md` + `example.html` (+ `assets/` where present) pairs
- [x] `npm run typecheck` (both projects), `npm run lint` (found and fixed two genuine dead-variable warnings in `main.ts`), `npm run test:unit` (41 passing: 34 prior + 4 `artifactComments` + 3 `copyExampleArtifact`)
- [x] `npm run compile` — both `dist/extension.js` (180K) and `dist/webview/main.js` (12K) build successfully
- [x] `node -e` sanity check on `package.json`: 7 tools, 3 commands, 1 custom editor, valid JSON
- [ ] **Not performed**: manual verification in a live Extension Development Host — generate an artifact, confirm auto-open; toggle Comment mode, pin a note, confirm the sidecar file and "Send to chat" prefill; toggle Edit mode, change an element, confirm the file updates and Ctrl+Z undoes it; run "OpenDesign: Browse Gallery", remix an example, confirm it opens in the preview. Same documented-gap pattern as every prior change in this repo — needs a human running VS Code interactively.
- [ ] **Not performed**: any automated test of the webview's browser-context code (no DOM test harness in this repo) — see `design.md`'s scope-cuts section.
