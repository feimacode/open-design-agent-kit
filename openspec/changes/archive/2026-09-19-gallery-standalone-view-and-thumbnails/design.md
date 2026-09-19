# Design: standalone gallery view + live thumbnails

## Standalone activity-bar container, following the sibling project's own convention after all

The prior change deliberately chose to nest the Gallery tree under `views.explorer` rather than commission a new activity-bar container/icon, reasoning that a secondary browse-and-remix surface didn't warrant it. Explicit user feedback reversed that call: the tree should be standalone with its own icon. Implemented exactly as the sibling `feima-copilot-llms-extension` project does it (`viewsContainers.activitybar` + a 24×24, `fill="none"`/`stroke="#000"` SVG that VS Code recolors as a mask) — this repo's own established reference for VS Code UI conventions, now applied here too. The view's `id` (`openDesign.galleryView`) is unchanged, so the existing `view/item/context` menu `when` clause and the tree provider itself needed no changes — only the `views` container key moved from `explorer` to the new `openDesign` container id.

## Thumbnail delivery: read-once-per-id, postMessage content, not a resource URL

Two delivery mechanisms were available for getting example HTML into the grid's iframes:
1. `webview.asWebviewUri()` pointing at the vendored `example.html` file, set as the iframe's `src` — the webview's embedded browser would then issue an actual `GET` against a `vscode-webview-resource:` URL to fetch it.
2. Read the file's content on the extension host side and hand it to the webview as a plain string via `postMessage`, rendered via `iframe.srcdoc`.

Chose (2) directly per explicit instruction ("should not need to download, should just be sent in memory") — this also matches how the main artifact editor already delivers content (`artifactEditorProvider.ts`'s `init`/`source-updated` messages carry the document text directly, never a URI), so the grid's thumbnails now follow the same established in-memory-content convention rather than introducing a second delivery pattern.

## Lazy per-card fetch via IntersectionObserver, not an upfront batch

The prior change's design notes flagged that sending all ~167 examples' HTML (≈8.3MB) upfront on every panel open would be the wrong default, and pointed at the reference project's own lazy per-card `getPreview` request/response pattern as the right shape to add later. Implemented that now: each card's thumbnail container is `IntersectionObserver`-watched (scoped to the grid's own scroll container, `rootMargin: '200px'` to start loading slightly before a card is fully visible) and unobserved once its preview has been requested, so only cards the user actually scrolls to ever trigger a `get-preview` message — typically a handful at a time, not the full pool. A client-side cache (`Map<id, html>`) means re-filtering (search/category chips) never re-requests a thumbnail already received, even though the whole card grid is rebuilt from scratch on every `render()` call.

## Thumbnail scaling

Example artifacts aren't authored to a single fixed viewport size. Rather than trying to detect or infer each example's "natural" size, thumbnails render the iframe at one fixed design width (1200px, an 8:5 aspect ratio matching the card's `.og-thumb` CSS `aspect-ratio: 8 / 5`) and scale it down via CSS `transform: scale(...)` computed from the actual rendered card width at thumbnail-creation time. This is an approximation, not pixel-perfect reproduction of how the example would render at its "real" size — acceptable for a browsing thumbnail, consistent with how most "live preview card" implementations handle arbitrary-sized content.
