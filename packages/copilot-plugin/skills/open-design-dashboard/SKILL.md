---
name: "open-design-dashboard"
description: Build a dashboard or KPI report from real data (a CSV, spreadsheet or JSON file), shaped for who reads it and where it goes, with charts the kit draws from the data, checked, and exported as PDF, slides, a link or an app screen — use whenever the user wants a dashboard, KPI page, metrics report, analytics view, scorecard, board metrics or a weekly or monthly numbers page, made from their data or sample data, even if they don't mention Open Design
argument-hint: what the dashboard is about and where the data is (e.g. "weekly sales KPIs from data/sales.csv for the leadership meeting")
---

<!-- generated:curated-entry -->

Build a dashboard with Open Design: the user's data in, charts the kit draws from it, shaped for the person who reads it.

Request: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "What should the dashboard show, from which data, and who reads it?")

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

## 1. Data first

Find the data before anything else:

- **A file in the workspace** (CSV, XLSX or JSON). Use it as it is; don't retype it.
- **Pasted data.** Save it as a CSV in the workspace (for example `data/<topic>.csv`) and use that file.
- **No data.** Offer sample data. If the user takes it, write realistic sample rows to a CSV and put a visible "Sample data" label on the dashboard.

Read the file's columns (call `read_open_design_source` for a spreadsheet). Before building, tell the user in two or three lines which columns become KPI cards and which become charts, and which period each covers.

**Live data.** The kit doesn't connect to live systems (databases, Notion, analytics tools). If the user asks for a "live" dashboard, say so in one sentence: the kit builds the dashboard from a file, and the same design can be refreshed from a new file every day, week or month (step 7).

## 2. Three quick questions

Ask these together, each with its default, and go on with the defaults if the user says so or doesn't care:

1. **Who reads it?** *Exec glance* (default for "leadership", "board", "investors"), *team monitor* (default for "ops", "support", "on a screen"), or *analyst review*.
2. **Where does it go?** *Send it* as a PDF or slides (default), *share a link*, or *an app screen* that becomes code.
3. **Which period, compared with what?** Default: the latest period in the data against the one before it.

## 3. Build

If the answer to "where does it go" is *an app screen*, follow the app screens route: `prepare_open_design_brief` with `skillId` `od:prototype:dashboard` and the brief saying it is an app screen; its states rules apply.

Otherwise call `prepare_open_design_brief` with:

- `skillId`: `od:prototype:dashboard` for a dashboard, `od:prototype:data-report` for a written report with charts, `od:prototype:finance-report` for a finance summary;
- the brief in the user's words, plus the reader, the destination and the period from step 2;
- `sources`: the data file(s).

Call `list_open_design_design_systems` first if the user names a brand, or `recommend_open_design_design_systems` if no design system is active.

Follow the returned instructions. Their **Charts** section is authoritative: put the data in the design's data file as `{ "from": "<the CSV>" }` collections, draw every chart with `data-od-chart`, and bind every other number with `data-od-bind`, so nothing on the page is typed by hand. Use the layout for the reader from the `dashboard-layout` craft section:

- **Exec glance:** one headline sentence with the main finding, 3 to 4 KPI cards, 1 to 2 charts, fits one screen or page.
- **Team monitor:** 4 to 6 KPI cards with thresholds, 2 to 4 charts, compact, the "as of" time in view.
- **Analyst review:** 2 to 4 KPI cards, 4 to 6 charts with tables beside them, and a short note on how the numbers were made.

Every KPI card shows a label, the value with its unit, the period, and the change against the comparison period (a `kpi` chart writes "▲ 4% vs Aug"). Show the "as of" date from the data file (`data-od-bind="asOf" data-od-format="date"`).

## 4. Register

Call `register_open_design_artifact` with the entry path, kind `html`, a title, `sourceSkillId` and `sources` (the data files). The kit adds the design's data files to the sources itself. For every number its result says it couldn't find in the sources, fix it or bind it to the data.

## 5. Check, critique and fix

Call `check_open_design_artifact`. Fix every error. Chart notes (`chart-series-contrast`, `chart-unlabelled`, `chart-axis-truncated`, `chart-too-many-series`, `kpi-no-period`) are the most common dashboard mistakes: fix them unless the brief asks for it on purpose. Then load the `open-design-critique` skill for a second opinion and apply its fixes. Check again after fixing.

## 6. Hand it over

- **Send it:** `export_open_design_artifact` with `format: "pdf"`, and offer PowerPoint (`format: "pptx"`, and `editable: true` for slides people can edit; charts stay as pictures).
- **Share a link:** load the `open-design-publish` skill.
- **An app screen:** offer to port it to the app's code with `port_open_design_artifact_to_app`; the data file becomes the app's mocks.

End with the **Files** list: the dashboard, its data file and the source data, then each export.

## 7. Offer a refresh

If the numbers come back every day, week or month, offer once: "Rebuild this every week from the new file?" On yes, load the `open-design-recurring` skill and write the job with `refresh: data`, so each run swaps in the new data and keeps this design exactly as it is.
