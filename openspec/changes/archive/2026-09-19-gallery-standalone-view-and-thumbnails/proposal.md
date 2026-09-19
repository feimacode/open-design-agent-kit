# Gallery: standalone activity-bar view + live grid thumbnails

## Why

Three follow-up requests on the just-shipped tree/grid views: (1) the tree view should be a standalone, dedicated activity-bar entry with its own icon rather than nested inside Explorer; (2) the grid view should show a live thumbnail of each example, not just text/badges (a deliberate v1 cut in the prior change); (3) thumbnail content should be delivered in-memory, not via any mechanism resembling a "download."

## What Changes

- New `viewsContainers.activitybar` entry (`openDesign`, icon `assets/icons/gallery.svg`, 24×24 monochrome SVG matching the sibling `feima-copilot-llms-extension`'s own icon convention) — the Gallery tree view moves from `views.explorer` into this dedicated container.
- Grid view cards now show a live thumbnail: `GalleryGridProvider` handles a new `get-preview` message by reading the requested example's `example.html` directly from this extension's bundled assets (`fs.readFile`, no network, no `asWebviewUri`) and posting the raw HTML string back as `{ type: 'preview', id, html }`. The webview renders it via `iframe.srcdoc`, scaled down from a fixed 1200px design width via CSS `transform`.
- Thumbnails are fetched lazily — one card at a time, only once it actually scrolls into view (`IntersectionObserver`, `rootMargin: '200px'`) — not all ~167 examples' HTML upfront, and each id is only requested once (cached client-side for the panel's lifetime).

## Capabilities

### Modified: `open-design-tools` gallery browsing

The tree view is now a standalone, always-reachable activity-bar entry; the grid view's cards show live, in-memory-delivered thumbnails instead of text-only summaries.

## Impact

- New asset: `assets/icons/gallery.svg`.
- `package.json`: `viewsContainers` added; the Gallery view's container changed from `explorer` to `openDesign` (its view `id` is unchanged, so existing `when` clauses referencing `view == openDesign.galleryView` still work).
- `galleryGridProvider.ts`'s webview CSP gains `frame-src *` (needed for the thumbnail `srcdoc` iframes, matching the artifact editor's existing CSP).
- Same known limitation as the main artifact editor: relative asset paths inside a previewed example (e.g. `<img src="assets/x.png">`) may not resolve inside the sandboxed thumbnail iframe.
