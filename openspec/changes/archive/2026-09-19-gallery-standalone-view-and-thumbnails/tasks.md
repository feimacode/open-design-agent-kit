# Tasks: gallery-standalone-view-and-thumbnails

## 1. Standalone tree view

- [x] `assets/icons/gallery.svg` — 24×24, matching the sibling project's icon convention exactly
- [x] `package.json` — `viewsContainers.activitybar` entry; moved the Gallery view from `views.explorer` to `views.openDesign`
- [x] Confirmed no code changes needed in `galleryTreeProvider.ts` or the `view/item/context` menu — the view `id` didn't change

## 2. Live grid thumbnails, in-memory delivery

- [x] `galleryGridProvider.ts`: `get-preview` message handler reads `example.html` via `fs.readFile` (extension's own bundled assets, no network) and posts it back as a plain string
- [x] CSP: added `frame-src *` (needed for the thumbnail `srcdoc` iframes)
- [x] `src/webview/gallery/main.ts`: `IntersectionObserver`-based lazy per-card fetch, one-request-per-id cache, `iframe.srcdoc` rendering with computed CSS `transform` scale from a fixed 1200px design width

## 3. Verify

- [x] `npm run typecheck` (both projects), `npm run lint`, `npm run test:unit` (41 passing, unchanged), `npm run compile` (all three bundles build)
- [x] `node -e` sanity check: `viewsContainers`/`views` contributions present and correctly shaped, icon file exists on disk
- [ ] **Not performed**: manual verification in a live Extension Development Host — confirm the OpenDesign activity-bar icon appears and opens the Gallery tree; confirm grid thumbnails load lazily as cards scroll into view and render recognizable content. Same documented gap as every prior change in this repo.
