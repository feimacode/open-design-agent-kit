## 1. Data from files

- [x] 1.1 File-backed collections in the data file (`from`, `sheet`) read with `loadDataTable`; numeric cells parsed with the data file's locale; unit tests for CSV, XLSX and JSON
- [x] 1.2 Data files used by binds or charts recorded as sources on register, so `checkSourceNumbers` and `staleSources` cover them

## 2. Charts

- [x] 2.1 `export/charts/`: scales and nice ticks, then `bar` (orientation, grouped, stacked), `line`, `area`, `donut`, `sparkline`, `kpi` (latest value, change from previous or named row); unit tests per type
- [x] 2.2 Accessible output: `<title>`, generated summary sentence as the accessible name, visually hidden values table
- [x] 2.3 Colours from chart tokens with the fallback from `--accent`, `--muted`, `--fg`
- [x] 2.4 Called from `applySampleData` wherever binds are filled; SVG marked preview-only; exports carry drawn charts

## 3. Instructions and findings

- [x] 3.1 Chart section in `composeInstructions.ts` for `dashboard`, `data-report`, `finance-report`: use `data-od-chart`, no CDN chart libraries
- [x] 3.2 `chart-data-missing`, `chart-empty`, `chart-unsupported`

## 4. Docs and evals

- [x] 4.1 `docs/guides/data-and-charts.md`, `reference/tools.md`, CHANGELOG
- [x] 4.2 Eval brief: "a dashboard from fixtures/kpis.csv"; passes when every chart is a `data-od-chart` and no number on the page is missing from the file
