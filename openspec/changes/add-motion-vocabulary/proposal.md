Roadmap area: Design systems

## Why

A design system in the kit holds three motion tokens: `--motion-fast`, `--motion-base` and `--ease-standard`. They are in 159 of the 198 bundled systems, and the token schema requires all three. Three values can describe a hover. They can't describe how a brand moves: "cards rise 24 px over 600 ms, 80 ms apart, on a soft spring" has no token to live in.

The kit already measures this. Runtime motion extraction (`add-runtime-motion`) records what moves on a site, and `brandKit.motion` keeps the hover, entrance, load and reduced-motion facts. But the brief never turns them into rules, so a design made for that brand moves like any other design. Video skills (`video-hyperframes`, `remotion`, `frame-*`) get no motion guidance from the design system at all. They get none from the kit's craft docs either: `animation-discipline.md` covers UI motion, not films.

Other tools now treat motion as part of the design system. Figma Motion has motion variables, so an easing is defined once and changes everywhere ([Figma blog](https://www.figma.com/blog/introducing-figma-motion/)). Upstream open-design shipped a `motion-design` craft skill in v0.25 to v0.27 (Apache-2.0), with beat maps, timing ranges and a review routine for films. The kit is pinned to upstream v0.24.1, so it has none of it.

Source: motion design study, 17 November 2026, recommendation 1 and the upstream review. This also picks up "motion as two dials, speed and bounce" (Astryx study, item 4) from Later.

## What Changes

- **A motion vocabulary, derived, not stored.** The token schema is vendored and stays unchanged. At resolve time, `resolveDesignSystemTokens()` derives an extended set from the three core tokens plus two dials:
  - durations: `--motion-instant`, `--motion-fast`, `--motion-base`, `--motion-slow`, `--motion-scene` (a ratio scale from `--motion-fast`);
  - easings: `--ease-standard`, `--ease-enter`, `--ease-exit` and `--ease-spring` (a `linear()` curve);
  - choreography: `--motion-stagger` and `--motion-distance` (how far things travel when they enter).
- **Two dials.** `speed` (0.5 to 2, multiplies durations) and `bounce` (0 to 1, shapes `--ease-spring` and the overshoot of `--ease-enter`). A system sets them as `--motion-speed` and `--motion-bounce` in its tokens, or they default to 1 and 0.2. A tweak in the preview can change either dial for one design.
- **Measured brands fill the vocabulary.** When `brandKit.motion` exists, its entrance distance, duration and stagger set `--motion-distance`, `--motion-slow` and `--motion-stagger`, and the source of each value says `observed`. A brand that showed no motion gets `--motion-bounce: 0` and a note that the site is still.
- **The brief states motion rules.** `prepare_open_design_brief` adds a short Motion section when the skill animates anything: the vocabulary with values, the entrance recipe in one line ("sections fade and rise 24 px over 600 ms, 80 ms apart"), the reduced-motion rule, and "use these tokens; don't invent durations or easings".
- **A craft doc for films.** New overlay craft doc `motion-film.md`, adapted from upstream's `motion-design` skill (Apache-2.0, credited in the doc's header): resolve the brief, a beat map (`time → takeaway → focal object → transformation → copy/sound → exit`), one strong still before movement, timing ranges, and checking key moments. It is attached through `craft-requires.json` to the video skills, so upstream files stay unedited. When the sync pin later moves past v0.25, the content check reports the overlap so the doc can be dropped or kept.
- **Claude Design and exports carry it.** Claude Design has no motion token family, so the Claude Design builds and `export_open_design_design_system` list the vocabulary with its values in the README's Motion section. DESIGN.md is unchanged; the brief carries the values.

Not in this change: new tokens in the vendored schema, Lottie, and motion checks (see `add-motion-checks-and-steering`).

## Capabilities

### New Capabilities
- `design-system-motion`: the derived motion vocabulary, the two dials, how measured motion fills it, the brief's Motion section and the film craft doc.

### Modified Capabilities
- `design-system-extraction`: an extracted brand writes its motion facts into the vocabulary, with sources.

## Impact

- `packages/core`: `content/` token resolution (derive block), new `generation/motionVocabulary.ts`, `generation/evidenceToTokens.ts`, the brief builder, design-system export and Claude Design builds.
- `packages/content/local`: `craft/motion-film.md`, `craft-requires.json` entries for video skills, with the upstream source credited in the doc; an overlap check in the sync.
- Preview tweaks: two dials.
- Docs: design systems reference, `brand.json` reference, CHANGELOG, roadmap.
