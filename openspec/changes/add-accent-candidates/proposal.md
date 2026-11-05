## Why

The draft's `--accent` is the fill of one button: the highest score of size × above-the-fold × button-like name × (0.4 + HSV saturation), in `siteExtraction.ts`. When that pick is wrong, nothing says how close the call was or what else was in the running, so the agent can't ask the user only when it matters. Three weaknesses are visible in the rule:

- **HSV saturation calls near-black colourful.** `#002533` has an HSV saturation of 1.0. design-extract hit the same trap at supabase.com: it drafted `#002533` against a brand of `#3ecf8e`. Perceptual chroma (OKLCH C) puts it near zero.
- **One button decides.** A large dark "Sign in" button above the fold can outscore the brand's green "Start your project". The colour that recurs across buttons, links and icons gets no credit.
- **The site's own naming isn't used to choose.** Since `extend-site-extraction`, a declared `--color-brand` or `--primary` is matched after the fact. It never votes. design-extract's ranking counts a colour the site's CSS calls brand, primary or accent as strong evidence, with accent weighted 0.6.

design-extract's published ranking also exposes its reasoning: the top candidates with each one's score, and a confidence taken from the gap between first and second.

## What Changes

- **Rank accent candidates, not buttons.** Filled controls are grouped by colour (ΔE 2000 under 5 is the same colour). Each colour is scored from:
  - the area and fold position of its best control (as now);
  - how many controls and links use it;
  - perceptual chroma in OKLCH, so near-black and near-grey score low;
  - a vote when a declared custom property named brand, primary or accent (weight 1, 1 and 0.6, by the same name table as `sources`) has that value;
  - a vote when the logo's dominant non-neutral colour matches it.
  The weights are fixed constants, tuned only with `add-extraction-benchmark` and reported there.
- **A colour must be vouched for.** Every scored colour must be backed by at least one filled control or one declaration. A colourful decoration alone can't win.
- **Candidates and confidence in the draft.** `draft.sources['--accent']` gains `choiceConfidence` (0–1, from the gap between first and second, and from whether a control backs the winner) and `candidates`: the top 4 colours with score, chroma, number of controls, declaration name and crop. Crops of the runner-ups go in the bundle.
- **The skill asks when unsure.** With confidence below 0.5, the design-system skill shows the user the top candidates as swatches with their crops and asks which is the brand's, instead of drafting silently.
- The formatted result lists the candidates in one line: `accent #3ecf8e (0.82), then #002533, #6366f1`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: accent candidates ranked by evidence, with confidence and candidates in the draft.

## Impact

- `packages/core/src/generation/siteExtraction.ts`: in-page candidate grouping and scoring, logo colour, runner-up crops.
- `packages/core/src/generation/evidenceToTokens.ts`: declaration votes, the `confidence` and `candidates` fields, formatted output.
- `packages/content/local/prompts/design-system-from-url.md`: ask with swatches below 0.5.
- Fixtures: a dark sign-in button against a green brand CTA, a declared `--brand` that matches a small button, a near-black "saturated" button, a decorative gradient blob. Benchmark summary before and after (`add-extraction-benchmark`).
- Docs: `docs/reference/tools.md` (the new fields).
