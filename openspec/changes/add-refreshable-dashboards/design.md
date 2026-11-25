## Context

A job run today: `start_open_design_job_run` computes the period key, checks the run log and stale sources, and returns steps that tell the agent to follow the recipe for the brief, register, check, export and finish. `finish_open_design_job_run` runs browserless checks (missing files, unfilled fields, the source number check, size limits) and records the run. With `add-data-bound-charts`, binds and charts read collections that can come from CSV, XLSX or JSON files.

## Goals / Non-Goals

**Goals:** the same design each period with new numbers; a run that stops rather than ships a broken chart; a summary that says what changed.

**Non-Goals:** live dashboards; fetching data without a snapshot file; changing the design on a schedule (that stays `refresh: design`).

## Decisions

### Guard the page by hash

The simplest proof that a data refresh didn't redesign the page is that the entry file is byte-identical. The run records the entry's hash at start and the finish compares it. Shared fragments (`_shared/`) are included. A person who wants to change the layout does it in a normal session, which updates the hash the next run starts from.

### Shape check before work

Comparing columns is cheap and needs no browser, so it runs in `start_open_design_job_run` and also in finish (the data may be pulled during the run). Extra columns are fine; missing columns used by a bind or chart, and empty collections, are not.

### KPI changes from the run log

The finish step stores each `kpi` chart's value in the run log. The next run's summary compares against it, so "up 4% from last week" means the last completed run, not the data's previous row (which the chart already shows).

## Risks / Trade-offs

- **Cloud runs without a browser** still can't make PDFs or images; they're recorded as skipped, as today. The HTML, standalone file and private preview still update.
- **A brief that asks for a redesign each week** conflicts with `refresh: data`. The recurring recipe asks which one the person wants and writes it in the job file.
