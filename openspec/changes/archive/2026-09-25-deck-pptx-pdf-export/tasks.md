## 1. Honest manifest exports

- [x] 1.1 Add `png`, `jpeg` and `pptx` to the vendored `ALLOWED_EXPORTS` in `artifactManifest.ts`, and document the divergence in `vendored/SOURCE.md`
- [x] 1.2 Add `exportsForKind(kind)` to core (the table in design D8) and replace the `KIND_TO_EXPORTS` maps in `vscode/src/tools/registerArtifactTool.ts`, `mcp-server/src/tools.ts` and `vscode/src/workspace/remixOrchestrator.ts` (plus core `remixExample` if it hard-codes exports)
- [x] 1.3 Unit tests: deck registration records `html, png, jpeg, pdf, pptx`; the validator accepts the new values; existing manifests with `zip` still read fine

## 2. Deck page scripts (ported)

- [x] 2.1 Create `core/src/export/deck/selectors.ts` with upstream's selector constants, and `pageScripts.ts` with self-contained ports of `countRealSlides`, `prepareDeckStage` (plus forcing lazy images eager), `measureSlide`, `pinDeckStage`, `showSlide`, `restackActiveSlide` (with the `moveBefore` fallback), `restoreActiveSlideCapture` and `showAllSlides`, each with an upstream-origin header
- [x] 2.2 Keep DOM types out of the rest of core: page scripts declare `document`/`window`/`requestAnimationFrame` as module-scoped `any` (a triple-slash `lib="dom"` reference would be program-wide)
- [x] 2.3 Unit test: every page script's `toString()` is self-contained (no free identifiers beyond browser globals and its parameters)

## 3. Deck-stage fallback

- [x] 3.1 Port `htmlUsesDeckStageElement` / `injectDeckStageFallback` (and its helper `findRealTagOffset`/`HTML_TAG_PATTERNS`) to `core/src/export/deck/deckStageFallback.ts` with attribution
- [x] 3.2 Add an optional `transformEntry` hook to `startStaticServer`, applied only to the served entry file; inject the fallback when the deck uses `<deck-stage>` and doesn't load `deck-stage.js`
- [x] 3.3 Unit tests: injection happens only in that case; the file on disk is unchanged

## 4. Capture and assembly

- [x] 4.1 Implement `resolveExportMode()` (design D2) with the `no-slides` and `not-a-deck` errors
- [x] 4.2 Implement `captureDeckSlides(page, { slides, width, height, scale })`: count → prepare → measure/pin → per-slide show/verify/restack → clipped screenshot, returning `SlideImage[]` plus stage and warnings (blank-slide detection, restack fallback use)
- [x] 4.3 Add `pptxgenjs` and `pdf-lib` to core; port `resolvePptxConstructor`, `buildScreenshotPptx` → `assemblePptx`, `buildScreenshotPdf` → `assemblePdf`
- [x] 4.4 Implement page PDF via `emulateMediaType('print')` + `page.pdf()` (CSS `@page` size preferred, A4 default, explicit width/height override)
- [x] 4.5 Route `format: pptx|pdf`, `deck`, `slides` in `exportArtifact` (kind format check with the `deck: true` exception, scale default 2 for deck documents, `maxBytes` warning-only for documents, slide-numbered image names), record exports in the manifest, and extend `formatExportResult` with slide count and stage
- [x] 4.6 Tests: resolveExportMode unit cases; integration tests (skipped when no browser) for a class-toggled 5-slide deck → PPTX (zip contains 5 slides and 5 media), a 1024×768 deck → PDF page aspect, a carousel-strip deck → distinct slide images, slides `[1,3]` → two PNGs, an out-of-range slide error, a `<deck-stage>` deck without runtime, and a page PDF whose text is extractable
- [x] 4.7 Smoke test over ~10 vendored deck examples (`assets/open-design/examples/*` with slide markers): every export succeeds and no slide is blank (skipped when no browser)

## 5. Hosts

- [x] 5.1 VS Code: extend `export_open_design_artifact`'s schema/description (`format` enum, `deck`, `slides`) in `package.json` and `exportArtifactTool.ts`
- [x] 5.2 MCP: mirror the schema and handler in `mcp-server/src/index.ts` and `tools.ts`
- [x] 5.3 CLI: `export --format pptx|pdf`, `--deck`, `--slides 1,3`; parsing tests
- [x] 5.4 Guidance: one line in the overview skill (`claude-plugin/skills/open-design/SKILL.md`) and the VS Code chat instructions: "after registering a deck, offer PPTX/PDF export"

## 6. Verify and document

- [x] 6.1 Run sync-content generators (the overview skill is copied to Codex/CLI), then typecheck, lint and unit tests across the workspace, and `scripts/test-npm-publish.mjs`
- [x] 6.2 Manual check: remix a vendored deck example (e.g. `guizang-ppt`), export PPTX and PDF, and open the PPTX in PowerPoint/LibreOffice and the PDF in a viewer — done with `deck-guizang-editorial` (the `guizang-ppt` example isn't vendored): remixed via MCP, exported PPTX (10 slides, 2 MB) and PDF; PowerPoint (COM automation) opened the PPTX (10 slides, 16:9) and re-saved it as PDF
- [x] 6.3 Update READMEs (root, VS Code, MCP, CLI) with deck export and add a `vendored/SOURCE.md` deck-export section
