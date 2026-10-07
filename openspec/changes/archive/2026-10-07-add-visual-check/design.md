## Context

`exportArtifact` (packages/core/src/export/exportArtifact.ts) already does the hard parts. It finds an installed Chromium (`browserDiscovery.ts`), serves the workspace with `staticServer`, loads the page and waits for fonts and network idle (`loadPage`), and runs `runPreflight`, which already falls back to `document.body` when there is no `data-od-card`. With `checkOnly: true` it returns findings and writes nothing. It also takes card thumbnails (`thumbnails[]`) and composes them into a contact sheet by rendering HTML in the same browser (`composeShapeSheet`).

What's missing:
1. **Images never reach the agent.** VS Code's `ExportArtifactTool` returns one `LanguageModelTextPart`. The MCP server's `CallToolRequestSchema` handler wraps a `string` returned by every handler (`mcp-server/src/index.ts`).
2. **Decks skip preflight.** `exportArtifact` rejects `checkOnly` for deck modes.
3. **One viewport.** Non-card pages are checked at whatever layout viewport export uses, never at phone width.
4. **No habit.** Instructions mention `checkOnly` only in the poster flow.

Constraints: no daemon, never download a browser (artifact-export spec), keep native tools per host, and add no new npm dependencies unless needed.

## Goals / Non-Goals

**Goals:**
- One call gives the agent what the artifact looks like (images) and what's measurably wrong (findings), for pages, cards and decks.
- A bounded token cost per call.
- The same behavior on VS Code, MCP (Claude Code, Codex, Cursor) and the CLI.
- The instructions make checking part of every generation, not only posters.

**Non-Goals:**
- An LLM-judged aesthetic score. The agent judges the image itself; the `critique` template stays a separate, optional deliverable.
- Pixel diffing against a previous render or a reference image.
- Interaction testing (clicks, hover states, scripted flows) or animation capture. Motion is a separate backlog item.
- Changing `export_open_design_artifact`'s behavior or result format.
- Showing the screenshot to the user in the preview. The live preview already does that.

## Decisions

### D1. A new tool rather than another `export` flag
Add `check_open_design_artifact` instead of an `includeScreenshots` option on export. The agent picks tools by intent: "look at what I made" isn't "export". Export's argument surface (format, preset, bleed, data, maxBytes…) is already large, and its `checkOnly` path rejects decks. The new tool shares internals by factoring out of `exportArtifact` a `withArtifactPage(entryPath, viewport, fn)` helper (browser launch, static server, `loadPage`, cleanup) that both use. Export's behavior is unchanged.
*Alternative:* extend `checkOnly` to return images. That keeps one tool, but makes poster vocabulary the entry point for every artifact and widens a mode-validation branch that is already tangled.

### D2. What gets rendered
- **Card artifacts** (any `[data-od-card]`): each card at its own size, like export today. More than one card is returned as one contact sheet (`composeShapeSheet`).
- **Other pages** (`html`, `mini-app`, `svg`): `viewports` defaults to `[{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]`. Each viewport is one screenshot of the first screen, plus up to `maxImages` total from scrolling further down (`fullPage: true` with tiling) when the page is taller. Findings carry `viewport`.
- **Decks** (`deck-html`): use `captureDeck`'s slide navigation (`countSlides` plus its existing per-slide stepping) to run `runPreflight` per slide, with findings tagged `slide`. The slides go into one contact sheet, 3 columns, at most 12 slides per sheet; a `slides: number[]` argument picks the slides for larger decks.
*Alternative:* always return a full-page screenshot. Rejected: tall landing pages produce one huge image that the model downsamples until it can't be read.

### D3. Image budget
Each image is resized so its long edge is at most 1568 px (the size above which vision models downsample anyway), encoded as JPEG quality 80, with `maxImages` defaulting to 3 (hard cap 6). Resizing happens in the browser: draw the capture into an HTML page sized to the target, the same approach as `composeShapeSheet`, so no image library is added. At about w×h/750 tokens per image, the default worst case is about 6–7k tokens.
*Alternative:* `pngjs`-based resizing in Node. Rejected: it's slow for large images and needs a resampling routine we would have to write.

### D4. Host delivery
- Core returns `{ findings, images: Array<{ label, mime, data: Buffer, width, height }>, text }`.
- **VS Code:** `[LanguageModelTextPart(text), ...images.map(i => LanguageModelDataPart.image(i.data, i.mime))]`. Engine `^1.104` already has the API.
- **MCP:** widen the handler contract to `string | { text: string; images?: Image[] }`. The dispatcher maps images to `{ type: 'image', data: base64, mimeType }`. Existing handlers keep returning strings.
- **CLI:** prints the formatted findings. `--screenshots <dir>` writes the images as `<label>.jpg`. Exits 0 even when findings exist (a check isn't a failure), and non-zero only on load errors or when no browser is found. `--fail-on error` lets CI gate on errors.
*Alternative:* write screenshots to `exports/.check/` and return paths. Rejected: Copilot's agent can't open image files, which is the gap this change exists to close.

### D5. The `horizontal-scroll` check
Runs only in viewport checks. It flags `document.scrollingElement.scrollWidth > innerWidth + 1` and names the element with the largest right edge beyond the viewport (skipping elements inside `overflow-x: auto|scroll` containers and fixed off-canvas elements, i.e. `position: fixed` with `transform`, which are intentional). Severity is `error` at phone width and `warning` at desktop width. It lives in `pageScripts.ts` next to `collectPreflight`, but runs from the check tool, so poster and card exports are unaffected.

### D6. The check-before-done loop in instructions
Add one paragraph to both instruction sources (VS Code instructions, Claude/Codex `open-design` skill). After writing or substantially editing an artifact and registering it, call `check_open_design_artifact`. Fix every `error`, look at the images for composition problems the checks can't measure (balance, hierarchy, empty or crowded regions, text over busy imagery), and stop after two fix rounds even if warnings remain, telling the user what's left. Don't describe the screenshots to the user unless asked. If the tool returns `no-browser`, skip the check and say once that visual checking needs Chrome, Edge or Chromium.
The poster flow's `checkOnly` step is replaced by the new tool for checking; `checkOnly` remains documented for bulk-data rows and shape sheets, which the check tool doesn't cover.

## Risks / Trade-offs

- [Token cost on long sessions] → defaults bounded (3 images, 1568 px); `maxImages: 0` returns findings only; the instructions say to check once per substantial edit, not after every small tweak.
- [Browser startup latency (~1–2 s) on every check] → acceptable for an end-of-step check; the browser is not kept alive between calls (no daemon).
- [Some MCP clients ignore image content] → the text part always carries the full findings, so the tool still works blind.
- [Model over-trusts screenshots of animated or interactive pages] → wait for readiness as export does, and add a 300 ms settle. Animated pages are captured mid-animation; the result text says the capture is a single moment.
- [False positives for `horizontal-scroll` from intentional carousels] → skip scroll containers and fixed off-canvas elements; the severity and the named element let the agent judge.
- [Deck slide stepping differs across deck frameworks] → reuse `captureDeck` and `deckStageFallback`, which already handle the vendored deck shapes; when slides can't be counted, fall back to a page check with a warning.

## Migration Plan

Additive. A new tool, a new CLI command and new instruction text; no setting or manifest changes. Rollback is removing the tool registration and the instruction paragraph.

## Resolved Questions

- **Preview "Check" button?** Deferred to a follow-up change. This change keeps to the agent-facing tool, CLI and instructions; the live preview already shows the render to the user.
- **Auto-run the check from `register_open_design_artifact`?** No. Registration stays cheap and browser-free; the check-before-done instruction (D6) makes the check a habit instead.
