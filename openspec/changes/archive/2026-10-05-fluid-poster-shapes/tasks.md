## 1. Fluid contract and briefs

- [x] 1.1 Add `composeFluidCanvasSection(format)` to `poster/formats.ts`: the D1 skeleton with the format as `--od-w`/`--od-h`, the wide (`> 1.2`) and tall (`< 0.6`) bands, `data-od-priority` and `object-position` conventions, the min-type guidance (`max(…pt, …cqmin)`), "author at trim size; export adds bleed", and the shared field/QR/checkOnly text
- [x] 1.2 Add `fluid` to `ComposeInstructionsInput` and `prepare_open_design_brief` (MCP, VS Code schema and tool): default `true` for print formats and `false` for screen; `fluid: true` without `format` defaults to A3; echo `fluid` in the result
- [x] 1.3 `isFluidHtml(html)` helper (card element carrying `data-od-fluid`); registration records `metadata.fluid: true` (MCP and VS Code)
- [x] 1.4 Unit tests: fluid A2 section (`--od-w: 420mm`, no bleed in card, bands, priority), screen default stays fixed, `fluid: true` story, fluid with no format, `isFluidHtml` positives and negatives

## 2. Applying shapes at export

- [x] 2.1 Page script `applyShape(cardSelector, { widthCss, heightCss, bleedCss })`: set the variables, wait two frames, return `{ fluid, box }`; add it to the self-containment test
- [x] 2.2 In `exportArtifact`, detect a fluid card after load; for a fluid card, apply the shape from explicit size, `preset` or recorded format (screen in px with bleed 0, print in mm with bleed) before preflight; report "reflowed" in the size detail
- [x] 2.3 Skip `bleed-size` for fluid cards; for fixed cards whose card-size or bleed-size check fails against a preset, add the "fixed-size design; use adapt_open_design_artifact" hint
- [x] 2.4 Browser tests: a fluid A3 exported as A3 (page 303×426 mm, trim 297×420, no bleed-size), as `poster-24x36` (page size, HTML unchanged) and as `x-image` (1600×900 PNG, wide rule applied: check an element's position), explicit width/height on a fluid card, and a fixed card plus a different preset giving the hint

## 3. fixed-size check

- [x] 3.1 Page script that records font sizes and box widths of text elements, `img` and `svg` in the card; `runPreflight` for fluid cards applies 1.5× the shape, re-measures, reports growth below 1.3× as `fixed-size` (ignoring hairline borders), and restores the shape
- [x] 3.2 Browser tests: a headline in px flagged; a fully cq-sized poster clean; the card restored (the capture size is unchanged after the check)

## 4. Several shapes and the shape sheet

- [x] 4.1 `presets` option (1–15 ids; not with `preset`, `width` or `height`; fluid only, else invalid-args pointing to adaptation): loop apply → preflight → capture; names `<base>-<formatId>`; PDF for print shapes and PNG for screen shapes unless `format` is given; findings tagged with `shape`
- [x] 4.2 `Finding.shape` field; `formatPreflight` groups by shape, then by row
- [x] 4.3 `poster/shapeSheet.ts`: capture each shape at a thumbnail scale, compose a labelled sheet with an error marker per shape in the same browser, write `exports/<base>-shapes.png`; default to all catalog formats; works with `checkOnly` (the only file written, no manifest change); fluid only
- [x] 4.4 Combine with `data`: rows × shapes naming `<base>-<rowSuffix>-<formatId>`, print merged per shape (or split), 400-output cap checked before launching a browser
- [x] 4.5 Schemas: `presets` and `shapeSheet` in MCP, VS Code and the export tool interfaces; CLI `--presets a3,story` and `--shape-sheet`, with parse tests
- [x] 4.6 Browser tests: three shapes in one call (files and per-shape findings), a shape sheet with checkOnly (one PNG, manifest unchanged, all 15 labels by findings count), a fixed design rejected, rows × shapes naming, and the cap error

## 5. Adaptation for fluid masters

- [x] 5.1 `adaptArtifact`: for a fluid master, return `mode: "tune"` entries (instructions: check at that shape, edit that aspect band's `@container` rules in the master, re-check with a shape sheet) with no path or register arguments, and don't touch the manifest; fixed masters get `mode: "new-file"` as before
- [x] 5.2 Update `formatAdaptResult` and the tool descriptions (MCP, VS Code) to explain both modes
- [x] 5.3 Tests: a fluid master gives tune entries and an unchanged manifest; the fixed-master tests still pass with `mode: "new-file"`

## 6. VS Code shape switcher

- [x] 6.1 Provider: include `fluid` (from the HTML) and `defaultFormat` (`metadata.format`) in `init` and `source-updated`; handle `check-shape` (run core `exportArtifact` with `checkOnly` and that preset, using the configured browser path; post back the findings) and `set-default-shape` (write `metadata.format` via the manifest writer)
- [x] 6.2 Webview: Shape dropdown (default first) that sets the card variables in the preview document and fits the stage to the panel; a Check this shape button with a findings count and an expandable list; Use as default shape; for fixed designs, a note in place of the dropdown
- [x] 6.3 Keep the chosen shape across `source-updated` reloads; reset to the default when the file changes its fluid status
- [x] 6.4 Check by hand in the Extension Development Host: switch shapes on a fluid poster, check a failing shape, set the default, open a fixed design

## 7. Workflow, docs and verification

- [x] 7.1 Update `packages/content/local/prompts/poster.md` to the D9 flow (`fluid: true`, a shape sheet before other sizes or the final print, `presets`, tuning as the fallback); update the VS Code chat instructions and the overview skill; run `npm run sync-content`
- [x] 7.2 Docs: a "Change the shape" section in `guides/posters.md` (fluid designs, presets, shape sheet, switcher, when adaptation is still needed); the tools reference (`fluid`, `presets`, `shapeSheet`, adaptation modes, the `fixed-size` check); the CLI reference; `metadata.format` and `metadata.fluid` in the manifest reference
- [x] 7.3 Run typecheck, lint (including the docs check), and all unit tests; build the MCP server, VS Code and CLI bundles
- [x] 7.4 End-to-end smoke test through the MCP handlers: a fluid Hack Night poster from the brief's skeleton, then a shape sheet, tune the story band, `presets` export of A3, 24×36, ig-portrait and story, and bulk rows × two shapes; inspect the sheet and the outputs by eye
