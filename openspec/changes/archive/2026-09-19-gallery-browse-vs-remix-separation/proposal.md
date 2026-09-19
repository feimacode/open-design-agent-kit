# Bug fix: browsing the gallery tree was writing to the workspace

## Why

The user reported that "browsing and viewing" the gallery was copying files into `.open-design/` — a real bug. `GalleryTreeProvider`'s tree items bound their default click `command` directly to `openDesign.remixExample`, so simply clicking an item to look at it (the natural tree-browsing interaction) triggered the full remix (file copy + manifest registration) immediately. Grid view cards had the opposite problem in spirit: they only offered a Remix button, no way to just look at an example without immediately committing to copying it into the workspace.

## What Changes

- New `ExamplePreviewProvider` (`src/extension/webviews/examplePreviewProvider.ts`): a read-only preview webview for a single example, reading its content directly from this extension's bundled assets (`fs.readFile`, never `asWebviewUri`) and rendering it via `iframe.srcdoc` — no workspace write, ever. Offers its own explicit "Remix into workspace" button for when the user decides they want it.
- Tree view: item click now opens this preview (`openDesign.previewExample`) instead of remixing directly. The existing inline/context-menu Remix action is unchanged — remixing stays available, just no longer the default click behavior.
- Grid view: clicking a card (anywhere except the Remix button, which calls `event.stopPropagation()`) opens the same preview panel.
- QuickPick (`OpenDesign: Browse Gallery`) is unchanged — selecting an item there still remixes directly. This is a deliberate asymmetry: QuickPick is inherently a "pick and confirm" interaction (not an idle-browsing one the way a tree/grid is), so there's no analogous "just looking" gesture to protect there.
- New third webview esbuild entry (`dist/webview/preview.js`) for this panel's client script.

## Capabilities

### Modified: `open-design-tools` gallery browsing

Browsing (tree click, grid card click) is now strictly read-only; remixing (the actual file write) is always a separate, explicit action, in both the tree and grid views.

## Impact

- New files: `src/extension/webviews/examplePreviewProvider.ts`, `src/extension/commands/previewExampleCommand.ts`, `src/webview/preview/main.ts`.
- **Real TypeScript gotcha hit and fixed during implementation**: `src/webview/gallery/main.ts` and `src/webview/preview/main.ts` have no local `import`/`export` statements of their own, so TypeScript treated them as global scripts rather than isolated modules under the shared `tsc -p src/webview` project — their top-level `const vscode`/`const root` declarations collided with each other and with a third webview entry. Fixed by adding an explicit `export {};` to force module scope, which is required for every future webview entry point added to this project.
