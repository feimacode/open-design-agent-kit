---
name: open-design-dashboard
description: Build a dashboard or KPI report from real data (a CSV, spreadsheet or JSON file), shaped for who reads it and where it goes, with charts the kit draws from the data, checked, and exported as PDF, slides, a link or an app screen
argument_hint: what the dashboard is about and where the data is (e.g. "weekly sales KPIs from data/sales.csv for the leadership meeting")
placeholder: What should the dashboard show, from which data, and who reads it?
model_trigger: use whenever the user wants a dashboard, KPI page, metrics report, analytics view, scorecard, board metrics or a weekly or monthly numbers page, made from their data or sample data, even if they don't mention Open Design
---

Build a dashboard with Open Design: the user's data in, charts the kit draws from it, shaped for the person who reads it.

Request: {{brief}}

{{voice}}

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

<!-- claude-only -->
**Claude artifact.** If you have an Artifact tool and this design has no Claude artifact yet, offer once, as one of the next steps when it is ready, to put it on claude.ai as a private artifact the user can open from any device and share later. Only on yes: call `publish_open_design_artifact` with `provider: "claude-artifact"`, follow what it returns and give the link. After that, publish again after each round of feedback you apply, without asking; it goes to the same artifact, so just say it was updated.
<!-- /claude-only -->

## 6. Hand it over

- **Send it:** `export_open_design_artifact` with `format: "pdf"`, and offer PowerPoint (`format: "pptx"`, and `editable: true` for slides people can edit; charts stay as pictures).
- **Share a link:** load the `open-design-publish` skill.
- **An app screen:** offer to port it to the app's code with `port_open_design_artifact_to_app`; the data file becomes the app's mocks.

End with the **Files** list: the dashboard, its data file and the source data, then each export.

## 7. Offer a refresh

If the numbers come back every day, week or month, offer once: "Rebuild this every week from the new file?" On yes, load the `open-design-recurring` skill and write the job with `refresh: data`, so each run swaps in the new data and keeps this design exactly as it is.
