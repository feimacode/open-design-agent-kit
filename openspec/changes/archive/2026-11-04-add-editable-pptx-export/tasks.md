## 1. Slide scene and page scripts

- [x] 1.1 Add `core/src/export/deck/slideScene.ts` with `SlideScene`, `SceneText` (runs, align, line height, line count, text box, content box), `SceneBox`, `ScenePicture` and `Flattened` types, all in CSS px relative to the stage
- [x] 1.2 Port the in-page walk from the 2026-11-04 script into a self-contained `readSlideScene` in `pageScripts.ts`: text runs with a Range-measured text box, solid and bordered boxes (all four side borders), `<img>` with `object-fit`, `url()` backgrounds, the slide background, `text-transform`, and exclusion of transformed, semi-transparent, filtered, clipped, blended and gradient-filled subtrees and of `<svg>`/`<canvas>` (recorded as flattened, with their text)
- [x] 1.3 Add `hideSceneObjects` / `restoreSceneObjects` (transparent text, transparent fills and borders on recorded boxes, hidden recorded images), and record what was changed so restore is exact
- [x] 1.4 Extend the "no free identifiers" unit test to the new scripts

## 2. Writer

- [x] 2.1 Add `assembleEditable.ts`: px→inch and px→pt from the stage width, the layout rule shared with `assemblePptx`, background picture, boxes (rect / roundRect with radius adjustment, fill, line, dash), pictures with crop, text boxes (single-line no-wrap widened by 12% + 8 px and anchored by alignment, multi-line wrapped at content width, zero margins, top anchor, exact line spacing, runs with font, size, bold, italic, colour, character spacing, breaks), and notes
- [x] 2.2 Font naming: the first family in the stack, monospace stacks → Consolas; collect the font list and mark `@font-face` / Google Fonts families as web fonts
- [x] 2.3 Unit tests on hand-written scenes: unzip the result with `jszip` and check slide XML for the text, `sz`, `b`, `spc`, `wrap="none"` on single lines, shape geometry and fill, picture crop, and notes

## 3. Capture loop and routing

- [x] 3.1 In `captureDeck.ts`, add the editable loop after `pinDeckStage`: show slide → read scene → hide → screenshot background (dropped if uniform) → restore; reuse `restackActiveSlide` for carousel decks
- [x] 3.2 Coverage check: compare the slide's visible text nodes with the scene's texts and flattened list, and warn per slide on gaps
- [x] 3.3 In `exportArtifact.ts`, accept `editable` (pptx only, an `invalid-args` error otherwise), write `<entry>-editable.pptx` via `exportFilePathWithSuffix`, and add the `editable` report and a summary line to the result and `formatExportResult`

## 4. Hosts and guidance

- [x] 4.1 VS Code `package.json` and `exportArtifactTool.ts`: `editable` in the schema; description says picture vs editable
- [x] 4.2 MCP `session.ts` / `tools.ts` and the gateway's tool list: same schema and description; confirm the gateway's slow-job path passes `editable`
- [x] 4.3 CLI: `export --editable`, with parsing tests
- [x] 4.4 Canva: the deck export in `publish_open_design_artifact_to_canva` instructions uses `editable: true` with the picture fallback; update its tests
- [x] 4.5 Skills: overview, deck skills and `open-design-deck-from-source` offer both versions in one line each; run sync-content so Codex and CLI copies match

## 5. Verify and document

- [x] 5.1 Browser tests (skipped without a browser): a fixture deck with heading, paragraph with a `<br>`, a bordered card, an image with `object-fit: contain`, a gradient slide, a rotated label and an SVG diagram; check text boxes, shapes, the background picture and the flattened list
- [x] 5.2 Smoke test over the vendored deck examples: every editable export succeeds, and the text coverage holds on every slide
- [x] 5.3 Render check with LibreOffice: done by hand during development (editable vs picture export side by side for four vendored decks), not added as a test
- [x] 5.4 Manual: open editable exports in PowerPoint and edit them (done 2026-11-04 by Iven with the two sample decks; LibreOffice also rendered every test file)
- [x] 5.5 Typecheck, lint and unit tests across the workspace; `scripts/test-npm-publish.mjs`
- [x] 5.6 Update `vendored/SOURCE.md` (editable mode is our own, `dom-to-pptx` not adopted), READMEs, `reference/tools.md` and CHANGELOG
