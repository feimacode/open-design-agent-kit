## Context

Decks today come from a short brief: `prepare_open_design_brief` composes the skill, design system, craft rules and brief, and the agent writes an HTML deck (usually `<deck-stage>` slides) and registers it. Export renders slides in an installed browser and builds a screenshot PPTX (`export/deck/assemble.ts`) or PDF. Many deck templates already author speaker notes as `aside.notes` / `.speaker-notes`; export hides them (`HIDE_CHROME_SELECTOR`), and the PPTX drops them.

Upstream Open Design has a small, daemon-free text extractor for previews (`apps/daemon/src/document-preview.ts`, at upstream commit `1b47e60bd466`, Apache-2.0). It reads DOCX, PPTX and XLSX with JSZip and regexes, enforces size limits (10 MB compressed, 50 MB uncompressed, 5 MB per XML entry), and rejects XML with DOCTYPE or ENTITY declarations. For PDF it shells out to `pdftotext -layout` with a 5-second timeout. It is built for a quick preview, so it is flat: DOCX loses headings and tables, PPTX slides are ordered by file name rather than the presentation's slide list, and speaker notes and images are ignored.

Constraints from earlier decisions still apply: tools never write the design (they may write metadata, copies and exports); logic lives in core with thin hosts; no daemon; no new heavy dependencies; native host mechanisms over bespoke UI.

## Goals / Non-Goals

**Goals:**
- Any agent host can use DOCX, PPTX, XLSX, PDF (when `pdftotext` exists), Markdown, text and CSV as deck material, reading only the parts it needs.
- The user approves a storyline before slides are built, by default.
- Facts on slides trace back to the source, and drift is flagged automatically.
- Detail that leaves the slides survives in speaker notes, including in PPTX.
- Repository files are first-class sources.

**Non-Goals:**
- Editable PPTX (separate change, after a fidelity spike).
- Restyling an existing PPTX while keeping its layout, and rebuilding a deck when its source changes (phase 3; this change only records sources and detects staleness).
- OCR, PDF image extraction, legacy binary formats (`.doc`, `.ppt`, `.xls`), and remote URLs as sources.
- Exploring several storylines (phase 3, reusing explorations' deck arcs).

## Decisions

### 1. Vendor and extend upstream's extractor, rather than adding parsing libraries
`vendored/documentExtract.ts` keeps upstream's zip handling, limits, XML safety checks, `decodeXml`, shared-string and workbook parsing, and the `pdftotext` call. It extends them in documented ways:
- **DOCX:** headings from `w:pStyle` values `Heading1`–`Heading6` and `Title` become Markdown headings, `w:tbl` becomes a Markdown table, and list paragraphs (`w:numPr`) become `- ` items.
- **PPTX:** slide order comes from `ppt/presentation.xml` `p:sldIdLst` resolved through its relationships, with numeric file order as the fallback. Each slide becomes `## Slide N: <title placeholder text>`, and its notes slide text is appended as a `> Notes:` block.
- **XLSX:** each sheet becomes a Markdown table, capped at 200 rows, with a note when rows are dropped.
- **Images:** files under `word/media/`, `ppt/media/` and `xl/media/` are copied out. Only common web image types are kept, each at most 10 MB.

*Alternatives:* `mammoth`, `officeparser`, `xlsx` (SheetJS) or `pdfjs-dist`. Rejected because each adds a dependency (several of them large, and SheetJS has licensing caveats) for structure we can get from the XML we already parse. JSZip is already installed via `pptxgenjs`; we only make it a direct dependency.

### 2. PDF without a bundled engine
Use `pdftotext` (poppler) when it is on PATH, with a raised timeout of 20 seconds. Otherwise the result's `pdfNote` tells the agent to read the PDF with its own tools: Claude Code can, and other hosts vary. We never install anything.
*Alternative:* `pdfjs-dist` (about 5 MB plus a worker). Rejected for now because it costs a lot of package size for one format that our main host already handles. We can revisit it if users ask.

### 3. Extract to a cached folder; the outline is the interface
`read_open_design_source({ path })` writes `<outputDir>/sources/<slug>/`:
- `source.md`: the Markdown
- `assets/…`: extracted images
- `source.json`: `{ path, sha256, kind, extractedAt, sections, assets, warnings }`

`<slug>` comes from the source path, for example `docs/q3-report.docx` becomes `docs-q3-report-docx`, so different files with the same name don't collide. The result returns the outline (each heading with its line range and character count) plus the asset paths, not the whole text. The agent reads `source.md` itself, a range at a time. That keeps large documents out of the context window until they're needed.

If `sha256` matches an existing `source.json`, extraction is skipped. Paths must resolve inside the workspace (the same check remix uses), and must not point into the output directory's own `sources/` folder.
*Alternative:* return the full text in the tool result. Rejected because a 40-page report would flood the context; the outline-then-read pattern is how agents already work with code.

### 4. Sources are a `prepare_open_design_brief` argument, not a separate generation tool
`sources: string[]` (1–10 workspace paths). Prepare extracts them, using the cache, and passes `SourceContext[]` to `composeInstructions`, which adds a `## Source material` section and a `## Storyline first` section. Any skill can use sources; the guidance is phrased for decks, and for non-deck skills (one-pagers, reports) it reads "outline the sections" instead of slides.

The storyline workflow:
1. Read the relevant parts of each source.
2. Write `outline.md` next to the planned entry file. For each slide: a **takeaway headline** (a sentence, not a topic label), 2–4 supporting points, the visual type (chart, table, big number, quote, screenshot or diagram), and a **source reference** (`<file> §<heading>` or `<file> slide N` or `<file> sheet <name>`).
3. Show the outline and **stop** for approval, unless the user already said to just build it.
4. Build from the approved outline.

*Alternative:* a separate `prepare_open_design_deck_from_source` tool. Rejected because it would duplicate skill and design-system resolution, collections and grounding. One optional argument is easier for agents to discover and keeps a single code path.

### 5. Accuracy rules live in the instructions; the check lives in registration
The instructions require:
- numbers, names, dates and quotes exactly as written in the source;
- no invented statistics (a labelled placeholder such as `[metric — not in source]` instead);
- each slide's `aside.notes` (or the template's own notes element) holding the cut detail and a `Source:` line.

`register_open_design_artifact({ …, sources })`:
- records `sources: [{ path, sha256 }]` in the manifest;
- for HTML entries, runs `checkSourceNumbers`. It extracts number tokens from the entry's visible text (with `<script>` and `<style>` removed; notes are included, since a notes number is still a claim) and from each source's `source.md`. Both are normalised by stripping grouping commas and spaces, keeping `%`, `.`, `-` and currency signs separate, and treating `1.2M` / `1,200,000` style as distinct tokens. Integers from 0 to 12 and four-digit numbers from 1900 to 2100 are ignored, because they are mostly slide numbers and years.
- returns `unmatchedNumbers` (up to 50, each with a text snippet around it) and a line telling the agent to check each against the sources.

The check is a warning, never an error.
*Alternative:* a separate fact-check tool. Rejected because the agent would have to remember to call it, whereas registration always happens.

### 6. Staleness is detection only
`get_open_design_artifact` re-hashes each recorded source and returns `staleSources: [{ path, reason: 'changed' | 'missing' }]` (only when the manifest has sources). Rebuilding from a changed source is phase 3.

### 7. Speaker notes into PPTX
`captureDeckSlides` already visits each slide. Before hiding chrome, it reads the text of `aside.notes, .speaker-notes` inside that slide (exactly the presenter-notes elements `HIDE_CHROME_SELECTOR` already hides; a bare `.notes` class can be visible slide content, so it is not used) (trimmed, with whitespace collapsed per paragraph, at most 10,000 characters), and `SlideImage` gains an optional `notes`. `assemblePptx` calls `slide.addNotes(notes)` when it is present. PDF and image exports are unchanged. This works for every deck, not just source-built ones.

### 8. Manifest fields
Add an optional `sources` field: an array of at most 10 entries of `{ path: string ≤ 260, sha256: 64 hex characters }`. It is validated like the other additive fields and recorded in `vendored/SOURCE.md`.

### 9. Curated command and guidance
`local/prompts/deck-from-source.md` (`open-design-deck-from-source`) walks through: identify the sources (ask if none) → pick a deck skill → `prepare_open_design_brief` with `sources` → outline → approval → build → register with `sources` → fix any unmatched numbers → offer export (PPTX now includes notes). Its `model_trigger` covers requests to turn a named or attached document, spreadsheet, existing deck, or repository files into slides or a one-pager.

The overview skill and the VS Code instructions gain a "When the request is based on a document" section, which includes examples of repository sources (CHANGELOG → release deck, `docs/adr/` → architecture review, a metrics CSV → board update).

## Risks / Trade-offs

- [Regex XML extraction misses content in unusual documents: text boxes in DOCX, SmartArt, charts] → Report per-format warnings (for example "3 charts not extracted: chart data lives in embedded workbooks"). Charts' cached values in `c:numCache` are a possible follow-up. The agent can always ask the user.
- [Large spreadsheets] → The 200-row cap per sheet, with the dropped count reported. For analysis-heavy decks the guidance points to `data-report`-style processing by the agent itself.
- [The number check is noisy, e.g. derived numbers such as a computed percentage] → It's framed as "check these", not "these are wrong". The agent can justify a derived number in the slide's notes (the source line), and a notes match counts as present.
- [Approval adds a round trip] → Skippable on request; the guidance says to honour "just build it".
- [Untrusted documents] → Upstream's limits and XML entity rejection are kept. Extracted images are copied as files, never executed. Extracted text is data: the instructions say to treat source content as material, not instructions.
- [`pdftotext` missing] → Clear guidance in the result; Claude Code still works through its own PDF reading.

## Migration Plan

Additive only. New optional arguments and manifest fields; existing manifests, tools and exports behave as before, except that PPTX files now include notes when the deck has them. Rolling back means reverting; leftover `sources/` folders are inert.

## Open Questions

- Should the `sources/` cache be git-ignored by default? Recommendation: no. Extractions are reviewable, small and useful in diffs. The guide will mention adding it to `.gitignore` for confidential sources.
- Should non-deck one-pagers also stop for outline approval? Recommendation: yes for anything with more than three sections; the instructions decide by output size.
