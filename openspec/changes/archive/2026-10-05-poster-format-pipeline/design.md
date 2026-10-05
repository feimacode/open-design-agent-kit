## Context

Posters currently go through the social-post flow: a hand-written table of sizes in `packages/content/local/prompts/social-post.md`, `prepare_open_design_brief` with a recipe such as `poster-hero`, and `export_open_design_artifact` with `width`/`height`/`selector`/`maxBytes` copied out of that table. The relevant pieces:

- `export/exportArtifact.ts` already runs a headless browser against a private static server that can transform the served entry (`transformEntry`, used today for the `<deck-stage>` fallback). It also crops images per element (`[data-od-card]`), fits files to a byte budget, and records exports in the manifest.
- `export/deck/captureDeck.ts` `capturePagePdf` prints in `print` media at either A4 or an explicit pixel size, with zero margins and `preferCSSPageSize`.
- `pdf-lib` is already a dependency (deck PDF assembly). JSZip-based XLSX parsing already exists in `vendored/documentExtract.ts`.
- Collections are implicit: artifacts whose manifests share a `collectionId` (`workspace/collectionScan.ts`). There is no registry.
- Project principles: tools return instructions and never write the design itself. The only tool-written files are manifests, copied examples and export outputs. There is no daemon, no API keys, and we use host-native mechanisms.

## Goals / Non-Goals

**Goals:**
- One source of truth for canvas formats, used by brief preparation, export, adaptation and the workflow prompts.
- Print-shop-ready PDFs (paper size, bleed, trim and bleed boxes, optional crop marks) from the same HTML.
- Resize-by-recomposition and spreadsheet-driven bulk output, with no new generation infrastructure.
- Deterministic quality checks the agent can act on, run in the browser we already launch.
- Real, verified QR codes, generated offline.

**Non-Goals:**
- Image generation or stock imagery (the daemon placeholder stays as it is).
- CMYK or PDF/X output. Chrome only prints RGB, and we say so in the result.
- A free-positioning canvas editor, or changes to the VS Code WYSIWYG editor.
- Pushing to Canva or other destinations. New genre recipes.

## Decisions

### D1. Format catalog as code in core, not content

`packages/core/src/poster/formats.ts` exports `FORMATS: Record<FormatId, CanvasFormat>`:

```ts
interface CanvasFormat {
  id: string;                    // 'ig-portrait', 'a3', 'poster-24x36' …
  label: string;
  medium: 'screen' | 'print';
  width: number; height: number; // CSS px for screen; mm for print (trim size)
  unit: 'px' | 'mm';
  safeInset: number;             // same unit
  bleed?: number;                // mm, print only (default 3; 0.125in ≈ 3.175 for US sizes)
  minTypePt?: number;            // print: smallest readable body size at typical viewing distance
  maxBytes?: number;             // screen: platform upload limit
  multiCard?: boolean;           // carousel-style formats
  skillHint?: string;            // default recipe, e.g. od:prototype:poster-hero
}
```

The ids are stable and kebab-case. Social rows reproduce today's table exactly, so the social-post prompt can switch to presets with no change in behavior.

*Alternative:* store it as content (`curated.json`-style). Rejected because export and preflight need it at runtime, typed, and it isn't upstream content.

### D2. A `format` argument on `prepare_open_design_brief`, not a new tool

`composeInstructions` appends a **Canvas** section when `format` is given:
- Exact dimensions and units, and the `data-od-card` contract (one fixed-size element, `overflow: hidden`).
- The safe inset. For print, units are `mm`, and the card is authored at the **bleed box** (trim + 2×bleed). Full-bleed backgrounds fill the card; text and logos stay inside trim − safe inset.
- Minimum type size and the field and QR attribute conventions (`data-od-field`, `data-od-qr`).

Any skill works with any format; `skillHint` is only a default. *Alternative:* a separate poster tool. Rejected because it would duplicate brief composition and grow the tool list.

### D3. `preset` on export resolves to existing arguments

`preset: FormatId` expands to `width`/`height`/`selector: "[data-od-card]"`/`maxBytes` for screen formats, and to the print path for print formats with `format: "pdf"`. Explicit arguments still override the preset. In size resolution the preset becomes step 1.5: after explicit size, before the skill aspect hint. The manifest records `metadata.format` at registration when the brief used one, and export falls back to it when no preset is passed.

### D4. Print PDF: author at the bleed box, mark boxes with pdf-lib

The exporter loads the page at the card's CSS size and checks that the `[data-od-card]` box matches the bleed box within 1 mm, flagging a mismatch as a preflight error. It keeps `screen` media emulation, so what prints is what the preview showed, unlike today's `capturePagePdf` page path. It then prints with `page.pdf({ width: '<bleed W>mm', height: '<bleed H>mm', printBackground: true, preferCSSPageSize: false, pageRanges: '1' })`, using a print stylesheet injected through `transformEntry` that isolates the card at the page origin. The PDF is post-processed with pdf-lib:
- It sets `BleedBox` to the full page and `TrimBox` inset by the bleed.
- With `cropMarks: true`, it enlarges the `MediaBox` by a slug (about 10 mm) and draws hairline registration-black marks at the trim corners outside the bleed.

Text stays vector. *Alternatives:* (a) the exporter grows the card's background outward. Rejected because it is unreliable with absolutely positioned children and images. (b) Rasterize to PNG and wrap it in a PDF. Rejected because it loses vector text, which print shops and Canva import both want.

Image resolution check: for each `<img>` and CSS `background-image` in the card, effective ppi = natural px ÷ (rendered mm ÷ 25.4). Below 150 is a warning and below 100 an error, both reported through preflight.

### D5. Bulk export binds data in the served page only

`data: <workspace path>` (CSV, XLSX first sheet or a named `sheet`, or a JSON array of objects) plus an optional `nameField`. For each row, the exporter runs a page script that:
- sets `textContent` of `[data-od-field=col]` (or `src` on `img`, `href` on `a`);
- renders a QR SVG into `[data-od-qr-field=col]`;
- waits for fonts and images, then captures.

The page loads once, then each row is bound, settled and captured. The DOM is restored between rows by re-applying the original snapshot of the bound nodes.
- **Images:** files are named `<base>-<slug(nameField) or NN>.<ext>`, with duplicate slugs disambiguated.
- **Print:** one multi-page PDF (pages merged with pdf-lib) by default, or `split: true` for one file per row.

Validation before the browser launches:
- Every `data-od-field` in the HTML must exist as a column, and every column used must exist. Unused columns produce a warning.
- The row limit is 200 per call; above it the export fails with a message to split the data.
- Preflight runs per row, and findings carry the row index. Long names overflowing is the classic bulk failure.

XLSX rows: add an exported `readSpreadsheetRows(buffer, sheet?)` to `vendored/documentExtract.ts` that reuses `readWorkbook`/`worksheetRows`/`readSharedStrings`, and record the extension in `vendored/SOURCE.md`. CSV uses a small RFC 4180 parser in `poster/data.ts`, so no new dependency.

*Alternative:* write N HTML files to disk. Rejected because it clutters the repo and breaks "the design is one file".

### D6. Preflight as one page script returning structured findings

`poster/preflight.ts` exports `runPreflight(page, { format?, cardSelector })` returning `Finding[]`, where `{ check, severity: 'error'|'warning'|'info', message, selector?, card?, row? }`. Checks:

| check | Method |
|---|---|
| `overflow` | text elements whose `scrollWidth/Height` exceeds `clientWidth/Height` with `overflow` hidden or clipped; text nodes whose range rects fall outside the card |
| `safe-area` | text, `img` and `svg` boxes outside the card's rect inset by safe inset (plus bleed for print); full-bleed backgrounds are exempt |
| `bleed-size` | print: the card box doesn't match the bleed box (D4) |
| `min-type` | print: computed `font-size` converted to pt at the printed scale below `minTypePt`; screen: below 14 px at a ≤1080 px width |
| `contrast` | WCAG ratio of text color against the nearest ancestor with a solid background; skipped with an `info` when the background is a gradient or image |
| `emoji` | text containing Extended_Pictographic characters (risk of empty boxes on machines without an emoji font) |
| `image-ppi` | print, D4 |
| `qr` | each `[data-od-qr]`: screenshot the element, decode with `jsqr`, compare to the attribute value |
| `broken-asset` | promote existing failed-load warnings into findings |
| `overlap` | per-line text rects of unrelated elements intersecting in their middle band (rects span the font's full ascent/descent, so the outer 20% top and bottom is ignored). Added after the end-to-end run showed long bound titles running into the date line |
| `card-size` | screen formats: each card's box against the format's px size. A preview wrapper (padding, a centring flex body) can squeeze a card; screen-preset exports also lay out in a roomier viewport for this reason |

Print exports isolate the card (hide everything around it) before preflight, so a preview wrapper can't distort what is measured. Identical `info` notes on every row of a bulk export are printed once, with the row numbers.

Preflight runs automatically on page-mode exports (image and page PDF) and never blocks the export. Errors are listed first in `formatExportResult`. `checkOnly: true` runs preflight without writing files, for fast fix loops. Decks are excluded in this slice.

*Alternative:* a separate `check_open_design_artifact` tool. Rejected because it adds another browser launch and another tool; `checkOnly` gets the same result.

### D7. QR codes: tool writes a supporting SVG

`create_open_design_qr_code({ entryPath, text, name?, errorCorrection? = 'M', margin? = 4 })` generates with `qrcode` (`toString(…, { type: 'svg' })`). It writes `<artifact-dir>/assets/<name>.svg`, adds it to the manifest's `supportingFiles`, and returns the relative path plus inline markup with `data-od-qr="<text>"` so preflight can verify it. Error correction defaults to M; the tool suggests H when a logo will be overlaid. Writing an asset file is a new category of tool-written file. It is acceptable because the QR code is deterministic generated data, not design, and the spec states this.

### D8. Adaptation is instructions-only and reuses collections

`adapt_open_design_artifact({ entryPath, formats: FormatId[] (1–6), notes? })`:
- reads the master (registered, HTML);
- gives the master a `collectionId` if it lacks one (manifest write, `screenRole: 'master'`);
- returns per format `{ formatId, suggestedEntryPath: <dir>/<base>-<formatId>.html, instructions, registerArgs }`.

Each format's instructions contain:
- the master HTML;
- that format's Canvas section (D2);
- recomposition rules: keep the copy hierarchy and brand tokens, re-flow rather than scale, a content-priority order for dropping secondary elements on small or extreme-aspect formats, print conversion to mm and bleed, and carrying over `data-od-field`/`data-od-qr` attributes unchanged so bulk export works on every size;
- a closing reminder to register with the same `collectionId`, `screenRole: formatId` and `metadata.format`.

Hosts that support subagents are told they may run the formats in parallel, matching the exploration flow.

### D9. Workflow prompt as local content

`packages/content/local/prompts/poster.md` follows the `social-post.md` shape, with a `model_trigger` for poster, flyer and print requests. Content sync generates it into every host the usual way. The social-post table moves to `preset` ids.

## Risks / Trade-offs

- [Chrome's print-to-PDF can shift layout compared with screen (fonts, `vh` units)] → Print formats require `mm`/`px` card sizing with no viewport units (stated in the Canvas section). The print path uses `emulateMediaType('screen')` plus explicit page size, so the screen layout is what prints.
- [Contrast check is partial] → Report `info` for skipped elements rather than a silent pass. Don't claim WCAG compliance.
- [Bulk binding can break layouts the designer never saw (long names)] → Per-row preflight. The Canvas section tells authors to use `text-wrap: balance` and fit-to-box rules on bound fields. The result lists overflowing rows by name.
- [RGB-only print output surprises a print shop] → Every print result carries a note: RGB (sRGB), convert with the printer's RIP or a PDF/X tool if CMYK is required.
- [Tool surface grows by two] → Both are narrow. Everything else is arguments on existing tools.
- [`jsqr` decode on small or stylized QR codes may give false negatives] → Decode at scale 2. On failure, report a `warning` with "may still scan; quiet zone or contrast is the usual cause".

## Migration Plan

Additive only. Existing export calls behave the same: no preset means the old size resolution, and preflight only adds a section to the result. The social-post prompt's switch to presets is a content change validated by the existing sync-parity check. Rollback is reverting the change; no data migration is needed.

## Open Questions

- Default bleed for US paper sizes: 0.125 in (3.175 mm), or 3 mm everywhere? Leaning towards each format's own convention.
- Should `adapt_open_design_artifact` also accept a non-registered HTML file? Currently no; register it first, as export already requires.
