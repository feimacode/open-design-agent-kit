## 1. Format catalog

- [x] 1.1 Create `packages/core/src/poster/formats.ts` with `CanvasFormat`, `FORMATS` (social rows identical to today's social-post table; print A4–A0, Letter, Tabloid, 18×24 in, 24×36 in with bleed, safe inset, `minTypePt`), `getFormat(id)` and `bleedBox(format, bleed?)`
- [x] 1.2 Add `unknownFormatError(id)` listing valid ids; export the module from `packages/core/src/index.ts`
- [x] 1.3 Unit tests: social rows match the social-post table sizes and budgets; A3 bleed box is 303×426 mm; unknown id lists the valid ids

## 2. Brief preparation and registration take a format

- [x] 2.1 Add `composeCanvasSection(format)` (screen and print variants per the poster-formats spec) and append it in `composeInstructions.ts` when `format` is given; echo `format` in the result
- [x] 2.2 Add `format` to `prepare_open_design_brief` in the MCP server and the VS Code tool (schema, description listing the ids, `package.json` `languageModelTools` entry)
- [x] 2.3 Add `format` to `register_open_design_artifact` (MCP and VS Code); store it as manifest `metadata.format`
- [x] 2.4 Unit tests: A3 canvas section text (bleed box, trim, safe inset, min type, no viewport units); a screen section has no bleed; no format means instructions are unchanged

## 3. Export preset and size resolution

- [x] 3.1 Extend `resolveExportSize` with the preset / `metadata.format` step and a `'preset'` `SizeSource`
- [x] 3.2 In `exportArtifact`, expand a screen preset into selector and `maxBytes` defaults (explicit arguments win) and send print presets with `format: "pdf"` to the print path
- [x] 3.3 Add `preset` to the MCP and VS Code export tool schemas and `--preset` to the CLI `export` command
- [x] 3.4 Unit tests: the size-resolution order (explicit > preset > recorded format > skill hint > element > default) and preset defaults being overridden by explicit arguments

## 4. Print PDF

- [x] 4.1 Add `poster/printPdf.ts`: an injected print stylesheet that isolates `[data-od-card]` at the origin; `page.pdf` at the bleed box in mm with screen media
- [x] 4.2 Post-process with pdf-lib: set `TrimBox`/`BleedBox`; with `cropMarks`, enlarge the `MediaBox` by a slug and draw corner marks outside the bleed
- [x] 4.3 Add `bleed` and `cropMarks` options (MCP, VS Code, CLI `--bleed`, `--crop-marks`); add the RGB note to the formatted result for print exports
- [x] 4.4 Measure the card against the bleed box (1 mm tolerance) and emit a `bleed-size` finding
- [x] 4.5 Tests: page size and boxes for A3 with 3 mm bleed, zero bleed, and crop marks (box geometry read back with pdf-lib); vector text present (an extractable text operator)

## 5. Preflight

- [x] 5.1 Add `poster/preflight.ts` with the `Finding` type and a page script for `overflow`, `safe-area`, `min-type`, `contrast` (solid backgrounds only, otherwise `info`), `emoji` and `image-ppi`
- [x] 5.2 Add the `qr` check: screenshot each `[data-od-qr]` at scale 2 and decode with `jsqr`; promote failed-load warnings into `broken-asset` findings
- [x] 5.3 Run preflight in page-mode exports and add `findings` to `ExportArtifactResult`; `formatExportResult` lists errors, then warnings, then info, or a single "preflight passed" line
- [x] 5.4 Add `checkOnly` (MCP, VS Code, CLI `--check`): load and preflight with no writes and no manifest update
- [x] 5.5 Fixture tests in the browser: a clipped headline, text outside the safe area, 8 pt text on A2, low contrast on solid vs. gradient, an emoji, a 76 ppi image on A2, a wrong-URL QR code, and a clean poster with no findings

## 6. QR codes

- [x] 6.1 Add the `qrcode` and `jsqr` dependencies to `packages/core/package.json`; check that the VS Code bundle and the MCP package build includes them
- [x] 6.2 Add `poster/qr.ts`: `qrSvg(text, { errorCorrection, margin })` returning SVG markup with `data-od-qr`
- [x] 6.3 Add the `create_open_design_qr_code` tool in core plus MCP and VS Code wrappers: write `assets/<name>.svg`, append it to the manifest's `supportingFiles`, return the path, inline markup and the H-level advice
- [x] 6.4 Tests: the generated SVG decodes to its text (round trip through a rendered screenshot); the manifest's supporting files are updated; unregistered artifacts are rejected

## 7. Bulk export

- [x] 7.1 Add `readSpreadsheetRows(buffer, sheet?)` to `vendored/documentExtract.ts` reusing the workbook and shared-string parsing; record it in `vendored/SOURCE.md`
- [x] 7.2 Add `poster/data.ts`: an RFC 4180 CSV parser, JSON-array and XLSX loaders, header normalization, and `slugify` with duplicate disambiguation
- [x] 7.3 Pre-browser validation: scan the HTML for `data-od-field` / `data-od-qr-field`; fail on missing columns (listing columns), warn on unused columns, enforce the 200-row limit, report empty cells
- [x] 7.4 Bind each row in the served page (text, `img` `src`, `a` `href`, QR SVG plus `data-od-qr`), restore the original nodes between rows, wait for images and fonts, capture, and run preflight per row
- [x] 7.5 Outputs: images named by the `nameField` slug or `NN`; PDF pages merged into one multi-page file with pdf-lib, or `split: true` for one file per row; manifest export records per file
- [x] 7.6 Add `data`, `sheet`, `nameField` and `split` (MCP, VS Code, CLI `--data`, `--sheet`, `--name-field`, `--split`)
- [x] 7.7 Tests: a 3-row CSV gives 3 named PNGs with the HTML unchanged; duplicate slugs; a missing-column error; a 40-row PDF is one 40-page file; a per-row overflow finding names its row; a per-row QR decodes to that row's value

## 8. Adaptation tool

- [x] 8.1 Add `generation/adaptInstructions.ts`: validate the registered master, assign or reuse its `collectionId` (writing `screenRole: "master"` only when assigning), and compose per-format instructions (master HTML, Canvas section, recomposition rules, priority order, field carry-over, register arguments)
- [x] 8.2 Add `adapt_open_design_artifact` to MCP and VS Code (schema with 1–6 format ids and optional notes)
- [x] 8.3 Tests: three formats give three entries with the right paths and register arguments; an existing collection is reused without a manifest write; an unregistered master errors; the collection scan sees master plus adaptations

## 9. Workflow content

- [x] 9.1 Write `packages/content/local/prompts/poster.md` (frontmatter with `model_trigger` for poster, flyer and print requests; the 9-step flow from the poster-workflow spec; format table generated from or matching the catalog)
- [x] 9.2 Switch `social-post.md` to `preset` ids with unchanged sizes and budgets; update the VS Code chat instructions to route poster requests to `/open-design-poster`
- [x] 9.3 Run content sync; check that the Claude plugin skill, Codex skill, `init` assets and MCP prompt are generated, and that the sync-parity check passes

## 10. Hosts, docs and verification

- [x] 10.1 Update the MCP tool-count and schema tests and the VS Code `registerTools.ts` / `package.json` contributions for the two new tools
- [x] 10.2 Write `docs/guides/posters.md` (print vs. screen, bleed, QR, adapt, bulk, preflight, the RGB caveat); update `docs/reference/tools.md`, `cli.md` and `artifact-manifest.md` (`metadata.format`, the `exports` records), `social-posts.md` (presets) and the guides index
- [x] 10.3 Run `typecheck`, the unit tests and the docs reference-completeness and link checks across packages
- [x] 10.4 End-to-end smoke test in a scratch workspace: an A3 poster with a QR code, then preflight clean, adapt to `ig-portrait` and `story`, bulk-export the A3 from a 5-row CSV to one PDF, and inspect the outputs by eye
