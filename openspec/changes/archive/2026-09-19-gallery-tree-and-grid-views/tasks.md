# Tasks: gallery-tree-and-grid-views

## 1. Research

- [x] Read `feima-copilot-ai-flow`'s `webview-src/gallery/{App.tsx,FlowCard.tsx,gallery.css}` and `src/ui/galleryViewProvider.ts` end-to-end for the reference pattern
- [x] Read the sibling `feima-copilot-llms-extension`'s `localEndpointTreeProvider.ts`/`treeGrouping.ts`/package.json `viewsContainers`/`views` for the TreeDataProvider precedent
- [x] Decide: Explorer-nested view (no new activity-bar container/icon asset) vs. a dedicated container — chose Explorer-nested, documented in `design.md`

## 2. Shared remix logic

- [x] `src/extension/commands/remixAndOpen.ts` — extracted `remixAndOpen()` from `browseGalleryCommand.ts`, plus `registerRemixExampleCommand` for the new `openDesign.remixExample` command (context-menu/tree-item target)
- [x] `browseGalleryCommand.ts` simplified to call the shared helper

## 3. Tree view

- [x] `src/extension/views/galleryTreeProvider.ts` — `GalleryTreeProvider` (category → example nodes), lazy-once population
- [x] `package.json` — `views.explorer` entry, `view/item/context` menu entry for Remix
- [x] Fixed a real bug during implementation: `view/item/context` invocations pass the tree element, not the item's bound `command.arguments` — `resolveSkillId()` normalizes both shapes

## 4. Grid view

- [x] `src/webview/gallery/main.ts` — search + filter chips + CSS grid, plain DOM/TS (not React, unlike the reference — see `design.md`)
- [x] `src/extension/webviews/galleryGridProvider.ts` — singleton `WebviewPanel`, CSP-safe inline styles matching this extension's existing webview convention, `ready`→`update` handshake
- [x] `src/extension/commands/openGalleryGridCommand.ts` — `OpenDesign: Open Gallery Grid` command
- [x] `.esbuild.ts` — third webview entry with explicit `{ in, out }` naming so both bundles land flat in `dist/webview/`

## 5. Verify

- [x] `npm run typecheck` (both projects), `npm run lint`, `npm run test:unit` (41 passing, unchanged — no new pure-logic modules needing tests in this change), `npm run compile`
- [x] Confirmed `dist/webview/main.js` and `dist/webview/gallery.js` both build flat as expected
- [x] `node -e` sanity check on `package.json`: new command present, `views.explorer` entry present, `view/item/context` menu entry present
- [ ] **Not performed**: manual verification in a live Extension Development Host — expand the tree, click/right-click an example, confirm remix + preview open; open the grid, search/filter, click Remix on a card. Same documented gap as every prior change in this repo.
