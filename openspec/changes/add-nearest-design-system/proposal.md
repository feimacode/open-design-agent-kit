## Why

The recommender (`add-design-system-matching`) ranks the 198 bundled systems by what the brief says: moods, industries, surfaces and named look-alikes (`likeBrands`). It can't answer two questions that come up around extraction:

- **"Something like our site, but not a copy."** A user who extracted a reference site often wants a starting point with the same feel and none of the brand. Today the agent can only guess from names.
- **"How far is this from what we have?"** After an extraction, nothing says whether one of our bundled systems is already close, or how the site differs from a typical system: much rounder, much denser, an unusually saturated accent.

design-extract's `dna` reduces a design to 30 measured features across colour, type, space, shape and motion, and ranks it against a corpus. Three of its rules are worth keeping. A missing measurement stays missing, never a made-up midpoint. Each distance says how many features backed it. And the feature space is versioned, so vectors built by different rules are never compared.

## What Changes

- **A style vector.** About 20 features read from a `tokens.css`, the same way for a bundled system, a user system and an extraction draft:
  - colour: accent hue, accent chroma, background lightness, text-to-background contrast, dark or light, number of chromatic tokens;
  - type: display and body font category (serif, sans, mono, display, script), type scale ratio, base size, display tracking;
  - space: spacing base, section padding, container width;
  - shape: button and card radius, shadow strength, border use;
  - motion: base duration.
  Each feature is normalised to 0–1 over the bundled set. A token that is missing gives null, and nothing is substituted for it. The vector carries a version.
- **An index.** The build that writes the design system profiles also writes each bundled system's vector. User systems get theirs when saved.
- **Nearest systems after an extraction.** The extraction result gains `nearest`: the three closest bundled systems. Each comes with its distance (the mean absolute difference over the features both have), how many features backed it, and the axes where they differ most, in plain words ("much rounder corners", "warmer accent"). When the draft is too thin (fewer than 8 features), `nearest` is left out and the result says why.
- **"Like this one" in the recommender.** `recommend_open_design_design_systems` gains `like`: a design system id, or the `bundleDir` of an extraction. It ranks by vector distance, combined with the brief's other signals. For an extraction of a reference site, the skill offers the nearest bundled systems as starting points that carry none of the site's brand.
- **What makes it distinctive.** Beside `nearest`, the result lists the 3 features furthest from the middle of the bundled set ("card radius in the top 5% of our systems"). DESIGN.md's opening line can use it.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-matching`: a versioned style vector for every system, and a `like` input ranking by it.
- `design-system-extraction`: the result's `nearest` systems and distinctive features.

## Impact

- New `packages/core/src/content/styleVector.ts`: features, normalisation, distance, version.
- The design system profile build (content package): vectors in the profile index; user systems vectorised on save.
- `designSystemMatching.ts` and the recommend tool (MCP, VS Code, gateway): the `like` input.
- `siteExtraction.ts` and `sourceDraft.ts` results: `nearest` and `distinctive`.
- Skill: offer nearest bundled systems for reference sites; use distinctive features in DESIGN.md.
- Tests: vectors of known systems; a draft with missing tokens; version mismatch refused.
- Docs: tools reference, design systems guide.
