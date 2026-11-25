## ADDED Requirements

### Requirement: Data-Only Refresh

A job file SHALL accept `refresh: data` or `refresh: design`, defaulting to `design`. With `refresh: data`, the steps returned by `start_open_design_job_run` SHALL tell the agent to update the data files from the job's sources and not to edit the design's HTML or shared fragments, then register, check and export as for other jobs. `finish_open_design_job_run` SHALL report `refresh-edited-page` and end the run `needs-review` when the entry file or a shared fragment changed during the run.

#### Scenario: New week's CSV
- **WHEN** a `refresh: data` job runs after `data/kpis.csv` gained a row
- **THEN** the run SHALL complete with the entry HTML byte-identical, and the preview SHALL show the new row in its charts

#### Scenario: Agent edits the page
- **WHEN** the entry HTML's hash at finish differs from its hash at start
- **THEN** the run SHALL end `needs-review` with `refresh-edited-page`, and no shared delivery SHALL happen

### Requirement: Data Shape Check

For `refresh: data` jobs, `start_open_design_job_run` and `finish_open_design_job_run` SHALL compare each data file with the collections and columns the design's binds and charts use. A missing column or an empty collection SHALL end the run `needs-review` with `data-shape-changed`, naming the missing column and the columns found. Extra columns SHALL be allowed.

#### Scenario: Renamed column
- **WHEN** this week's CSV has `Revenue (USD)` instead of `revenue`
- **THEN** the run SHALL end `needs-review` with `data-shape-changed` naming `revenue` and listing the columns found

### Requirement: As-Of Date

A `refresh: data` run SHALL set `asOf` in the design's data file to the end of the period, or to the newest date in the data when that is later, so a bind to `asOf` updates without editing the page.

#### Scenario: Weekly job
- **WHEN** a weekly job runs for period `2026-W48` in `Australia/Sydney`
- **THEN** `asOf` SHALL be `2026-11-29` unless the data holds a later date

### Requirement: KPI Change Summary

`finish_open_design_job_run` SHALL record the value of each `kpi` chart in the run log, and the run summary SHALL list each KPI's new value and its change from the last completed run.

#### Scenario: Second run
- **WHEN** revenue was $116k in the last completed run and is $121k now
- **THEN** the summary SHALL say revenue is $121k, up 4% from the last run
