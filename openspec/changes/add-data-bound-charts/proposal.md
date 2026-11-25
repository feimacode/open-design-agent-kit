Roadmap area: Professional workflows (also Import and export)

## Why

People often need a dashboard or a data report quickly: a weekly KPI page, an exec one-pager, a client report. They usually have a CSV or spreadsheet export. The kit can already make the page (the `dashboard` template, the `data-report` skill and the "Data report" starting point), but its charts aren't tied to the data:

- Tables and lists can bind to a data file (`add-sample-data`), but charts can't. The agent types each number into an SVG drawing by hand, so nothing proves that a bar matches its row, and next week's numbers mean redrawing every chart.
- The two chart routes disagree. The `dashboard` template says inline SVG and no libraries. `data-report` says Chart.js or ECharts from a CDN, which needs network access to render and draws nothing in an offline check or export.
- Data binds read JSON only, although the kit already reads CSV and XLSX for bulk export (`poster/data.ts`).

Source: dashboard features assessment, 25 November 2026 (item 1). It's the base for `add-dashboard-recipe` and `add-refreshable-dashboards`.

## What Changes

- **CSV and Excel as data.** A design's data file (`<name>.data.json` or `_shared/data.json`) can name a collection by file instead of listing it: `"sales": { "from": "data/sales.csv" }` (or `.xlsx` with `sheet`, or `.json`). The kit reads it with the existing `loadDataTable` and turns numeric-looking cells into numbers. Binds and repeats work on it as on any collection.
- **Charts drawn by the kit.** An element marked `data-od-chart` is filled with an inline SVG chart drawn from a collection, wherever binds are filled (previews, check, exports):

  ```html
  <figure data-od-chart="line" data-od-data="sales" data-od-x="month"
          data-od-y="revenue,cost" data-od-format="currency"></figure>
  ```

  Six types: `bar` (vertical or horizontal, grouped or stacked), `line`, `area`, `donut`, `sparkline` and `kpi` (the latest value of a column, with its change from the previous row or a named comparison row). The chart sizes to its element, uses the design system's chart colours (`add-chart-tokens`) with a fallback from `--accent`, `--muted` and `--fg`, and formats numbers like binds.
- **Readable by everyone.** Each chart gets a `<title>`, a one-line summary as its accessible name ("Revenue rose from $82k in January to $121k in September"), and a visually hidden table of its values.
- **One chart route.** Instructions for the `dashboard` template, `data-report` and `finance-report` (vendored, so through the kit's instruction overlay) say to use `data-od-chart` and no chart libraries from a CDN. D3 and editorial chart skills keep hand-drawn charts.
- **Numbers stay traceable.** A data file used by binds or charts counts as a source when the design is registered, so the existing source number check covers it.
- **Findings.** `chart-data-missing` for a collection or column that doesn't exist, `chart-empty` when a chart has no rows, and `chart-unsupported` for an unknown type or option.

## Capabilities

### New Capabilities
- `data-bound-charts`: collections from CSV, XLSX and JSON files, the `data-od-chart` element and its six types, accessible output, the one-route instruction, data files as sources, and the findings.

### Modified Capabilities
None. Sample data binds keep their requirements; this change adds file-backed collections and charts beside them.

## Impact

- `packages/core/src/export/sampleData.ts`: file-backed collections (reusing `poster/data.ts` `loadDataTable`), and the call into the chart renderer.
- New `packages/core/src/export/charts/` (scales, the six renderers, summary text), with unit tests per type.
- `packages/core/src/generation/composeInstructions.ts`: chart section for dashboard and report skills; `sourceNumberCheck.ts`: data files as sources.
- Exports: one-file, site, PDF and image exports carry charts already drawn. Editable PowerPoint keeps each chart as a picture, as it does for SVG today.
- Docs: a new `docs/guides/data-and-charts.md`, `reference/tools.md`, CHANGELOG.
