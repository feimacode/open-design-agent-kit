## ADDED Requirements

### Requirement: Collections From Data Files

A design's data file SHALL accept a collection given as `{ "from": "<workspace path>" }`, with an optional `sheet` for `.xlsx`. The kit SHALL read CSV, XLSX and JSON-array files into rows, turning cells that parse as numbers in the data file's locale into numbers. Binds, repeats and charts SHALL read such a collection like one written inline. A path outside the workspace or a missing file SHALL be reported as `sample-data-missing`.

#### Scenario: CSV collection
- **WHEN** `dashboard.data.json` contains `"sales": { "from": "data/sales.csv" }` and the CSV has columns `month,revenue`
- **THEN** `data-od-bind="sales[0].revenue"` SHALL show the first row's revenue, formatted as a number

#### Scenario: Decimal commas
- **WHEN** the data file's locale is `de-DE` and a cell reads `1.284,50`
- **THEN** the value SHALL be the number 1284.5

### Requirement: Kit-Drawn Charts

An element with `data-od-chart` SHALL be filled with an inline SVG chart wherever the kit fills binds, using the collection in `data-od-data`, the category column in `data-od-x` and one or more value columns in `data-od-y`. The supported types SHALL be `bar`, `line`, `area`, `donut`, `sparkline` and `kpi`. The SVG SHALL be marked preview-only, so saving from a preview keeps only the element and its attributes. One-file, site, PDF and image exports SHALL contain the drawn chart.

#### Scenario: Line chart from a CSV
- **WHEN** a page has `<figure data-od-chart="line" data-od-data="sales" data-od-x="month" data-od-y="revenue">` and `sales` has nine rows
- **THEN** the check's capture SHALL show a line with nine points whose heights follow the revenue values

#### Scenario: KPI card
- **WHEN** a page has `data-od-chart="kpi" data-od-data="sales" data-od-y="revenue" data-od-format="currency"`
- **THEN** it SHALL show the last row's revenue as currency and its change from the previous row, with the sign shown in text, not by colour alone

#### Scenario: Data changes
- **WHEN** a row is added to the CSV and the page is served again
- **THEN** the chart SHALL include the new row with no change to the HTML file

### Requirement: Accessible Charts

Every drawn chart SHALL have a `<title>`, an accessible name that summarises it in one sentence with its first and last or largest values, and a visually hidden table of the values it plots.

#### Scenario: Screen reader
- **WHEN** a bar chart of revenue by region is drawn
- **THEN** the SVG SHALL be labelled with a sentence naming the largest region and its value, and the hidden table SHALL list every region and value

### Requirement: One Chart Route For Reports

Briefs for the `dashboard`, `data-report` and `finance-report` skills SHALL tell the agent to draw charts with `data-od-chart` and not to load chart libraries from a CDN. Briefs for D3 and editorial chart skills SHALL be unchanged.

#### Scenario: Data report brief
- **WHEN** a brief is prepared for `data-report`
- **THEN** it SHALL contain the chart section and SHALL NOT suggest Chart.js or ECharts

### Requirement: Data Files Are Sources

When a design that binds or charts a file-backed collection is registered, the data files SHALL be recorded as its sources, so the source number check and stale-source detection cover them.

#### Scenario: Typed number
- **WHEN** a dashboard shows "$1.4M" in a heading and no cell in its data files rounds to that value
- **THEN** registering it SHALL list "$1.4M" among numbers not found in the sources

### Requirement: Chart Findings

The check SHALL report `chart-data-missing` when a chart names a collection or column that doesn't exist, `chart-empty` when its collection has no rows, and `chart-unsupported` for an unknown type or option.

#### Scenario: Misspelt column
- **WHEN** a chart has `data-od-y="revnue"` and the collection has no such column
- **THEN** the check SHALL report `chart-data-missing` naming the column and the columns that exist
