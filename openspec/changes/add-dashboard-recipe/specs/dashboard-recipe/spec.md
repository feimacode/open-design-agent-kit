## ADDED Requirements

### Requirement: Dashboard Recipe

The kit SHALL provide an `open-design-dashboard` recipe skill on every host that has recipe skills. It SHALL establish the data before building: a workspace file, pasted data saved as a CSV in the workspace, or sample data, which the page SHALL label as sample. It SHALL then ask, with defaults, who reads the dashboard (exec glance, team monitor, analyst review), where it goes (PDF or slides, a shared link, an app screen) and the period and comparison. It SHALL build with `data-od-chart` and binds, register the design with its data files as sources, run the check and the critic, and export to the chosen destination.

#### Scenario: CSV in the workspace
- **WHEN** the person asks for "a sales dashboard from data/sales.csv" and accepts the defaults
- **THEN** the recipe SHALL name the columns it will use for KPIs and charts before building, and the registered design SHALL list `data/sales.csv` as a source

#### Scenario: No data
- **WHEN** the person has no data and picks sample data
- **THEN** the page SHALL show a visible "Sample data" label

### Requirement: Dashboard Layout Craft

The content overlay SHALL provide a `dashboard-layout` craft doc with a layout recipe per reader type, KPI rules (label, value, unit, period, and change shown with sign and arrow, not colour alone), chart choice by question and density by reader. It SHALL be attached to the `dashboard`, `data-report` and `finance-report` skills.

#### Scenario: Exec glance
- **WHEN** a brief is prepared for an exec-glance dashboard
- **THEN** it SHALL include the craft doc's exec recipe: 3 to 4 KPIs, 1 to 2 charts and a headline sentence

### Requirement: Chart Checks

The check SHALL report, for pages with charts: `chart-series-contrast` when a series has less than 3:1 contrast with its background or two adjacent series are too close to tell apart; `chart-unlabelled` when a value axis has no unit or format, or several series have no legend or direct labels; `chart-axis-truncated` when a bar chart's value axis doesn't start at zero; `chart-too-many-series` for more than 6 lines or more than 5 donut slices; and `kpi-no-period` when a KPI shows a change with no comparison period. These findings SHALL be notes until a calibration run promotes them.

#### Scenario: Truncated bar axis
- **WHEN** a bar chart's value axis starts at 80 for values between 82 and 121
- **THEN** the check SHALL report `chart-axis-truncated` for that chart

#### Scenario: Line chart not at zero
- **WHEN** a line chart's axis starts above zero
- **THEN** the check SHALL NOT report `chart-axis-truncated`

#### Scenario: KPI without a period
- **WHEN** a KPI card shows "+12%" with no comparison period on the card
- **THEN** the check SHALL report `kpi-no-period`

### Requirement: Dashboard Routing

Dashboard requests in the `open-design` skill and the "A dashboard" answer of the Data report starting point SHALL load the dashboard recipe. The `live-artifact` and `live-dashboard` templates SHALL NOT be offered for "live dashboard" requests on hosts without the Open Design daemon; the recipe SHALL say that the kit makes dashboards from files that can be refreshed on a schedule.

#### Scenario: Live dashboard request
- **WHEN** the person asks for "a live dashboard of our Notion tasks" in Claude Code
- **THEN** the agent SHALL use the dashboard recipe and explain the file-based refresh, rather than build a template with daemon placeholders
