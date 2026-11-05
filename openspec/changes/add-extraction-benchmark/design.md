## Context

The kit already has `evals/` for design output (briefs run through an agent and scored by the kit's own checks). Extraction needs no agent: the core function runs directly on a URL, so a benchmark is cheap to run and deterministic apart from the sites themselves changing.

## Decisions

### Truth is what the page paints, from an official source

A brand guide's colour that the homepage no longer paints would penalise the extractor for the site's own drift. The truth therefore needs both conditions: an official source (brand page, design system docs, press kit), and the colour painted on the page within ΔE 3. Sites where only aggregators give a hex are kept for fonts, with colour unscored. This is design-extract's rule; it is sound, so we keep it.

### ΔE 10 for a hit, CIEDE2000

Brand blues one step apart on a palette sit well above 10, and anti-aliasing and rounding sit well below it. We use CIEDE2000 rather than design-extract's CIE76, because CIE76 overstates differences in saturated blues. Results state the metric so the two tools' numbers aren't compared as like for like.

### Score the draft, not a picked candidate

The benchmark reads `draft.tokens['--accent']` and `--font-body` exactly as the agent sees them. A right answer buried in candidates doesn't count. That is what `add-accent-candidates` is for, and the benchmark will show whether it helps.

### Off the container

The cloud container's network policy blocks most public sites, and live sites change. The runner is a script anyone can run on their machine, plus a scheduled GitHub Actions job. Results are committed, so a regression has a dated, reproducible record.

### Held-out set

Tuning on a fixed list overfits it. A held-out set that no change may be tuned on keeps the main number honest. It is reported, never used to justify a scoring change.

## Risks

- Sites block headless browsers or change. A site blocked twice in a row is marked `blocked` and left out of the score, and the evidence is re-collected quarterly.
- Licensing: design-extract's data is MIT; we credit it and re-verify every entry instead of copying values blind.
