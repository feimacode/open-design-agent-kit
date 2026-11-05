## Why

The extraction has fixtures that prove each rule works on a page built for it. Nothing measures how often it gets a real brand right. Every change to role scoring (overlay hiding, the gradient rule, declared-property matching, coverage voting) is judged by its fixture alone. A change can fix one site and break three, and nobody would see it.

design-extract keeps a ground-truth benchmark: [bench/sites.json](https://github.com/Manavarya09/design-extract/blob/main/bench/sites.json), with about 56 sites plus a held-out set, collected on 2026-11-04. Two things make it honest:

- The brand colour counts only if it is officially sourced **and** painted on the live homepage within ΔE 3. Old brand colours that a site no longer uses (#635bff at stripe.com) don't count against the tool.
- The body font is the first family in the computed stack with a loaded face.

Its published result is sobering: 53% of primary colours right for designlang and 71% for dembrandt, against 93% for body fonts. The brand colour is the hard part, and a benchmark is the only way to know where we stand.

## What Changes

- **A site set with ground truth** in `evals/extraction/sites.json`. For each site it records: the brand colours that are officially sourced and painted on the homepage (ΔE ≤ 3 at 1440×900), the body font as rendered, the background and text colours where unambiguous, the source links, an evidence line and the date collected. The first version starts from design-extract's MIT-licensed list, credited in the file. Every entry is re-checked with our own evidence script and re-dated. A separate `holdout.json` holds sites that no extraction change may be tuned on.
- **An evidence script** (`npm run bench:evidence -- stripe.com=#533afd`). It renders each site and reports, for each claimed colour, the closest painted colour with its ΔE and painted area, and the rendered body font. It uses only the page, not the extractor's own heuristics.
- **A runner** (`npm run bench:extraction`) that runs `extract_open_design_design_system`'s core on every site, one at a time, and scores:
  - `--accent`: a hit within ΔE 10 (CIEDE2000) of any listed brand colour; not scored for sites with none (monochrome brands);
  - `--font-body`: a hit when the normalised family names match (`Inter Variable` = `Inter`, `sohne-var` = `Söhne`);
  - `--bg` and `--fg`, where the truth lists them;
  - failures, blocked pages and time.
- **Published results.** Results are written to `evals/extraction/results/<date>.{json,md}`, losses included, with the browser version and the kit version. The markdown lists every site with its truth and our value.
- **A regression gate for extraction changes.** A PR that changes role scoring runs the benchmark before and after, on a machine with network access, and pastes the summary into the PR. A drop of 2 or more hits on the main set needs a reason. The held-out set is run only to report, never to tune.
- **A scheduled run.** A GitHub Actions workflow runs weekly and on demand, since sites change and the container's network policy blocks them. It opens an issue when hits drop.

## Capabilities

### New Capabilities
- `extraction-benchmark`: a ground-truth site set, evidence and scoring scripts, published results and the rule for using them on extraction changes.

### Modified Capabilities
None.

## Impact

- New `evals/extraction/` with `sites.json`, `holdout.json`, `evidence.ts`, `run.ts`, `score.ts` (pure scoring, unit-tested) and `results/`.
- Root `package.json` scripts `bench:evidence` and `bench:extraction`.
- `.github/workflows/extraction-benchmark.yml`: weekly and `workflow_dispatch`, uploads results and opens an issue on regression.
- `docs/contributing/README.md`: when an extraction PR needs a benchmark run, and how to add a site.
- Attribution to design-extract (MIT) in `evals/extraction/README.md` and the data file.
