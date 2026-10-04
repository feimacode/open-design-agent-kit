# Turn a document into a deck

Already have the material? Point the agent at it. A report, a spec, a spreadsheet, a PDF, an old deck, or files in your repo become a deck (or a one-pager). You agree the storyline before any slide is built, and every number is checked against the source.

## Before you start

- **The document is in your workspace.** Copy an upload or attachment into the project folder first; the tools read workspace files only.
- **Formats:** `.docx`, `.pptx`, `.xlsx`, `.pdf`, `.md`, `.txt` and `.csv`. For old `.doc`, `.ppt` or `.xls` files, save them in the newer format first.
- **PDFs** need `pdftotext` from [poppler](https://poppler.freedesktop.org/) (`brew install poppler`, `apt install poppler-utils`, or Windows builds). Without it the agent reads the PDF with its own tools if it can: Claude Code can.

## Steps

1. **Ask, naming the document.**

   > Make a 10-slide board update from docs/q3-report.docx.

   > Turn metrics/q3.xlsx into a one-page summary for the leadership team.

2. **The agent reads the source.** [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) with `sources` runs [`read_open_design_source`](../reference/tools.md#read_open_design_source) on each document. That turns it into Markdown with an outline, so the agent reads only the sections it needs, even from a long report. Images embedded in the document (logos, screenshots, photos) are extracted too, and reused rather than redrawn.

3. **You approve the storyline.** Before building, the agent writes `outline.md` next to the deck and stops. Each slide gets:
   - a **takeaway headline**: a sentence saying what the slide proves, not a topic label;
   - 2–4 supporting points;
   - the visual (big number, chart, table, quote, screenshot, diagram);
   - where it comes from (`docs/q3-report.docx §Revenue`, `slide 4`, `sheet Pipeline`, `page 7`).

   Change the order, cut slides, or ask for a different angle. This is the cheap moment to redirect. If you'd rather skip the review, say "just build it".

4. **The agent builds the deck** from the approved outline, using numbers, names and quotes exactly as written in the source. When a figure the story needs isn't in the source, you get a visible placeholder (`[figure — not in source]`), never an invented one. Detail cut from a slide goes into its **speaker notes**, ending with a `Source:` line.

5. **Numbers are checked.** [`register_open_design_artifact`](../reference/tools.md#register_open_design_artifact) with the same `sources` lists every number on the slides that it can't find in any source. The agent checks each one, then fixes it, or explains in the notes how a derived figure (say, a percentage it calculated) was worked out.

6. **Export.** As PowerPoint or PDF ([Export decks and PDFs](export-decks.md)). PowerPoint files carry the speaker notes.

> **In VS Code:** `/open-design-deck-from-source` runs the flow explicitly, and `#od-read-source` looks inside a document on its own. The deck opens in the [preview](preview-comments-edit.md).

> **In Claude Code / Codex:** `/open-design-deck-from-source` (`/open-design:open-design-deck-from-source` with the plugin), or just ask: the `open-design` skill picks up requests that name a document.

## From your repository

The source doesn't have to be an office document. Because the agent works inside your repo, project files make good decks:

| Ask for | Sources |
|---|---|
| A release or launch deck | `CHANGELOG.md`, release notes |
| An architecture review | `docs/adr/*.md`, an RFC |
| A sprint or quarterly review | a milestone summary, `metrics/*.csv` |
| A project pitch | `README.md`, `docs/vision.md` |

> A release deck for v2.0 from CHANGELOG.md, for customers.

Up to 10 files per design. For a folder, the agent picks the relevant files.

## Keeping it current

Each deck's manifest records which sources it was built from, with their content hashes. When a source changes later, [`get_open_design_artifact`](../reference/tools.md#get_open_design_artifact) reports it in `staleSources`, so asking "is this deck still up to date?" gets a real answer. Rebuilding from the changed source is still a manual request ("update the deck from the new report").

## What you get

```
.open-design/
├── sources/docs-q3-report-docx/
│   ├── source.md               ← the document as Markdown
│   ├── source.json             ← outline, hash, warnings
│   └── assets/image1.png …     ← images from the document
└── board-update/
    ├── outline.md              ← the storyline you approved
    ├── board-update.html       ← the deck
    └── exports/board-update.pptx
```

`sources/` holds readable copies of your documents. If they're confidential, add `.open-design/sources/` to `.gitignore`.

## Limits

- **Charts inside Word or PowerPoint** come through as images at best; their underlying numbers aren't extracted. The extraction result warns about this, and the agent asks for the numbers if a slide needs them.
- **Spreadsheets** are cut at 200 rows per sheet (with a warning). For analysis-heavy decks, summarise the data first or ask for a [data report](generate-a-design.md).
- **Scanned PDFs** have no text to extract.
- **The number check** compares numbers, not meaning: a correct number used for the wrong claim still passes, so review the outline.
