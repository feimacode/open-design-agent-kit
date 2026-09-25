## Context

`social-post-export` added `exportArtifact()` in `packages/core/src/export/`. It resolves a registered artifact, serves the workspace over a loopback-only static server, loads the entry in headless Chromium through `puppeteer-core` (an installed browser, never downloaded), waits for network idle and fonts, and screenshots the viewport or per-selector elements into `<artifact-dir>/exports/`. It is exposed as the VS Code tool, the MCP tool and `open-design-agent-kit export`.

Upstream Open Design exports decks in its Electron desktop app (`apps/desktop/src/main/deck-capture.ts`, ~3,250 lines) plus daemon assembly (`apps/daemon/src/deck-export.ts`):

- **Deck vs page:** an explicit `deck` flag wins. Otherwise the deck-ness is inferred from real slide elements matching `.slide, [data-screen-label], .deck-slide, .ppt-slide`, excluding presenter clones inside `.mini-slide, .overview, .notes-overlay, .thumb`. The count is done without mutating the page, so page mode captures an untouched DOM.
- **Deck preparation:** hide deck chrome (`.progress-bar, .notes-overlay, aside.notes, .speaker-notes, .deck-nav, .deck-hint, .deck-counter`), set `noscale` and remove transforms on `deck-stage, #deck-stage, .deck-stage`, zero every animation and transition duration, measure the authored slide box (deck-stage design size → width/height attributes → inline style → computed size → offset size; clamped, falling back to 1920×1080), then pin `html`, `body` and the stage to that size.
- **Per-slide capture:** `showSlide(i)` forces the active slide visible and every other slide hidden with inline `!important` styles, toggles `active`/`visible`/`is-active`/`current` classes and the `data-od-deck-active` attribute (which reveals slides under the deck-stage fallback's shadow `!important` rule), and waits two animation frames. If the slide landed off-screen (a translated carousel strip), `restackActiveSlide` moves the live node into a fixed capture layer with `moveBefore` and restores it afterwards. Capture uses CDP `Page.captureScreenshot`.
- **Assembly:** `pptxgenjs` builds one full-bleed image per slide. The layout is `LAYOUT_16x9` when the aspect is within 0.01 of 16:9, otherwise a custom layout 13.333 in wide. `pdf-lib` builds one page per slide image, with the longest side normalized to 960 pt.
- **Editable mode** injects the vendored `dom-to-pptx` 2.0.1 UMD bundle (MIT, 1 MB gzipped) after `showAllSlides` and runs extensive normalization (CJK fonts, layered gradients, opacity and effects rasterized to a background).
- **Page PDF** uses Electron's `printToPDF` with `preferCSSPageSize`, `printBackground` and zero margins.

About 78 of our vendored examples carry slide markers, which gives a ready test corpus.

## Goals / Non-Goals

**Goals:**
- Pixel-faithful deck → PPTX and deck → PDF from every host, reusing the existing export pipeline.
- Vector, selectable-text PDF for ordinary pages.
- Deck capture behaves like upstream on upstream's own deck templates (same selectors, same show-one-slide mechanics, same measured stage).
- Manifests advertise only formats we can produce.
- Leave a clean seam for editable PPTX later.

**Non-Goals:**
- Editable PPTX (`dom-to-pptx`) in this change.
- Speaker notes in PPTX, slide transitions, or embedded video.
- Zip export.
- Stitching all slides into one tall image (upstream `stitch`). Can be added later.
- Porting upstream's per-slide duplicate-frame retry. CDP screenshots, which puppeteer uses, render the current DOM, so the race it guards against doesn't apply.

## Decisions

### D1. Extend `exportArtifact`, don't add a tool
`format` gains `pptx` and `pdf`, and the input gains `deck?: boolean` and `slides?: number[]`. One tool keeps the model's choice simple ("export this as X"), and the CLI and MCP surfaces stay in sync with no new schemas beyond the added fields. `formatExportResult` reports the slide count and the stage size.

*Alternative considered:* a separate `export_open_design_deck` tool. Rejected: two export tools with overlapping arguments invite the model to pick the wrong one, and "PDF" applies to both pages and decks.

### D2. Deck-or-page resolution
1. `deck: true` → deck mode, failing with `no-slides` if no real slide element exists.
2. `deck: false` → page mode.
3. Otherwise, the manifest `kind === 'deck'` or `renderer === 'deck-html'` → deck mode (same failure if no slides).
4. Otherwise, the non-mutating slide count: at least 2 real slides **and** a `deck`-mode source skill (`sourceSkillId` starting with `od:deck:`) → deck mode; in every other case, page mode. *As built:* deck-ness is decided first, then the format is checked against `exportsForKind(isDeck ? 'deck' : kind)`, so an `html`-kind artifact from a deck skill (which is what remix registers) exports as a deck with no flag.
5. PPTX of something resolved as a page fails with `not-a-deck` and a hint to pass `deck: true`.

This keeps upstream's rule that `.slide` alone isn't proof of a deck, while registered decks need no flag.

### D3. Port the in-page scripts as self-contained functions under `core/src/export/deck/pageScripts.ts`
The functions are `countRealSlides`, `prepareDeckStage`, `measureSlide`, `pinDeckStage`, `showSlide`, `restackActiveSlide`, `restoreActiveSlideCapture` and `showAllSlides` (the last is unused for now; kept for the editable seam). They run through `page.evaluate(fn, ...args)`: puppeteer serializes a function the same way upstream's `executeJavaScript(fn.toString())` does, so the ported bodies stay close to verbatim. That makes future upstream fixes easy to diff.

- Each function must stay self-contained (no closures over module scope); a unit test asserts `fn.toString()` references no free identifiers beyond browser globals and its parameters.
- Core compiles without DOM lib types. *As built:* the scripts declare `document`, `window` and `requestAnimationFrame` as module-scoped `any` (a triple-slash `lib="dom"` reference turned out to be program-wide). Functions are fully self-contained, because upstream's by-name composition of siblings breaks under the minified VS Code bundle; a test checks both tsc and esbuild-minified output.
- `moveBefore` (Chrome 133+) falls back to `insertBefore`/`appendChild` when absent. That loses live canvas and iframe state on restack, but works on older browsers. This is a small, documented divergence.
- Selectors live in one `selectors.ts` (`SLIDE_SELECTOR`, `PRESENTER_CLONE_SELECTOR`, `HIDE_CHROME_SELECTOR`, `DECK_STAGE_SELECTOR`), matching upstream values.

### D4. `<deck-stage>` fallback via an entry transform
Upstream's `injectDeckStageFallback(html)` (from `packages/contracts/src/runtime/deck-stage-fallback.ts`, ~340 lines, pure string manipulation plus an inline custom-element script) is ported to `core/src/export/deck/deckStageFallback.ts`. The static server gains an optional `transformEntry(html) → html` hook, applied only to the artifact's entry file. The fallback is injected only when `htmlUsesDeckStageElement(html)` is true and the document doesn't already load a `deck-stage.js`, so decks with a real runtime use that instead.

*Alternative considered:* `page.evaluateOnNewDocument` to define the element. Rejected: upstream's fallback expects a specific injection point relative to `<head>`, and string injection keeps us byte-compatible with it.

### D5. Capture loop
The flow is: load (existing `loadPage`, with the same readiness waits) → count → lay out at 1920×1080, as upstream does (decks sized in viewport units would otherwise measure as the image path's viewport) → `prepareDeckStage` → measure the stage (explicit `width`/`height` win) → `setViewport(stage, deviceScaleFactor)` → `pinDeckStage` → for each index in `slides ?? all`: `showSlide`, check that the returned rect covers the stage (±2 px, at least 50%) and otherwise `restackActiveSlide` plus two frames, then `page.screenshot({ clip: 0,0,w,h })`. PPTX and PDF slides use PNG by default. `scale` (1–3, default 2 for PPTX/PDF) sets the capture resolution: 2× keeps slide text crisp when projected, and PPTX size stays reasonable.

Capture and assembly are separate steps (`captureDeckSlides()` → `SlideImage[]`, then `assemblePptx()` / `assemblePdf()`), which gives editable PPTX a seam: it would replace the capture loop after `pinDeckStage` with `showAllSlides` plus `dom-to-pptx`, and reuse everything before.

### D6. Assembly
- `assemblePptx(images, { aspect, title })` ports `buildScreenshotPptx`, including `resolvePptxConstructor` for pptxgenjs's CJS/ESM default-export shapes (they matter under esbuild bundling as they do under tsx). The deck's `<title>` or the manifest title becomes the PPTX title, and the author is "Open Design".
- `assemblePdf(images)` ports `buildScreenshotPdf` (longest side 960 pt, aspect preserved).
- Output: `<artifact-dir>/exports/<basename>.pptx` or `.pdf`. A slide subset exported as images produces `<basename>-NN.png`, with the 1-based slide number, not the position within the subset.
- `maxBytes` applies to image formats only. For PPTX and PDF, an oversized result produces a warning suggesting `scale: 1`, not re-encoding.

### D7. Page PDF uses the print engine
`page.emulateMediaType('print')` → `page.pdf({ printBackground: true, preferCSSPageSize: true, margin: 0 })`, with the page size defaulting to A4 when the page declares no `@page` size (`width`/`height` arguments override). The result is vector with selectable text, matching upstream's `printToPDF`. Pages don't get slide mechanics or DOM mutation.

### D8. Honest manifest exports
A shared `exportsForKind(kind)` in core replaces the three duplicated `KIND_TO_EXPORTS` maps:

| kind | exports |
|---|---|
| `html`, `mini-app` | `html`, `png`, `jpeg`, `pdf` |
| `deck` | `html`, `png`, `jpeg`, `pdf`, `pptx` |
| `svg`, `diagram` | `svg`, `png`, `jpeg` |
| `markdown-document` | `md` |
| `react-component` | `jsx` |
| `code-snippet` | `txt` |
| `design-system` | `md` |

The vendored `ALLOWED_EXPORTS` adds `png`, `jpeg` and `pptx`, recorded in `SOURCE.md` as the second documented divergence, after the collection fields. Existing manifests aren't rewritten. Their stale `zip` stays harmless because nothing reads it for behavior. `exportArtifact` refuses formats not in the kind's list, with a clear message. The exception is an explicit `deck: true`, which applies the `deck` list (an agent may have registered a real deck as `html`).

### D9. Agent guidance
- The export tool description lists "deck → pptx/pdf, page → pdf".
- The overview skill and the VS Code chat instructions add one line: after registering a deck, offer PPTX/PDF export, and export when asked.
- The deck skills' vendored text is untouched.

## Risks / Trade-offs

- [Deck conventions we haven't seen (custom JS routers that only render the active slide)] → `showSlide` covers upstream's conventions. If a captured slide is blank (all pixels equal the first pixel), the result adds a warning naming the slide. Test against the vendored deck examples (a smoke test over a sample of ~10 in CI when a browser is present).
- [Web fonts or images still loading per slide] → The readiness waits run once before the capture loop, and slides are revealed from an already-loaded document. Lazy-loaded images (`loading="lazy"`) are forced eager in `prepareDeckStage`, a small addition over upstream.
- [PPTX size at 2× for long decks] → PNG slides at 3840×2160 are ~0.5–2 MB each. `scale: 1` halves the resolution, and a warning appears above 50 MB.
- [pptxgenjs bundling quirks (ESM/CJS default)] → The ported `resolvePptxConstructor` handles every known module shape. A unit test builds a 2-slide PPTX and checks the zip structure (`ppt/slides/slide1.xml`, `slide2.xml`, `ppt/media/*`).
- [Apache-2.0 provenance of the ported code] → The ported files carry a header comment naming the upstream file and commit, and `vendored/SOURCE.md` gains a "Deck export" section.
- [`moveBefore` missing in older browsers] → The D3 fallback applies, and a warning is added when it's used.

## Migration Plan

Additive. Archive `social-post-export` first, so the `artifact-export` capability exists and this change's requirements attach to it. There's no data migration: old manifests keep their `exports`, and new registrations get the accurate list. Rollback means reverting the change. Artifacts are unaffected.

## Open Questions

- Should `scale` default to 2 for decks (crisper, larger files) or 1 (matches image export's default)? The design proposes 2 for PPTX/PDF only.
- Should the VS Code preview toolbar get "Export ▸ PPTX / PDF / PNG" buttons, or should export stay agent- and CLI-driven for now? The design leaves UI buttons for a follow-up.
