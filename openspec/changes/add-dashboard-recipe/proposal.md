Roadmap area: Professional workflows (also Design quality and steering)

## Why

"Make me a dashboard" is one of the most common quick design requests, and the kit answers it from more than a dozen entries: the `dashboard` template, `data-report`, `finance-report`, and vendored GitHub, social media, team, trading and "live" dashboards. None of them asks the questions that decide whether a dashboard is any good:

- **Who reads it, and for how long?** An exec glances for ten seconds; a team watches it all day; an analyst digs in. Each needs a different layout and number of charts.
- **Where does it go?** A PDF or slides to send, a shared link, or an app screen that becomes code.
- **What does each number mean?** A KPI without its period, unit or comparison ("+12%" against what?) is the most common dashboard mistake.

Nothing checks the charts either. Series colours that can't be told apart, missing units, a bar axis that doesn't start at zero and eight lines on one chart all pass today. The vendored `live-artifact` and `live-dashboard` templates need upstream Open Design's daemon, which the kit doesn't ship, so they end with placeholders (`hostOverrides.ts`).

Source: dashboard features assessment, 25 November 2026 (items 3, 4 and 8). It builds on `add-data-bound-charts`.

## What Changes

- **Recipe skill `open-design-dashboard`** (new local prompt `packages/content/local/prompts/dashboard.md`, rendered for every host like the other recipes):
  1. **Data first.** A file in the workspace, pasted data saved as a CSV, or sample data clearly labelled as sample on the page. Read the columns and say which ones become KPIs and charts before building.
  2. **Three quick questions** with defaults: who reads it (exec glance, team monitor, analyst review), where it goes (send as PDF or slides, share a link, app screen), and the period and comparison (this month vs last month).
  3. **Build from a layout recipe** for the reader type, with `data-od-chart` and binds.
  4. **States.** An "as of" date bound from the data, and empty, loading and error states for app-screen dashboards.
  5. **Register with the data as sources, check, critique, export** to the chosen destination.
- **Craft doc `dashboard-layout.md`** (local craft): the three layout recipes (how many KPIs, which charts, reading order), KPI rules (label, value, unit, period, change with sign and arrow, never colour alone), chart choice by question (trend, comparison, share, distribution), and density by reader.
- **Chart checks**, reported as notes until calibrated:
  - `chart-series-contrast`: a series under 3:1 against the background, or two adjacent series too close to tell apart;
  - `chart-unlabelled`: no unit or format on a value axis, or several series with no legend or direct labels;
  - `chart-axis-truncated`: a bar chart whose value axis doesn't start at zero;
  - `chart-too-many-series`: more than 6 lines, or more than 5 donut slices;
  - `kpi-no-period`: a KPI change with no comparison period on the card.
- **Routing.** The "Data report" starting point's "A dashboard" answer and dashboard requests in the `open-design` skill go to the recipe. The `live-artifact` and `live-dashboard` templates are no longer offered for "live dashboard" requests; the recipe explains that the kit makes refreshable dashboards from files (`add-refreshable-dashboards`) rather than live connections.

## Capabilities

### New Capabilities
- `dashboard-recipe`: the recipe skill and its questions, the layout craft doc, the chart checks, and routing.

### Modified Capabilities
None.

## Impact

- `packages/content/local/prompts/dashboard.md` and the generated skill copies; `packages/content/local/craft/dashboard-layout.md` and `craft-requires.json`.
- `packages/content/local/surfaces.json` (data-report answers), the `open-design` skill's routing text, and routing exclusions for `live-artifact` and `live-dashboard`.
- Checks: chart findings in a new `packages/core/src/export/chartChecks.ts`, called from `checkArtifact.ts`; KPI period from the `kpi` chart's attributes or nearby text.
- Evals: a "weekly KPI dashboard from a CSV" brief for both arms of the evals loop.
- Docs: `docs/guides/dashboards.md`, CHANGELOG.
