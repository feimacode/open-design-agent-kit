Roadmap area: Artifact management (also Professional workflows)

## Why

Most quick dashboards come back: the weekly KPI page, the monthly board metrics, the client's report. Recurring design jobs (`add-recurring-design-jobs`) already rebuild a design each period and republish it to the same private link. But each run follows the recipe again, so the agent redesigns the page every week. The layout drifts, a chart moves, and the person has to review the whole design instead of the new numbers.

With `add-data-bound-charts`, a dashboard's numbers live in its data files, and the page only binds to them. A refresh can then be what people mean by it: new data in, same design, new numbers out.

Source: dashboard features assessment, 25 November 2026 (item 5). It depends on `add-data-bound-charts` and works best with `add-dashboard-recipe`.

## What Changes

- **A data-only refresh in jobs.** A job file can set `refresh: data`. Each run then:
  1. updates the data files from the job's sources (a workspace file someone dropped in, or a connector pull saved to the snapshot path, as jobs allow today);
  2. leaves the HTML alone: the run's steps say not to edit the page, and `finish_open_design_job_run` reports `refresh-edited-page` if the entry file's hash changed;
  3. registers again with the same sources, checks and exports as today.

  `refresh: design` (the default) keeps today's behaviour.
- **Data shape check.** Before the run, `start_open_design_job_run` compares each data file's columns with those the page's binds and charts use. A missing column or a file with no rows ends the run as `needs-review` with `data-shape-changed`, so a renamed column never ships an empty chart.
- **"As of" from the period.** The run sets `asOf` in the data file to the period's end (or the newest date in the data, if later), so the dashboard's date updates with no edit.
- **What changed, in the summary.** The run summary lists each KPI's new value and its change from the last run ("Revenue $121k, up 4% from last week"), taken from `kpi` charts, for the session or a connector message.
- **Recipe hand-off.** The dashboard recipe's last step offers "Refresh this every week?", and the recurring recipe's set-up writes `refresh: data` for dashboards made from files.

## Capabilities

### New Capabilities
- `refreshable-dashboards`: the `refresh: data` job mode, the unchanged-page guard, the data shape check, the as-of date, and the KPI change summary.

### Modified Capabilities
None. Recurring jobs keep their requirements; `refresh: data` is an added option.

## Impact

- `packages/core/src/jobs/jobFile.ts` (`refresh` field), `jobRun.ts` (data-only steps, shape check, as-of), `jobChecks.ts` (`refresh-edited-page`, `data-shape-changed`), run summary with KPI changes stored in the run log.
- `packages/content/local/prompts/recurring.md` and `dashboard.md` (hand-off).
- Docs: `docs/guides/recurring-jobs.md` (a dashboard example), CHANGELOG.
