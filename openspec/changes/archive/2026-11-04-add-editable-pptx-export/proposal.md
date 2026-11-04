## Why

Decks export to PowerPoint as one full-slide picture per slide. It looks exactly like the deck, but nothing on the slides can be changed. In a test in VS Code (2026-11-04), the agent told the user the kit couldn't make an editable PowerPoint and offered to write a python-pptx script instead. After a few rounds the script rebuilt the 21 slides as real text boxes, shapes and pictures, and the result was good. People hand decks to colleagues who edit them in PowerPoint, Keynote or Google Slides, so an editable file is often the one they actually need.

We planned for this. The 2026-09-25 deck-pptx-pdf-export change kept capture and assembly separate "so a future editable-PPTX pass can reuse everything up to `pinDeckStage`", and `pptxgenjs` already ships in core, the mcpb and the hosted gateway. The script shows the approach works on our decks: read the browser's own layout, then place native PowerPoint objects at those positions.

## What Changes

- **`export_open_design_artifact` gains `editable: true` for `format: "pptx"`**, in the VS Code tool, the MCP tool, the hosted gateway and the CLI (`export --format pptx --editable`). The picture export stays the default. The editable file is written as `<entry>-editable.pptx`, so it never overwrites the picture version.
- **Native objects from the browser's layout.** Using the existing deck preparation, each slide is shown and read in the page:
  - text blocks become text boxes with their runs (font, size, bold, italic, colour, letter spacing, line breaks, alignment, line height, uppercase applied);
  - boxes with a solid fill, a uniform border or a side border become rectangles or rounded rectangles;
  - `<img>` and CSS background images become pictures, cropped for `object-fit` and `cover`;
  - the slide's solid background becomes the slide background;
  - speaker notes are kept as today.
- **Everything else goes onto a background picture, not dropped.** Gradients, shadows, pseudo-elements, SVG diagrams, canvas, filters, transforms and partial opacity are captured as one per-slide background picture, taken with the native text, shapes and pictures hidden. Editable objects sit on top. Slides look like the deck even where PowerPoint can't express the effect, and the deck-specific fixes in the script (a hard-coded red frame bar) aren't needed.
- **An honest report.** The result lists, per slide, how many text boxes, shapes and pictures were made and what was flattened ("slide 4: SVG diagram on the background picture"). It also lists the fonts PowerPoint will need. These fonts aren't embedded, so a viewer without them sees a substitute.
- **Nothing is lost.** Every visible text on a slide is either an editable text box or reported as flattened (SVG or canvas text). The tests check this on the vendored deck examples.
- **Canva gets editable decks.** `publish_open_design_artifact_to_canva` exports decks with `editable: true`, so Canva's import gives editable text instead of one picture per page. If the editable export fails, it falls back to the picture export.
- **Guidance.** The overview and deck skills offer both versions ("looks exact" vs "editable, close to the deck"), so an agent stops telling users editable slides are impossible.
- **Out of scope:** native PowerPoint tables and charts (tables come out as boxes and text), SVG diagrams as editable shapes, embedding fonts, animations and transitions, and exporting into a customer's own `.potx` slide master. The slide data is kept separate from the PowerPoint writer so a template writer can be added later (see design).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `deck-export`: adds editable PPTX export (native text, shapes and pictures, the background picture, the report and the text coverage rule). The provenance requirement now says editable mode is our own code, not upstream's `dom-to-pptx`.
- `canva-publishing`: decks are exported as editable PPTX for Canva, with the picture export as a fallback.

## Impact

- **packages/core**:
  - `export/deck/pageScripts.ts` gains a self-contained `readSlideScene` and `hideSceneObjects`/`restoreSceneObjects`;
  - new `export/deck/slideScene.ts` (the plain slide data types) and `export/deck/assembleEditable.ts` (the pptxgenjs writer);
  - `captureDeck.ts` gains an editable loop after `pinDeckStage`;
  - `exportArtifact.ts` routes `editable`;
  - `vendored/SOURCE.md` is updated.
- **packages/vscode, packages/mcp-server, packages/mcp-gateway**: schema and description of `export_open_design_artifact` gain `editable`; the Canva instructions change.
- **packages/cli**: `export --editable`.
- **Skills**: the overview skill, the deck skills and `open-design-deck-from-source` (regenerated for Codex and CLI).
- **Dependencies**: none new (`pptxgenjs`, `jszip` and `puppeteer-core` are already in core). No Python.
- **Docs**: READMEs, `reference/tools.md`, CHANGELOG.
