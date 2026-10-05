## Why

Posters are one of the most common design requests, but today we handle them as one-off social images. Every new size means generating from scratch, there is no print output (no paper sizes, bleed or crop marks), nothing checks the result before it ships, and the QR code most posters need is a placeholder. Canva's lead on posters comes mostly from reuse: Magic Resize, Bulk Create and print-ready PDFs. All three are cheap for us because our posters are HTML: real text, real layers, files in the repo, and a headless browser we already drive. They also need no new credentials, which fits the project's no-extra-keys principle. Imagery (image generation or stock photos) is deliberately left out of this slice and will be a separate decision.

## What Changes

- **Format catalog.** A single list of named canvas formats: social (X image, Instagram square and portrait, Story, Xiaohongshu, LinkedIn, YouTube thumbnail) and print (A4–A0, US Letter, Tabloid, 18×24 in, 24×36 in). Each format has a size, units, safe area, bleed default, minimum type size and byte budget.
- **`prepare_open_design_brief` takes a `format`.** The instructions gain a "Canvas" section with the exact size, units, safe area, bleed contract and `data-od-card` rules for that format, so any skill can produce a poster at a print or social size.
- **`export_open_design_artifact` takes a `preset`** (a format id). It fills in size, selector, byte budget and, for print formats, print settings, so the agent stops hand-copying numbers from a table.
- **Print PDF export.** For a print format, the PDF page matches the paper size plus bleed. PDF TrimBox and BleedBox are set, crop marks are optional, and the effective resolution of every raster image is checked. Output stays RGB; the result says so.
- **New tool `adapt_open_design_artifact`.** It takes a finished poster and a list of target formats and returns per-format instructions to *re-compose* it (not scale it) for each size. The master and its adaptations are grouped as a collection.
- **Bulk export from data.** `export_open_design_artifact` takes a `data` source (CSV, XLSX or JSON). Elements marked `data-od-field="column"` are filled per row in the served page (never on disk), and the export writes one image per row, or one multi-page PDF for print.
- **Preflight checks on every page export.** Deterministic checks in the export browser: text overflow and clipping, safe-area and bleed violations, type below the format's minimum size, low contrast on solid backgrounds, emoji that may render as empty boxes, low-resolution images for print, and QR codes that don't decode. Findings come back as structured `checks` so the agent can fix and re-export.
- **New tool `create_open_design_qr_code`.** It writes an offline-generated SVG QR code into the artifact's folder and returns the inline markup. Bulk export can also generate a QR code per row (`data-od-qr-field`).
- **New `open-design-poster` workflow** in every host (VS Code prompt, MCP prompt, Claude plugin skill and Codex skill). Steps: ask print or screen and which format; optionally explore directions; generate with `format`; add a QR code; preflight; adapt; bulk; export with a preset; report.

## Capabilities

### New Capabilities
- `poster-formats`: the named canvas-format catalog, the `format` argument to brief preparation, and how formats resolve into canvas instructions.
- `print-export`: print-ready PDF for print formats (bleed, trim and bleed boxes, crop marks, image resolution check, RGB disclosure).
- `artifact-adaptation`: the `adapt_open_design_artifact` tool, which re-composes a master design into other formats as one collection.
- `bulk-export`: data-bound export, filling `data-od-field` elements per row from CSV, XLSX or JSON into one file per row or one multi-page PDF.
- `export-preflight`: deterministic checks run during page exports and reported as structured findings.
- `qr-codes`: the `create_open_design_qr_code` tool and per-row QR generation during bulk export.
- `poster-workflow`: the `open-design-poster` entry point in every host and the end-to-end flow it directs.

### Modified Capabilities
- `artifact-export`: export size resolution gains a `preset` step ahead of the skill's aspect hint. Page-mode exports now include preflight findings in their result.
- `open-design-tools`: brief preparation accepts an optional `format` that adds a canvas section to the instructions (it still writes no files).

## Impact

- **Core (`packages/core`):** new `poster/` module (format catalog, adaptation instructions, data binding, preflight page script, QR); changes to `export/exportArtifact.ts`, `export/exportSize.ts`, `export/deck/captureDeck.ts` (`capturePagePdf`) and `generation/composeInstructions.ts`.
- **Hosts:** two new tools (`adapt_open_design_artifact`, `create_open_design_qr_code`) registered in the MCP server and VS Code `languageModelTools`, plus new arguments on two existing tools. MCP tool-count tests need updating. CLI `export` gains `--preset` and `--data`.
- **Content:** new local prompt `packages/content/local/prompts/poster.md`, generated into the Claude plugin, Codex and `init` assets. The social-post prompt's table switches to presets; its behavior is unchanged.
- **Dependencies:** `qrcode` (MIT) for generation and `jsqr` (Apache-2.0) for decoding, both pure JS with no native code. XLSX parsing reuses the existing document-extraction code.
- **Docs:** new guide `docs/guides/posters.md`, and reference updates for the tools, the CLI and the manifest's `metadata.exports`. The docs reference-completeness check will enforce these.
- **Out of scope:** image generation or stock imagery, CMYK/PDF/X conversion, a free-position canvas editor, Canva push via Canva's MCP, new genre recipes.
