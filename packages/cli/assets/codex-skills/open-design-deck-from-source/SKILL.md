---
name: open-design-deck-from-source
description: Turn a document (a report, spec, spreadsheet, PDF, existing deck, or repository files such as a CHANGELOG) into a deck or one-pager, storyline first, with every number traced back to the source — use whenever the user wants slides, a deck, a presentation or a one-pager made from an existing document, spreadsheet, PDF or deck, or from repository files (CHANGELOG, RFCs, architecture decision records, metrics CSVs), even if they don't mention Open Design
---

<!-- generated:open-design-agent-kit -->

Build a deck (or a one-pager) from existing documents with Open Design, storyline first, keeping every fact traceable to its source.

Request: the rest of the user's message (if there is none, ask the user: "Which document should the deck be built from, and for whom?")

## 1. Find the sources

Identify the workspace files the request is based on. If it names none, ask which documents to use before doing anything else. Repository files count: `CHANGELOG.md` for a release deck, `docs/adr/*.md` for an architecture review, a metrics CSV or spreadsheet for a board update. Use up to 10 files; for a folder, pick the relevant files.

If you're unsure what a document contains, call `read_open_design_source` with its path. It returns an outline, and you can read the extracted Markdown by line range.

## 2. Pick the format

Call `list_open_design_skills` with `mode: "deck"` (or a query such as "pitch deck", "weekly report", "board") and choose the skill whose style fits the audience. For a single page instead of slides, choose a page or report skill.

## 3. Prepare the brief with sources

Call `prepare_open_design_brief` with the `skillId`, the user's request as `brief`, and the document paths as `sources`. Pass `designSystemId` only if the user names a brand or style.

## 4. Storyline first

Follow the returned instructions. Read the parts of the extracted text you need, then write the outline at `outlinePath`, with one entry per slide giving a takeaway headline, supporting points, a visual type and a source reference. **Show the outline to the user and stop** until they approve or change it, unless they already said to just build it.

## 5. Build and check

Build from the approved outline. Use numbers, names and quotes exactly as in the sources, never invent a statistic, and put the detail you cut from each slide into its speaker notes, ending with a `Source:` line.

Call `register_open_design_artifact` with the same `sources`. For every number its result says it couldn't find in the sources, check it: fix it, or say in that slide's notes how it was derived. Register again after fixing.

## 6. Hand it over

Tell the user where the deck and its outline are, mention any images reused from the documents, and offer to export it as PowerPoint or PDF with `export_open_design_artifact`. PowerPoint exports include the speaker notes.
