---
name: open-design-docs
description: Turn a folder of Markdown documents (ADRs, RFCs, runbooks, notes) into designed HTML pages, one per file, all in one style, and keep them in step when the Markdown changes — use whenever the user wants several Markdown files (a docs folder, ADRs, RFCs, runbooks, meeting notes) turned into HTML pages, or wants HTML versions of existing docs refreshed after edits
---

<!-- generated:open-design-agent-kit -->

Turn existing Markdown documents into designed HTML pages with Open Design, one page per file.

Request: the rest of the user's message (if there is none, ask the user: "Which Markdown files should become pages, and in what style?")

## 1. Find the files

Resolve the folder or glob in the request with your own file tools (for example `docs/adr/*.md`). List what you found.

- More than 20 files: tell the user how many there are and ask whether to do all of them or a subset. Don't start until they answer.
- No files: say so and stop.

## 2. Pick one template for the set

All pages in a set share one template, so they read as one collection. Choose by what the files are, or use the style the user named:

| Files | Skill |
|---|---|
| Architecture decisions | `od:prototype:adr` |
| Proposals, design docs | `od:prototype:rfc` |
| Incident write-ups | `od:prototype:postmortem` |
| Runbooks | `od:prototype:eng-runbook` |
| Release notes or changelogs | `od:prototype:changelog-page` |
| Long-form notes, essays, anything else | `od:prototype:doc-kami-parchment` |

Derive a `collectionId` from the folder name (for example `docs-adr`) and a readable `collectionName`.

## 3. On a re-run, only redo what changed

If pages from an earlier run exist (look for artifacts in that collection, or call `get_open_design_artifact` on each), compare: a page whose `staleSources` lists its Markdown file is out of date and gets regenerated; a page that isn't stale is skipped; a file with no page yet gets one. Tell the user what you'll regenerate and what you'll skip.

## 4. Build each page

For each file, in order:

1. Call `read_open_design_source` with the file. Use only what it returns: never add facts the Markdown doesn't have.
2. Call `prepare_open_design_brief` with the chosen skill, a brief naming the file, `collectionId`, `collectionName`, and `screenRole` set to the file's name.
3. Write the page, keeping the document's own headings, structure and status (for ADRs and RFCs, its status goes in the `data-od-status` banner). Link to sibling pages in the set where the Markdown links to the sibling `.md` file.
4. Call `register_open_design_artifact` with the same collection values and `sources: ["<the .md path>"]`, so a later run can tell when the Markdown changed.

Check the first page with `check_open_design_artifact` and fix its errors before doing the rest, so mistakes aren't copied into every page. Check the others at the end.

## 5. Report

List each page with its source file, and anything skipped or still flagged. In VS Code, mention the Collections view, where the whole set opens with Prev/Next.
