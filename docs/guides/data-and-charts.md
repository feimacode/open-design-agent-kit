# Data and charts

A dashboard, data report or finance summary shows numbers from your data, so the kit draws its charts from that data instead of letting the agent type numbers into the page. The numbers on the page then always match the file, and next week's file changes them all at once.

## Your data file

The design keeps its data in one data file, the same file that holds [sample data](app-screens.md#sample-data) for app screens: `<name>.data.json` beside the page, or `_shared/data.json` beside several pages. A collection can point at a file in your workspace instead of holding the rows itself:

```json
{
  "locale": "en-US",
  "currency": "USD",
  "asOf": "2026-11-22",
  "weeks": { "from": "data/kpis.csv" },
  "regions": { "from": "data/sales.xlsx", "sheet": "By region" }
}
```

`from` takes a CSV, an Excel file (`sheet` names the sheet; the first sheet otherwise) or a JSON file holding a list of records. The path is read from the workspace first, then from beside the data file. Numbers in the file are read with the data file's `locale`, so `1.284,50` is 1284.5 in `de-DE`. Values with leading zeros, such as `00042`, stay text.

Every other number on the page binds to the same data with `data-od-bind` (for example `<span data-od-bind="asOf" data-od-format="date">`), so nothing is typed by hand.

## Charts

A chart is a `<figure>` with `data-od-chart`. The kit draws it as inline SVG wherever it shows the design (preview, check and every export):

```html
<figure data-od-chart="line" data-od-data="weeks" data-od-x="week"
        data-od-y="revenue,target" data-od-labels="Revenue,Target"
        data-od-format="currency" data-od-title="Revenue by week">
  <figcaption>Revenue by week, USD</figcaption>
</figure>
```

| Attribute | Meaning |
|---|---|
| `data-od-chart` | `bar`, `line`, `area`, `donut`, `sparkline` or `kpi` |
| `data-od-data` | The collection the rows come from |
| `data-od-x` | The column for categories or time |
| `data-od-y` | One or more value columns, comma-separated: one series each (a donut uses the first, one slice per row) |
| `data-od-labels` | Names people read for the series, in the same order as `data-od-y` |
| `data-od-format` | `number`, `currency` or `percent`, for axes, labels and the values table |
| `data-od-orientation` | `horizontal` for a bar chart with long names |
| `data-od-stacked` | Stack the bars or areas |
| `data-od-compare` | KPI only: compare the latest value with `previous` (the default), `first`, a row number, or `none` |
| `data-od-title` | The chart's title, also its accessible name |

Bars always start at zero. A chart draws at most 8 series and 200 points.

A `kpi` chart shows the latest value, its change against the comparison row with an arrow and the word ("▲ up 4.3% vs W46"), and that row's name as the period. Every chart has a `<title>`, a one-sentence summary for screen readers and a hidden table of its values.

Charts take their colours from the design system's [chart colours](design-systems.md#chart-colours), so they match the rest of the design. Briefs for dashboards, data reports and finance reports tell the agent to use kit charts and not to load a chart library from a CDN.

## What the check reports

Errors, from the data:

| Check | Finds |
|---|---|
| `chart-data-missing` | A chart whose collection or column isn't in the data |
| `chart-empty` | A chart whose collection has no rows, or no numbers in its value columns |
| `chart-unsupported` | A `data-od-chart` type the kit doesn't draw |

Notes, for the most common dashboard mistakes:

| Check | Finds |
|---|---|
| `chart-series-contrast` | Series colours under 3:1 against the background, or neighbours too close to tell apart |
| `chart-unlabelled` | A bar, line or area chart with no unit, or a legend showing column names (`new_cust`) instead of `data-od-labels` |
| `chart-axis-truncated` | A hand-drawn bar chart whose value axis starts above zero |
| `chart-too-many-series` | More than 6 lines on one chart, or more than 5 parts in a donut |
| `kpi-no-period` | A KPI, or a hand-written change like "+12%", with no comparison period |

## Numbers and sources

When you register the design, the kit adds its data file and every file a collection reads `from` to the design's sources. The [source number check](../reference/tools.md#register_open_design_artifact) then finds every number on the page in your files (numbers the kit filled in from binds and charts are skipped, because they come from the data), and the design is reported stale when one of those files changes.

## Related

- [Dashboards](dashboards.md)
- [Recurring design jobs](recurring-jobs.md#refresh-a-dashboards-data)
- [Sample data for app screens](app-screens.md#sample-data)
