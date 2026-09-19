# Design: gallery tree + grid views

## Tree view: Explorer sidebar, not a dedicated activity-bar container

The sibling `feima-copilot-llms-extension` project (this repo's own structural template) registers its endpoint tree under a dedicated activity-bar container with a custom SVG icon (`viewsContainers.activitybar`). That's the right call when a view is a primary, frequently-used surface. For a browse-and-remix list of vendored examples — useful but secondary to the chat-first workflow — adding it under the existing `views.explorer` container instead avoids commissioning a new icon asset and a new permanent activity-bar entry, while still being a standard, fully native `TreeDataProvider` registration (`vscode.window.createTreeView`). `visibility: "collapsed"` keeps it out of the way by default.

Content is vendored at build time and never changes within a running session, so the tree has no refresh command — it populates once, lazily, on first expand (mirroring `ContentIndex`'s own memoize-once pattern), and there's no `onDidChangeTreeData` firing beyond the initial pass.

## Context-menu commands receive the tree element, not the item's bound argument

`GalleryTreeProvider.getTreeItem()` binds each example's `TreeItem.command` to `openDesign.remixExample` with an explicit `arguments: [node.entry.id]` (a plain string) — that's how clicking the item works. A `view/item/context` menu entry targeting the *same* command is invoked differently: VS Code passes the tree element itself (our `GalleryTreeNode`), not the item's bound arguments. `registerRemixExampleCommand`'s handler normalizes both shapes (`resolveSkillId()`) rather than registering two separate commands for what is conceptually one action — caught and fixed during implementation via a TypeScript error, not assumed correct.

## Grid view: pattern adapted from `feima-copilot-ai-flow`, reimplemented in plain DOM/TS

The user pointed at `feima-copilot-ai-flow`'s `webview-src/gallery/` (`App.tsx` + `FlowCard.tsx`) as the reference. Read directly: a `WebviewPanel` singleton (`GalleryViewProvider.open()`, reveals if already open), a `ready`→`update` message handshake, a search input + difficulty filter chips, and a CSS grid of cards (`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`) each showing a compact live preview, title, badges, and action buttons.

What carried over: the singleton-panel-with-reveal structure, the `ready`→`update` handshake (already this extension's own convention from the artifact editor, so no new pattern introduced), the search-bar-plus-filter-chips-above-a-CSS-grid layout, and per-card badges + a primary action button.

What didn't: the reference is React (`webview-src/` has its own `esbuild.webview.mjs` React build); this extension's existing webview (`src/webview/main.ts`) is plain DOM/TS, so the grid view follows that precedent instead of introducing React as a new dependency purely to match the reference — the *structural* pattern is what was asked for, not the specific UI framework. The reference's per-card live preview (an embedded React Flow diagram canvas) was also left out — cards show text metadata and badges only, not a rendered thumbnail. Rendering a live `srcdoc` thumbnail per example (167 of them) upfront would mean sending the full example HTML pool (~8.3MB) through `postMessage` on every panel open; the reference's own lazy per-card `getPreview` request/response pattern would be the right way to add this later without that cost, but it's not part of what "listing and grouping" strictly requires — documented here as a deliberate v1 cut, not an oversight.

## Shared remix logic, not three copies

`remixAndOpen()` already existed implicitly inside `browseGalleryCommand.ts`; this change extracts it to `src/extension/commands/remixAndOpen.ts` so the QuickPick, tree view, and grid webview (three new-or-existing call sites) share one implementation of "remix, show a message, open the preview" rather than three near-identical copies drifting apart over time.

## Build: a third webview entry with explicit output naming

`src/webview/gallery/main.ts` is nested one directory deeper than `src/webview/main.ts`. Without an explicit `out` name, esbuild would mirror that nesting into `dist/webview/gallery/main.js`, but `galleryGridProvider.ts` references a flat `dist/webview/gallery.js` (matching the existing `dist/webview/main.js` convention). `.esbuild.ts`'s webview `entryPoints` now use the `{ in, out }` object form for both entries to control this directly rather than relying on esbuild's default directory-mirroring behavior.
