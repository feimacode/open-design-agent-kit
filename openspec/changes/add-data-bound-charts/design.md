## Context

`sampleData.ts` fills `data-od-bind` and `data-od-repeat` from a JSON data file wherever the kit serves a design (static server, VS Code preview, MCP App, exports), with copies marked preview-only so a save keeps the template. `poster/data.ts` reads CSV, XLSX and JSON arrays into a `DataTable` of string cells for bulk export. `sourceNumberCheck.ts` lists numbers on a page that aren't found in its registered sources.

## Goals / Non-Goals

**Goals:** charts whose numbers come from the user's file; the same chart redrawn when the file changes; one chart route that works offline, in checks and in every export.

**Non-Goals:** a general charting library (maps, scatter matrices, Sankey stay with D3 skills); live data or connectors; interactive filtering (a later change); charts that stay editable in PowerPoint.

## Decisions

### Draw on the server, not with a script

Charts are drawn as SVG by the kit, in the same pass that fills binds. A chart library loaded in the page would need network access, wouldn't render in a headless check without waiting, and would be stripped from previews that drop scripts. Server-drawn SVG is the same in the preview, the check, the PDF and a Claude artifact. The trade-off is no hover tooltips; the hidden values table and the summary carry the numbers instead.

### Six types, chosen for reports

Bar, line, area, donut, sparkline and KPI cover the charts in the bundled dashboard and report templates. Anything else is a hand-drawn chart, as today. A request for a seventh type is a new change, not an option on an existing one.

### The element is the template

The `<figure data-od-chart>` stays in the file with its attributes; the SVG inside it is preview-only, like repeat copies. A save from the preview strips it. A raw file opened outside the kit shows an empty figure with its caption, which is acceptable for a template.

### File-backed collections, not a second data format

A data file can name a collection `{ "from": "data/sales.csv" }` instead of a new attribute on the page, so binds, repeats and charts all read collections the same way and the page doesn't know where its data came from. Numeric-looking cells become numbers (with the file's locale for decimal commas); everything else stays a string. The 200-row limit of `loadDataTable` applies.

### Colours

The renderer reads `--chart-1` to `--chart-6`, `--chart-pos`, `--chart-neg`, `--chart-grid` and `--chart-axis` from the resolved tokens (`add-chart-tokens`). Until that change lands, it derives series colours from `--accent`, `--muted` and `--fg` by stepping lightness. Colours are written as `var(--chart-1, <fallback>)` so a theme change follows.

## Risks / Trade-offs

- **Scope creep toward a chart library.** Options are limited to what the six types need (orientation, stacking, axis format, comparison row). New options need a design note here.
- **Hand-drawn charts remain possible.** The agent can still draw a chart by hand. The instruction says not to, and `add-dashboard-recipe`'s checks flag numbers not in the sources.
