## Why

`poster-format-pipeline` fixes a poster's physical size when it is generated. Every other shape then needs `adapt_open_design_artifact`, which means a fresh generation per shape. Canva works the other way round: you design once and pick the size when you order the print. An experiment rendered one self-resizing poster (all sizes relative to the poster, plus two layout rules) at all nine catalog shapes, changing only two CSS variables. Every print portrait shape, Instagram 4:5, square and X 16:9 came out right with no edits; Story 9:16 needed one more layout rule. So the shape can be chosen when exporting, instantly and without AI, as long as the design is built to resize.


## What Changes

- **Fluid canvas contract.** A poster can be authored as *fluid*: one `[data-od-card data-od-fluid]` element whose size comes from `--od-w`/`--od-h`, laid out in container query units, with layout rules for wide and tall shapes and a `--od-bleed` inset. The brief's Canvas section teaches this contract. The poster workflow always uses it; print formats use it by default; screen formats keep the fixed contract unless asked.
- **Shape at export.** Exporting a fluid design with any `preset` reflows it in the rendered page by setting the variables (the file is not changed), then runs preflight at that shape. `presets: [...]` exports several shapes in one call. For a print shape, the bleed is added at export, so fluid print designs are authored at trim size. Fixed designs behave exactly as today (not breaking).
- **Shape sheet.** `shapeSheet: true` writes one image showing the design at every requested shape (default: all catalog formats), with each shape's preflight result marked, so the user can see at a glance which shapes need work.
- **Default shape.** `metadata.format` becomes the design's *default* shape for fluid designs rather than a lock. It is used when no preset is given, and the preview opens at it.
- **Shape switcher in the VS Code preview.** For fluid designs, a toolbar dropdown resizes the design live, a "Check this shape" button runs preflight for it, and "Use as default shape" records it.
- **New preflight check `fixed-size`.** For fluid designs, preflight renders a second, larger size and reports text and boxes that didn't scale with the poster. That catches authors who mixed in px or mm sizes.
- **Adaptation for fluid masters edits in place.** For a fluid master, `adapt_open_design_artifact` returns instructions to add or adjust layout rules for each requested shape inside the master itself, instead of writing a new file. Fixed masters keep the current one-file-per-format behavior.
- **Bulk × shapes.** `data` combined with `presets` gives one file per row per shape, named `<base>-<row>-<format>`.

## Capabilities

### New Capabilities
- `fluid-canvas`: the fluid authoring contract, how a design declares it, the brief's fluid Canvas section and when it applies, bleed added at export, and the `fixed-size` check.
- `shape-switching`: exporting a fluid design at any catalog shape, multi-shape export, the shape sheet, the default shape, and the VS Code preview switcher.

### Modified Capabilities
- `poster-formats`: the Canvas section has a fluid variant, and the recorded format is the default shape for fluid designs.
- `print-export`: the card must match the bleed box only for fixed designs; fluid designs get their bleed at export.
- `artifact-export`: size resolution reflows fluid designs to the preset's shape instead of requiring the card to already be that size.
- `artifact-adaptation`: fluid masters are tuned in place with layout rules; fixed masters still get one new file per format.
- `bulk-export`: output naming when rows and several shapes are combined.
- `poster-workflow`: the flow becomes generate once (fluid), check, then pick shapes at export; adaptation is the fallback.

## Impact

- **Core:** `poster/formats.ts` (fluid Canvas section), `poster/pageScripts.ts` (apply shape, measure the fixed-size check), `poster/preflight.ts`, `export/exportArtifact.ts` (fluid reflow, `presets`, `shapeSheet`, bleed at export), `export/exportSize.ts`, `generation/adaptInstructions.ts`. A new `poster/shapeSheet.ts` composes the shape sheet in the same browser session as the export.
- **Tools:** `prepare_open_design_brief` gains `fluid`. `export_open_design_artifact` gains `presets` and `shapeSheet`. The schemas change in the MCP server, the VS Code `package.json` and the CLI (`--presets`, `--shape-sheet`).
- **VS Code:** artifact preview toolbar and webview (shape dropdown, check button, default-shape action), and `artifactEditorProvider.ts` messages.
- **Content:** `poster.md` and the chat and overview-skill instructions. Social-post recipes stay fixed.
- **Docs:** `guides/posters.md` (a new "Change the shape" section), the tools and CLI reference, and `metadata.format` wording.
- **No new dependencies.**
