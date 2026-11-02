## Context

The extraction already marks role elements, crops them and keeps images the page loaded (up to 60, 1 MB each). User design systems are folders with `DESIGN.md`, optional `tokens.css` and, for own brands, `assets/` with copied marks. Nothing machine-readable says whether a system is someone's own brand.

## Goals / Non-Goals

**Goals:** everything a designer would ask for in a brand kit that a page shows, recorded with where it came from; licensing handled honestly; one file other tools can read.

**Non-Goals:** inferring brand strategy, audiences or values; copying page text into designs; downloading fonts from licensed foundries; image generation in the brand's style.

## Decisions

### `brand.json`, not more DESIGN.md parsing

DESIGN.md stays the prose source for agents. Structured facts (own or reference, marks, fonts) are needed by code: the recommender, the check, the Claude Design exporter. A small JSON beside DESIGN.md with a `version` field keeps them out of Markdown parsing. Bundled systems don't have one; every reader treats it as optional.

### Component specs are evidence, not tokens

The token contract has no component tokens, and adding them would touch every bundled system. Specs go into `brand.json` and as numbers into DESIGN.md's Components section, which the instructions already include in briefs. The review page uses them so its buttons and inputs look like the site's.

### Fonts: say, don't solve

The tool cannot know a licence. It reports the source; a self-hosted family is "may be licensed". The suggested free match comes from a short reviewed table (about 40 common brand faces) plus a classification fallback, so suggestions are predictable. Copying font files needs the person's explicit yes in the skill, and never happens for reference sites.

### Voice facts are counted, tone is written

Case, sentence length, person, exclamation and emoji are counted from samples, so they are stable. The model writes the tone description from them and the samples. The 1,500-character cap keeps evidence small and avoids copying a page's content wholesale.

### Imagery by cheap signals

Photo vs illustration uses element and file type (video, SVG, PNG with few colours, JPEG/WebP with many) on the hero media. It is a hint for DESIGN.md, labelled as such.

## Risks / Trade-offs

- Icon-set detection misses custom sprites. Mitigation: "custom" is a valid result, with the stroke width still measured from the SVGs.
- Dark logo variants are often swapped by script, not CSS. Mitigation: the logo is read again in each theme pass the extraction already runs; if it doesn't change, only one is recorded.
- A free font match can still look off. Mitigation: the review page renders with it and says so; the person can choose another.
