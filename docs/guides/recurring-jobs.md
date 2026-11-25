# Recurring design jobs

Some designs need making again every week: a report deck rebuilt from this week's numbers, a batch of social posts for next week, a refreshed one-pager. A **job** describes that design once, in a file next to your work, and a scheduler runs it. Each run:

- works out its **period** (`2026-10-21`, `2026-W43` or `2026-10`) in the job's time zone;
- **skips** when that period already has a completed run and the sources haven't changed, so a catch-up run, a second "Run now" or a retried cloud run makes no duplicate;
- rebuilds the design, exports what it can, republishes the **same private preview**, and records what it made and what it skipped (PNG and PDF without a browser, for example);
- never publishes publicly and never posts to social networks, because a scheduler's prompt can't stand in for your yes.

Ask for it in plain words ("make this KPI deck every Monday from `data/kpis.csv`") and the agent uses the `open-design-recurring` recipe: it agrees the job with you, writes the job file, does one supervised run, and tells you what to paste into your scheduler.

> **In VS Code:** VS Code has no scheduler, so the job tools aren't offered there. `/open-design-recurring` can still write the job file; run it from Claude Code or Claude Desktop.

## The job file

A job is `.open-design/jobs/<id>.job.md`: YAML frontmatter, then the brief. The id matches the file name.

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
preview:
  url: https://claude.ai/artifact/…
---

A five-slide KPI update for the leadership team: headline numbers first, then
signups, revenue and churn against last week, with one takeaway per slide.
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase letters, digits and hyphens; the file is `<id>.job.md`. |
| `title` | yes | Shown in run summaries. |
| `recipe` | yes | The recipe skill each run follows, e.g. `open-design-deck-from-source`, `open-design-social-post`, `open-design-poster`, `open-design-docs`. |
| `period` | yes | `day`, `week` (ISO weeks) or `month`. |
| `timezone` | yes | An IANA name such as `Europe/Berlin`. The period is worked out in this zone. |
| `mode` | yes | `update` rewrites the same file each period; `series` keeps one per period. |
| `target` | yes | The entry file. In `series` mode it must contain `{period}`, e.g. `.open-design/social-week/{period}/posts.html`. |
| `outputs` | yes | Export formats, possibly `[]`: `html`, `standalone`, `site`, `email`, `paste`, `png`, `jpeg`, `pdf`, `pptx`, `mp4`, `webm`, `gif`. |
| `designSystemId` | no | The design system to use. |
| `sources` | no | Workspace paths, or `{ connector, snapshot }`: what to pull through a connector and the workspace file the data is saved to. A pull that fails ends the run `failed` before any design work. |
| `deliver` | no | `preview` (the default: the private Claude artifact), `commit`, `pr`, or `{ connector: "<what to do>" }`. Public publish providers and social posting are refused. |
| `checks` | no | `best-effort` (default) or `required`: a run with no browser then ends `needs-review` and holds back the PR and connector deliveries. |
| `refresh` | no | `design` (default): each run may rebuild the design. `data`: each run only swaps in the new data and keeps the design exactly as it is (see [Refresh a dashboard's data](#refresh-a-dashboards-data)). |
| `rebuildOnSourceChange` | no | Default `true`: a source that changed since this period's completed run starts a new run. |
| `preview.url` | no | The private artifact every run republishes. The supervised first run records it. |
| `cloud.stateBranch` | no | Where cloud runs keep their state. Default `claude/open-design-job-<id>`. |

Every problem is reported by field name before anything runs.

**A weekly social batch** keeps each week's posts:

```markdown
---
id: social-week
title: LinkedIn posts for next week
recipe: open-design-social-post
period: week
timezone: America/New_York
mode: series
target: .open-design/social-week/{period}/posts.html
outputs: [png]
sources: [CHANGELOG.md]
deliver:
  - preview
  - connector: Post the preview link and the PNG paths to #marketing in Slack
---

Five LinkedIn posts, one per notable change in CHANGELOG.md since last week,
in the brand's voice. Square cards, one headline and one line of body each.
```

Nothing gets posted to LinkedIn: the run ends with the files and a private preview for a person to post.

## Refresh a dashboard's data

A [dashboard](dashboards.md) usually keeps its design and needs only next week's numbers. Give its job `refresh: data`:

```markdown
---
id: weekly-dashboard
title: Weekly KPI dashboard
recipe: open-design-dashboard
period: week
timezone: Europe/Berlin
mode: update
refresh: data
target: .open-design/kpi-dashboard/kpi-dashboard.html
outputs: [pdf]
sources: [data/kpis.csv]
---

The leadership dashboard: revenue, new customers and churn for the latest week
against the week before.
```

Each run then:

- sets `asOf` in the dashboard's data file to the end of the week (or the newest date in the data, when later), so the "as of" line is right;
- checks that the new data still has every collection and column the page binds and charts. A renamed or missing column, or an empty list, stops the run before anything changes and records it `needs-review` with `data-shape-changed`, so a person fixes the data or updates the design;
- updates only the data files (replace `data/kpis.csv`, or the connector snapshot), never the page. Finish compares the page and its shared fragments with how they were at the start and reports `refresh-edited-page` if anything changed;
- checks, exports and republishes as usual, and the summary lists each KPI with its change from the last completed run.

## What a run does

The scheduler's prompt is one line:

> Run the Open Design job `.open-design/jobs/weekly-kpis.job.md`

The agent calls [`start_open_design_job_run`](../reference/tools.md#start_open_design_job_run), which returns `skip` (and the run ends there) or a run id with the steps to follow: pull connector data into its snapshots, follow the recipe without asking questions, check the design when a browser is available, export, and republish the preview. [`finish_open_design_job_run`](../reference/tools.md#finish_open_design_job_run) then checks the result without a browser (missing files, empty `data-od-field` elements, leftover `{{`, `TODO` or Lorem ipsum, numbers found in no source, and the artifact size limits), records the run in `.open-design/jobs/<id>.runs.json` (newest first, the last 52 runs), and returns a one-paragraph summary.

A run is recorded `completed` only when those checks find no errors; otherwise it's `needs-review`, and the PR and connector deliveries wait for a person.

## Claude Code cloud scheduled tasks

[Cloud scheduled tasks](https://code.claude.com/docs/en/routines) (claude.ai/code/routines, or `/schedule` in Claude Code) run in Anthropic's cloud from a fresh clone of your repository, whether or not your computer is on. They're the most reliable choice.

1. In the repository, run `npx @feimacode/open-design-agent-kit init --tool claude` and commit `.mcp.json` and `.claude/skills/`. A cloud run gets the Open Design tools only through these files. See [the CLI reference](../reference/cli.md#init).
2. Commit the job file, after its supervised first run, so `preview.url` is in it.
3. Create the scheduled task with the one-line prompt above. Schedule it a few minutes past the hour and mid-period (Tuesday morning rather than Monday 00:00), since cloud runs can start late. Runs are at most hourly.

**State branch.** Each cloud run starts from the default branch, so the run log would be lost. The first step of a cloud run checks out the job's state branch (`claude/open-design-job-<id>`, or `cloud.stateBranch`), merges the default branch into it, and the run pushes the log and outputs back there at the end. With `deliver: [pr]` it also opens or updates a pull request from that branch. Merge that PR now and then so the branch doesn't drift.

**No browser by default.** The cloud image has no Chrome, so PNG, JPEG, PDF, PowerPoint and video outputs are recorded as `skipped: no-browser`, the visual check doesn't run, and the summary says so. The HTML, the `standalone` file and the private preview are made either way. To add a browser, put this in the environment's [setup script](https://code.claude.com/docs/en/cloud-environments):

```bash
npx -y @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer
```

The exporter looks in `~/.cache/puppeteer` by itself. This hasn't been verified end to end in the cloud image yet: the headless shell may also need system libraries such as `libnss3` (`apt-get install -y libnss3 libatk-bridge2.0-0 libgbm1 libasound2t64`). The default network allowlist includes the hosts it downloads from.

## Claude Desktop local scheduled tasks

[Local scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) (Code tab, **Routines**, **New**, **Local**) run on your computer, with your local files, the Open Design plugin and your installed Chrome, so captures work out of the box.

- They run only while the app is open and the computer is awake. A missed run gets one catch-up run; if that period is already done, the job skips it.
- After creating the task, click **Run now** once and approve each tool it asks for, choosing to always allow. Later runs then aren't stopped by a permission prompt.
- Point the task at the folder with the job file.

## /loop

[`/loop`](https://code.claude.com/docs/en/scheduled-tasks) repeats a prompt inside an open Claude Code session, as often as every minute. It's for trying a job out: it runs only while the session is open, has the session's browser (if any), and its recurring tasks expire after 7 days.

```text
/loop 1h Run the Open Design job .open-design/jobs/weekly-kpis.job.md
```

## Cowork scheduled tasks

Not supported yet. [Cowork scheduled tasks](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork) run in the cloud, where local MCP servers such as the Open Design plugin's aren't available, so the job tools are missing. Use a Claude Code cloud task or a Claude Desktop local task instead.

## GitHub Actions

For a design that stays fixed while only its data changes, you don't need an agent at all: a [scheduled workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule) can re-export it with the CLI, one file per row of a data file. Runner images usually ship Chrome, and the [social media pipeline](../automation/social-pipeline.md#ci-setup) shows the setup.

```yaml
on:
  schedule:
    - cron: '15 7 * * 2'
jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx @feimacode/open-design-agent-kit export .open-design/name-cards/name-cards.html --data data/attendees.csv
```

## Related

- [Dashboards](dashboards.md)

[Tools: start_open_design_job_run](../reference/tools.md#start_open_design_job_run) · [Turn a document into a deck](deck-from-a-document.md) · [Social media posts](social-posts.md) · [Share and publish](share-and-publish.md)
