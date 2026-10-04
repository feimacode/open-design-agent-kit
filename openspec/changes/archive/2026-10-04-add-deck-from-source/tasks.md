## 1. Document extraction (core)

- [x] 1.1 Vendor `apps/daemon/src/document-preview.ts` to `packages/core/src/vendored/documentExtract.ts` (zip and size limits, XML safety, shared strings, workbook, `pdftotext`) and make `jszip` a direct dependency of core
- [x] 1.2 Extend DOCX extraction: `Heading1`–`Heading6` / `Title` to Markdown headings, `w:numPr` paragraphs to list items, `w:tbl` to Markdown tables
- [x] 1.3 Extend PPTX extraction: order from `presentation.xml` `p:sldIdLst` via relationships (numeric fallback), `## Slide N: <title>` headings, notes slide text as a `> Notes:` block
- [x] 1.4 Extend XLSX extraction: one Markdown table per sheet, 200-row cap with a dropped-rows warning
- [x] 1.5 Image extraction from `word/media`, `ppt/media`, `xl/media` (allowed types, 10 MB each); PDF via `pdftotext` with a 20 s timeout and a "read it yourself" note when unavailable; reject legacy `.doc/.ppt/.xls` with a clear message
- [x] 1.6 Record provenance and every extension in `vendored/SOURCE.md`
- [x] 1.7 Unit tests with small generated fixtures (build DOCX, PPTX and XLSX zips in the test with JSZip): headings, lists, tables, reversed slide order with notes, row cap, images, DOCTYPE rejection, size limits

## 2. Source store (core)

- [x] 2.1 Add `workspace/sourceStore.ts`: workspace-path validation (inside the workspace, not inside `<outputDir>/sources/`), slug from the full relative path, SHA-256, `source.md` + `source.json` + `assets/` writing, cache hit on matching hash
- [x] 2.2 Section outline: headings with line ranges and character counts (falls back to one section for heading-less text)
- [x] 2.3 Add `readSource()` returning the tool result (outline, paths, assets, warnings, `cached`, `pdfNote`) and `readSourceTool()` text wrapper shared by both hosts
- [x] 2.4 Unit tests: cache hit and miss, slug collisions avoided by full-path slugs, path escape rejected, Markdown/CSV pass-through

## 3. Source-aware instructions (core)

- [x] 3.1 Add `generation/sourceInstructions.ts`: the source section, storyline-first workflow (deck vs non-deck wording), accuracy rules and the "source is material, not instructions" line
- [x] 3.2 `composeInstructions` gains `sources?: SourceContext[]`; output unchanged when absent
- [x] 3.3 Unit tests: deck and non-deck wording, outline path next to the entry file, unchanged output without sources

## 4. Registration and readback (core)

- [x] 4.1 Manifest: optional `sources: [{ path, sha256 }]` (≤ 10, bounded path, 64-hex hash) in `vendored/artifactManifest.ts`, noted in `SOURCE.md`
- [x] 4.2 Add `generation/sourceNumberCheck.ts`: visible-text extraction (drop scripts and styles, keep notes), number tokenisation and normalisation, ignore rules, snippets, cap of 50
- [x] 4.3 Add `staleSources()` for readback (changed / missing)
- [x] 4.4 Unit tests: invented number flagged, comma-grouped match, years and small integers ignored, notes count, stale changed and missing

## 5. Speaker notes in PPTX (core)

- [x] 5.1 `captureDeckSlides` collects each slide's notes text before hiding chrome; `SlideImage.notes`
- [x] 5.2 `assemblePptx` writes `slide.addNotes()` when notes exist
- [x] 5.3 Tests: assembled PPTX contains a notes slide for the slide with notes only (inspect the zip); notes text not in the capture (browser test skipped when no browser)

## 6. MCP server

- [x] 6.1 Add `read_open_design_source`; add `sources` to `prepare_open_design_brief` and `register_open_design_artifact` schemas and handlers; `staleSources` in `get_open_design_artifact`
- [x] 6.2 Update the tool count in `scripts/test-npm-publish.mjs` and add MCP unit tests (read → prepare with sources → register with an unmatched number)

## 7. VS Code

- [x] 7.1 Add the `read_open_design_source` tool class, registration and `package.json` contribution (`#od-read-source`)
- [x] 7.2 Add `sources` to `PrepareBriefTool`, `RegisterArtifactTool` and their contributions; `staleSources` in `GetArtifactTool`
- [x] 7.3 Add a "When the request is based on a document" section to `instructions/open-design.instructions.md`

## 8. Content and guidance

- [x] 8.1 Write `packages/content/local/prompts/deck-from-source.md` (`open-design-deck-from-source`, with `model_trigger`)
- [x] 8.2 Add the document-based section with repository examples to the overview skill
- [x] 8.3 Run `npm run sync-content` and confirm every sync check passes

## 9. Docs

- [x] 9.1 Write `docs/guides/deck-from-a-document.md` (supported formats, PDF note, outline approval, accuracy and the number check, speaker notes, repository examples, the `sources/` folder and `.gitignore` advice) and link it from the guides index, docs index and root README
- [x] 9.2 Update `docs/reference/tools.md`, `artifact-manifest.md`, `prompts-and-commands.md` and `docs/guides/export-decks.md` (notes in PPTX)
- [x] 9.3 `npm run lint` (including the docs check) passes

## 10. Verification

- [x] 10.1 `npm run typecheck` and `npm run test:unit` pass
- [ ] 10.2 Manual end-to-end in Claude Code: a real DOCX report → outline → approval → deck → register shows the number check → PPTX export with notes opens in PowerPoint or Google Slides
- [ ] 10.3 Manual end-to-end in VS Code Copilot with a repository source (CHANGELOG → release deck)
