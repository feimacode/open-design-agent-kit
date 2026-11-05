## ADDED Requirements

### Requirement: Ground-Truth Site Set

The repository SHALL keep a list of real sites, each with: brand colours that are officially sourced and painted on the homepage within ΔE 3 at 1440×900; the body font as rendered (the first family in the body text's computed stack with a loaded face); the source links; an evidence line; and the date collected. A site whose brand colour is not painted, or is published only by third-party aggregators, SHALL have no colour truth. A separate held-out list SHALL follow the same rules.

#### Scenario: Retired brand colour
- **WHEN** a brand page lists `#635bff` but the homepage paints `#533afd` and nothing within ΔE 3 of `#635bff`
- **THEN** the site's colour truth is `#533afd` only

#### Scenario: Monochrome brand
- **WHEN** a brand has no official colour beyond black and white
- **THEN** its colour truth is empty and colour is not scored for it

### Requirement: Benchmark Scoring

The benchmark SHALL run the extraction on every listed site and score the draft's `--accent` as a hit when it is within ΔE 10 (CIEDE2000) of any truth colour, and `--font-body` as a hit when its first family matches a truth font after normalising case, accents, separators and `variable`/`var`/`vf` suffixes. A dimension with no truth SHALL be left out of that dimension's total. A failed or blocked run SHALL count as a miss wherever truth exists, and SHALL be reported as failed or blocked.

#### Scenario: Font name variants
- **WHEN** the truth font is `Söhne` and the draft's body font is `"sohne-var", sans-serif`
- **THEN** the font is a hit

#### Scenario: Wrong accent
- **WHEN** the truth is `#5e6ad2` and the draft's `--accent` is `#e4f222`
- **THEN** the colour is a miss, and the results list both values

### Requirement: Published Results

Each run SHALL write a dated JSON and markdown result with the kit version, browser version, hit counts, failures, median time and every site's truth beside the extracted values. Losses SHALL be included.

#### Scenario: Result file
- **WHEN** the benchmark finishes
- **THEN** `evals/extraction/results/<date>.md` lists every site, with a mark for each hit and miss

### Requirement: Benchmark Gates Extraction Changes

A change to the extraction's role scoring SHALL include benchmark summaries from before and after the change on the main set. A drop of two or more hits SHALL be explained in the change. The held-out set SHALL be reported but SHALL NOT be used to tune a scoring rule.

#### Scenario: Regression explained
- **WHEN** a scoring change gains three accent hits and loses two others
- **THEN** the PR states which sites were lost and why the trade is accepted
