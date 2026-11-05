## 1. Calibration set and run

- [ ] 1.1 Hand-made list (about 40) and AI-default list (about 30) with dates and reasons; cached screenshots and HTML
  - Note: `handmade.json` has 40 sites with reasons and dates (`verified: null`). `ai-default.json` is empty: its pages need collecting from site builders, AI app builders and an unguided `npm run evals` run on a machine with network access. The cache is written by online runs to `cache/` and git-ignored (screenshots of 70 pages are too heavy for the repo); `--offline` replays it.
- [x] 1.2 `calibrate:taste` runner: per-rule false-alarm and hit rates, pages fired on; results markdown
- [ ] 1.3 `taste-calibration.json` with the latest rates, checked in
  - Note: the file is checked in with `calibratedAt: null`; the first run needs network access (the container this was built in blocks public sites). Until it is committed, every taste rule on a live site is a note, as the spec requires of a rule with no measured rate.

## 2. Audit

- [x] 2.1 Rules above 5% false alarms are notes on live sites (or tuned until they pass); report names the calibration date
- [x] 2.2 Single taste findings titled by what was measured; "template look" only with two or more different taste findings on a page
  - Note: the two counted findings are the template tells (`slop-glow`, `card-row`, `uniform-surface`); `intent` is a taste rule held to the same bar but is not a sign of a template.

## 3. Process and docs

- [x] 3.1 Runs with the scheduled benchmark job and when a taste rule changes
- [x] 3.2 Site audit guide and contributing guide
