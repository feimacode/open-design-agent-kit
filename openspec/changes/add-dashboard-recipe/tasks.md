## 1. Recipe

- [x] 1.1 `local/prompts/dashboard.md`: data first, three questions with defaults, build, states, register with sources, check, critique, export; regenerate skill copies
- [x] 1.2 `local/craft/dashboard-layout.md`: reader recipes, KPI rules, chart choice by question, density; `craft-requires.json` entries for `dashboard`, `data-report`, `finance-report`

## 2. Routing

- [x] 2.1 `surfaces.json` "A dashboard" answer and the `open-design` skill route to the recipe
- [x] 2.2 `live-artifact` and `live-dashboard` excluded from routing; recipe text for "live" requests

## 3. Checks

- [x] 3.1 `chartChecks.ts`: `chart-series-contrast`, `chart-unlabelled`, `chart-axis-truncated`, `chart-too-many-series`, `kpi-no-period`, as notes; unit tests
- [ ] 3.2 Calibration run over bundled dashboard examples and eval outputs; promote to warnings where false alarms are rare (Not run: needs eval outputs from a model run. All five checks stay notes until then.)

## 4. Evals and docs

- [ ] 4.1 Eval brief "weekly KPI dashboard from fixtures/kpis.csv", run with and without the kit (Brief `weekly-kpi-dashboard` and fixture `evals/fixtures/weekly-kpis` added; the with and without runs need a model key.)
- [x] 4.2 `docs/guides/dashboards.md`, CHANGELOG
