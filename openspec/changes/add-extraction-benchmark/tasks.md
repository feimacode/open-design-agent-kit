## 1. Data

- [ ] 1.1 `evals/extraction/evidence.ts`: per site, closest painted colour to each claim (ΔE, area) and the rendered body font
- [ ] 1.2 `sites.json` from design-extract's list (credited), every entry re-checked with the evidence script and re-dated; `bg` and `fg` truth where unambiguous
- [ ] 1.3 `holdout.json` (at least 15 sites), never used to tune

## 2. Runner and scoring

- [ ] 2.1 `score.ts`: CIEDE2000 colour hit at ΔE 10, normalised font match, null when no truth; unit tests
- [ ] 2.2 `run.ts`: runs the core extraction per site with a timeout, retries once on a network error, writes `results/<date>.{json,md}` with versions
- [ ] 2.3 Root scripts `bench:evidence` and `bench:extraction`

## 3. Process

- [ ] 3.1 `.github/workflows/extraction-benchmark.yml`: weekly and on demand; artifacts; an issue when hits drop by 2 or more
- [ ] 3.2 Contributing guide: extraction PRs paste before and after summaries; adding and re-checking a site
- [ ] 3.3 First baseline run committed (from a machine with network access)
