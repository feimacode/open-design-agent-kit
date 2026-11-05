# Extraction benchmark

Real websites with known brand colours and body fonts, used to measure how often `extract_open_design_design_system` gets them right. It runs the kit's extraction directly (no agent, no model tokens) and scores the draft exactly as the agent sees it.

```bash
npm run bench:extraction                                  # both sets, writes results/<date>.json and .md
npm run bench:extraction -- --only stripe.com,linear.app  # some sites
npm run bench:extraction -- --set main --label "after add-accent-candidates" --compare evals/extraction/results/2026-11-05.json
npm run bench:evidence                                    # re-check every site's truth against the live page
npm run bench:evidence -- --only stripe.com --write       # and date the entries that still hold
```

Both need network access to the public sites and a Chrome, Edge or Chromium (or `OPEN_DESIGN_BROWSER_PATH`). They don't run in a sandbox that blocks public sites. A weekly GitHub Actions job ([extraction-benchmark.yml](../../.github/workflows/extraction-benchmark.yml)) runs it too and opens an issue when the main set loses two or more hits.

## What is scored

| Dimension | Token | Hit |
|---|---|---|
| Brand colour | `--accent` | within ΔE 10 (CIEDE2000) of any truth colour |
| Body font | `--font-body` | its first family matches a truth name, ignoring case, accents, quotes, separators and `variable`/`var`/`vf` suffixes |

A site with no truth for a dimension is left out of that dimension's total. A failed or blocked run counts as a miss wherever truth exists. Only the draft counts: a right answer among candidates is still a miss.

ΔE here is CIEDE2000; design-extract's own numbers use CIE76, so don't compare the two tools' percentages as like for like.

## The sites

- `sites.json`, the main set. Changes are tuned and judged on it.
- `holdout.json`, the held-out set (every sixth site of the source list). It is reported beside the main set and never used to tune or justify a rule.

Each entry:

```json
{ "site": "stripe.com", "url": "https://stripe.com/", "accent": ["#533afd"], "font": ["sohne-var", "Söhne"],
  "sources": ["https://stripe.com/newsroom/brand-assets"], "evidence": "#533afd painted (dE 0); …",
  "collected": "2026-11-04", "verified": null }
```

Truth is what the page paints and an official source states: a brand colour counts only when an official source (brand page, design system docs, press kit) gives it **and** the homepage paints it within ΔE 3 at 1440×900. A brand guide's colour the homepage no longer paints would penalise the extractor for the site's own drift. Monochrome brands, and brands whose colour only aggregators publish, have an empty `accent` and are scored for font only. `font` is the family that renders body copy (the first family in the body text's computed stack with a loaded face), plus the official name where it agrees.

The list and its truth were first collected by [design-extract](https://github.com/Manavarya09/design-extract/blob/main/bench/sites.json) (MIT, © Manavarya09 and contributors) on 2026-11-04. `verified` is the date `bench:evidence --write` last confirmed an entry from this repository; until then an entry is design-extract's word.

## Adding and re-checking a site

1. Find an official source for the brand colour and font (a brand page, design system docs or a press kit; not a colour-aggregator site).
2. Add the entry with `accent`, `font`, `sources` and a one-line `evidence`, then run `npm run bench:evidence -- --only <site>`. It prints the closest colour the page paints to each claim (ΔE and area) and the body font.
3. Keep only the colours painted within ΔE 3; if none is, leave `accent` empty and say why in `evidence`. Then `--write` to date it.
4. Re-check every site each quarter. A site blocked twice in a row moves to `excluded` with the reason.

## Results

`results/<date>.json` has every site's truth beside the drafted value, the kit and browser versions, hit counts, failures and the median time; `results/<date>.md` is the same as tables. Commit both when a run becomes a baseline. Losses stay in.
