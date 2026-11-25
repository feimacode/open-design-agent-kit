## 1. Job file and run

- [x] 1.1 `refresh: data | design` in `jobFile.ts` (default `design`); validation and tests
- [x] 1.2 Data-only steps in `jobRun.ts`: update data files from sources, don't edit the page, register, check, export
- [x] 1.3 Entry and shared fragment hashes at start; `refresh-edited-page` at finish
- [x] 1.4 `data-shape-changed` at start and finish: missing bound columns or empty collections end the run `needs-review`
- [x] 1.5 `asOf` set from the period end or the newest date in the data

## 2. Summary

- [x] 2.1 KPI values stored in the run log; summary lists new values and change from the last completed run

## 3. Recipes and docs

- [x] 3.1 Dashboard recipe hand-off and recurring set-up writing `refresh: data`
- [x] 3.2 `docs/guides/recurring-jobs.md` dashboard example, CHANGELOG
- [ ] 3.3 Live check: a weekly dashboard job run twice in a Claude Code cloud scheduled task, with the CSV changed between runs (Needs a server release with this change. Unit tests cover two runs with the CSV changed between them.)
