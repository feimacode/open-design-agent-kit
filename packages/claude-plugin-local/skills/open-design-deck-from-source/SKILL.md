---
name: "open-design-deck-from-source"
description: Turn a document (a report, spec, spreadsheet, PDF, existing deck, or repository files such as a CHANGELOG) into a deck or one-pager, storyline first, with every number traced back to the source — use whenever the user wants slides, a deck, a presentation or a one-pager made from an existing document, spreadsheet, PDF or deck, or from repository files (CHANGELOG, RFCs, architecture decision records, metrics CSVs), even if they don't mention Open Design
argument-hint: which document(s), and what to make (e.g. "docs/q3-report.docx as a 10-slide board update")
---

<!-- generated:curated-entry -->

Build a deck (or a one-pager) from existing documents with Open Design, storyline first, keeping every fact traceable to its source.

Request: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "Which document should the deck be built from, and for whom?")

**How to talk to the user.** Many people using Open Design don't write code, so:
- Use the user's own words. If they say "artifact", "design tokens" or give a file path, use those terms back; otherwise use the plain words below.
- Keep the machinery out of replies: no tool names, no ids like `od:prototype:poster-hero`, no internal files (`.artifact.json`, `.comments.json`, `config.json`), and not the words "register", "manifest", "sidecar", "entry" or "surface", unless the user used them first.
- Explain a print term the first time it comes up, in one short clause, and not again.
- Say where a file is the way the user would find it ("in your Open Design folder, under seed-swap-flyer"). Give a raw path only where the user can click it (Claude Code, Claude Desktop's Code tab, VS Code, GitHub Copilot) or asks for it, and never a `file://` link.
- When a design is ready, and after each export, end with a short **Files** list: the design itself first, then every file you exported. Where paths are clickable, write each as a Markdown link named by its file name (`[seed-swap-poster.html](<.open-design/seed-swap-poster/seed-swap-poster.html>)`; the angle brackets keep a path with spaces working); elsewhere, name the folder as above. Then one line on where to look at it, only if that place lasts: its Claude artifact link if it has one; in Claude Desktop's Code tab, that clicking the design opens it in the Browser pane; in Claude Desktop Chat, the preview above; in VS Code, the Artifact Preview; in a terminal or GitHub Copilot, the live preview's address, saying it works while this session is open.
- End each reply that finishes a step with one line on what they can do next, with at most two options ("Want it in Instagram sizes too, or is it ready to print?").

| Instead of | Say |
|---|---|
| artifact, entry, registered | your design, saved |
| design system, active design system | your style (the first time: "a saved style: colours, fonts and spacing") |
| surface, skill, template, recipe | kind of design, starting layout, or nothing |
| workspace, output directory | your folder, your Open Design folder |
| bleed | print edge ("a few millimetres extra that the printer trims off") |
| trim size | final size |
| preflight findings, errors | "I checked it and fixed…", "one thing to look at:" |
| export | save as PDF, save as an image |
| inline preview, MCP App | the preview above |

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

<!-- claude-only -->
**Claude artifact.** If you have an Artifact tool and this design has no Claude artifact yet, offer once, as one of the next steps when it is ready, to put it on claude.ai as a private artifact the user can open from any device and share later. Only on yes: call `publish_open_design_artifact` with `provider: "claude-artifact"`, follow what it returns and give the link. After that, publish again after each round of feedback you apply, without asking; it goes to the same artifact, so just say it was updated.
<!-- /claude-only -->

## 6. Hand it over

Tell the user where the deck and its outline are, mention any images reused from the documents, and offer to export it as PowerPoint or PDF with `export_open_design_artifact`. PowerPoint exports include the speaker notes. Offer both PowerPoint versions: the default, which looks exactly like the deck, and `editable: true`, which people can edit in PowerPoint, Keynote, Google Slides or Canva.
