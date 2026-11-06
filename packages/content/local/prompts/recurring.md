---
name: open-design-recurring
description: Set up a design that rebuilds itself on a schedule (a weekly report deck, next week's social posts, a refreshed one-pager), or run one such job — one job file, one supervised run, then a one-line prompt for the scheduler
argument_hint: what to make and how often (e.g. "a KPI deck from data/kpis.csv every Monday"), or "Run the Open Design job <path>"
placeholder: What should be rebuilt, from which sources, and how often?
model_trigger: use whenever the user wants a design made again every day, every week or every month, on a schedule, or as a recurring job, or when a prompt says "Run the Open Design job <path>", even if they don't mention Open Design
---

Recurring Open Design jobs: one job file describes what to make each period, and a scheduler runs it.

Request: {{brief}}

{{voice}}

If the request names a job file (".open-design/jobs/<id>.job.md", usually "Run the Open Design job …"), go to **Run**. Otherwise go to **Set up**.

If `start_open_design_job_run` isn't one of your tools (VS Code has no scheduler, so it doesn't offer it), you can still write the job file in **Set up**, but say that scheduled runs need Claude Code or Claude Desktop with the Open Design MCP server, and stop there.

## Run

1. Call `start_open_design_job_run` with the job path (and `runNow: true` only when the person asked for a fresh run in this conversation, never from a scheduled prompt).
2. If it returns `skip`, report the reason in one line and stop. Make no changes.
3. If it asks you to check out the state branch, do that and call it again.
4. Otherwise follow its steps in order. This run is unattended: don't ask questions, never publish publicly and never post to social networks.
5. End with `finish_open_design_job_run`, follow the steps it returns, and reply with its summary.

## Set up

### 1. Agree the job

With the person, settle:

- **What** to make, and with which recipe: `open-design-deck-from-source` for a report deck or one-pager from data, `open-design-social-post` for a batch of posts, `open-design-poster` for a print piece, `open-design-docs` for pages from Markdown.
- **Sources**: workspace files (a CSV, a CHANGELOG, a report), or data a connector pulls (a sheet in Google Drive, a Notion database). Each connector source needs a `snapshot` workspace path the pulled data is saved to, so every number stays traceable.
- **How often**: `day`, `week` or `month`, and the time zone (an IANA name such as `Europe/Berlin`).
- **One file or one per period**: `mode: update` rewrites the same design each period (a living report); `mode: series` keeps one file per period, with `{period}` in the target (a weekly social batch).
- **Outputs**: export formats (`pdf`, `png`, `pptx`, `standalone` …). PNG, PDF, PowerPoint and video need a browser; runs without one record them as skipped.
- **Delivery**: `preview` (the private Claude artifact, the default), `pr` (a pull request from the state branch), or a connector action such as "Post the preview link to #design in Slack". Never a public publish or a social post: the scheduler's prompt can't stand in for the person's yes, so the job tools refuse those.
- **Checks**: `best-effort` (default) or `required`, which holds back the PR and connector deliveries when a run had no browser for the visual check.

### 2. Write the job file

Write `.open-design/jobs/<id>.job.md` (the id is lowercase with hyphens and matches the file name):

```markdown
---
id: weekly-kpis
title: Weekly KPI deck
recipe: open-design-deck-from-source
period: week
timezone: Europe/Berlin
mode: update
target: .open-design/weekly-kpis/weekly-kpis.html
outputs: [pdf]
sources:
  - data/kpis.csv
  - connector: Pull last week's signups from the "Metrics" sheet in Google Drive
    snapshot: data/snapshots/signups.csv
deliver: [preview, pr]
checks: best-effort
---

A five-slide KPI update for the leadership team: headline numbers first, then
signups, revenue and churn against last week, with one takeaway per slide.
```

The brief is the body: write everything a run needs to decide without asking, since nobody answers questions mid-run.

### 3. One supervised run

Run it now, with the person watching: call `start_open_design_job_run` and follow **Run**. Here you may ask questions; fold the answers back into the brief so later runs don't need them. If the start result lists problems by field, fix the job file and start again.

<!-- claude-only -->
When the run publishes the private preview, add its link to the job's frontmatter as `preview: { url: "<link>" }`, so every later run republishes the same artifact.
<!-- /claude-only -->

### 4. Schedule it

Give the person the exact prompt to save, and the steps for where they work:

> Run the Open Design job `.open-design/jobs/<id>.job.md`

- **Claude Code cloud scheduled task** (claude.ai/code/routines, or `/schedule`): runs without their computer. The repository needs the Open Design MCP server and skills committed (set up as in the [Claude Code guide](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/claude-code.md), then commit `.mcp.json`, `.claude/skills` and the job file). There's no browser by default, so PNG, PDF and PowerPoint outputs are skipped unless the environment's setup script installs one. The run log lives on the state branch `claude/open-design-job-<id>`. Schedule a few minutes past the hour, mid-period.
- **Claude Desktop local scheduled task** (Code tab, Routines, New, Local): runs on their computer with local files and a browser, only while the app is open and the computer is awake; a missed run gets one catch-up run, which the job skips if the period is already done. Tell them to click **Run now** once and approve each tool, so later runs aren't stopped by a prompt.
- **`/loop`** in an open session: only for trying the job out; it stops when the session closes.
- **Cowork scheduled tasks** aren't supported yet: the Open Design server runs only on the desktop.

Point them to the [recurring jobs guide](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/recurring-jobs.md) for details.
