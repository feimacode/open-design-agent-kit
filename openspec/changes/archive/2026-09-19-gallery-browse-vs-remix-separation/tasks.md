# Tasks: gallery-browse-vs-remix-separation

## 1. Root cause

- [x] Confirmed: `GalleryTreeProvider.getTreeItem()` bound example items' default click `command` directly to `openDesign.remixExample` — clicking to browse triggered a real workspace write

## 2. Read-only preview panel

- [x] `src/extension/webviews/examplePreviewProvider.ts` — singleton `WebviewPanel`, reads example content via `fs.readFile` from bundled assets only, never writes; "Remix into workspace" button as the one explicit write path
- [x] Fixed a `ready`-handshake race caught during implementation: initial content was posted synchronously before the webview script could have attached its message listener — fixed by stashing the pending skillId and loading only after `ready`
- [x] `src/webview/preview/main.ts` — renders the fetched HTML via `iframe.srcdoc`; posts `remix` only on explicit button click
- [x] `src/extension/commands/previewExampleCommand.ts` — `openDesign.previewExample`, same arg-normalization shape as `remixAndOpen.ts`'s command

## 3. Wire browsing to preview, not remix

- [x] `galleryTreeProvider.ts`: item click now `openDesign.previewExample`; inline/context-menu Remix unchanged
- [x] `src/webview/gallery/main.ts`: card click opens the preview (`open-preview` message); Remix button `stopPropagation()`s so it doesn't also trigger the card's own click handler
- [x] `galleryGridProvider.ts`: handles `open-preview` by calling `ExamplePreviewProvider.show()`
- [x] QuickPick (`browseGalleryCommand.ts`) left unchanged — deliberate asymmetry, documented in `design.md`

## 4. Build

- [x] Third webview esbuild entry (`dist/webview/preview.js`)
- [x] **Fixed a real TypeScript bug caught by `tsc -p src/webview`**: `gallery/main.ts` and `preview/main.ts` have no local imports, so TS treated them as global scripts sharing one scope — `Cannot redeclare block-scoped variable 'vscode'`/`'root'`. Fixed with `export {};` in both files.

## 5. Verify

- [x] `npm run typecheck` (both projects, after the module-scope fix), `npm run lint`, `npm run test:unit` (41 passing, unchanged), `npm run compile` — all three webview bundles (`main.js`, `gallery.js`, `preview.js`) build
- [ ] **Not performed**: manual verification in a live Extension Development Host — click a tree item and grid card, confirm no file appears under `.open-design/` until Remix is explicitly clicked; confirm the preview panel renders recognizable content. Same documented gap as every prior change in this repo.

## 6. Follow-up fix (found via the manual verification this same change flagged as not-yet-performed)

- [x] **Real activation error, caught by the user**: `[iven.open-design-tools]: Menu item references a command 'openDesign.remixExample' which is not defined in the 'commands' section.` VS Code requires every command referenced anywhere in `contributes.menus` to also have a `contributes.commands` entry — this is true even for commands only ever invoked programmatically (a tree item's own bound `command` property, or from a webview), which is why this wasn't caught until the `view/item/context` menu registration specifically. `openDesign.remixExample` and `openDesign.previewExample` were both missing. Fixed: added both to `contributes.commands` (with `menus.commandPalette` entries setting `when: "false"` for both, since neither is meaningful without the argument only the tree/grid/preview UI supplies). This is the actual value of doing the manual Extension-Development-Host check this repo keeps flagging as skipped — it would have caught this before it reached the user.

## 7. Second follow-up (from the user's own manual testing)

- [x] **Real CSS bug: an unexplained empty rectangle always visible in the artifact editor.** `.od-panel`'s CSS rule set `display: flex` unconditionally, and author-origin CSS always wins over the browser's built-in `[hidden] { display: none }` rule regardless of the `hidden` attribute — so the comment/edit side panel (280px, bordered, shadowed, bottom-right) was visible at all times, not just when populated after selecting an element. Fixed: split `display: flex` into its own `.od-panel:not([hidden])` rule, so the `hidden` attribute (already correctly toggled by the existing JS) now actually takes effect.
- [x] **Real bug: navigation inside previewed examples (e.g. deck slide nav) not working.** The example preview panel's iframe sandbox was `allow-scripts` only — missing `allow-same-origin`, `allow-forms`, etc. Many examples' own init scripts touch same-origin-dependent APIs (e.g. `localStorage`) and throw immediately under that restrictive sandbox, silently killing the script before it ever attaches its own click/keyboard handlers. Fixed by broadening the sandbox on all three iframes (preview panel, grid thumbnails, main artifact editor) to `allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals` — matching upstream's own "powered preview" sandbox set, and consistent with the already-accepted tradeoff (these are curated, extension-bundled examples, not arbitrary content). Grid thumbnails stay non-interactive via `pointer-events: none` on the iframe element, not via under-sandboxing — the two mechanisms serve different purposes and conflating them was the root cause.
- [x] `npm run typecheck`, `npm run lint`, `npm run test:unit` (41 passing, unchanged), `npm run compile` all clean; confirmed both fixes present in the built bundles via `grep`

