# Gallery tree view + grid view

## Why

The prior change (`visual-artifact-editor`) added Gallery/Remix as a chat tool and a QuickPick command, but browsing ~167 examples through a QuickPick alone is keyboard-driven and one-at-a-time — there was no always-visible or richly visual way to see what's available. The user asked for a tree view (native, always-visible grouping) and a grid view (richer visual browsing), and specifically pointed at `feima-copilot-ai-flow`'s flow gallery (`webview-src/gallery/`) as the pattern to follow for the grid.

## What Changes

- New **Explorer sidebar tree view** ("OpenDesign Gallery", `openDesign.galleryView`): categories → examples, click or right-click → Remix.
- New **grid webview** (`OpenDesign: Open Gallery Grid` command), modeled on `feima-copilot-ai-flow`'s gallery: a search bar + category filter chips above a CSS-grid of cards (name/description/category/mode badges, Remix button), as a singleton `WebviewPanel` that reveals itself if already open — same `ready`→`update` message handshake and CSP-nonce pattern already established for this extension's other webview.
- Extracted `remixAndOpen()` (`src/extension/commands/remixAndOpen.ts`) so the QuickPick command, the tree view, and the grid webview all call the same remix-then-open-preview logic instead of duplicating it a third time.
- A third esbuild webview entry point, with explicit `out` names (`main`, `gallery`) so both browser bundles land flat in `dist/webview/` regardless of source nesting.

## Capabilities

### Modified: `open-design-tools` gallery browsing

Adds two more native ways to browse and remix the same example pool (tree view, grid webview) alongside the existing QuickPick and chat tool — all four share identical remix behavior.

## Impact

- New files: `src/extension/views/galleryTreeProvider.ts`, `src/extension/webviews/galleryGridProvider.ts`, `src/webview/gallery/main.ts`, `src/extension/commands/{remixAndOpen,openGalleryGridCommand}.ts`.
- `package.json`: new `views.explorer` entry, new command, new `view/item/context` menu entry.
- Deliberate scope cut: no live per-card HTML thumbnails in the grid (the reference project renders live flow-diagram previews per card) — cards show text/badges only. Reasonable follow-up, not core to "listing and grouping."
