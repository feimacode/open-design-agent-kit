## 1. Vocabulary

- [x] 1.1 `generation/motionVocabulary.ts`: derive durations, easings (`linear()` spring with `cubic-bezier` fallback), stagger and distance from the core tokens and the two dials; unit tests at dial extremes
- [x] 1.2 Append the derived block in `resolveDesignSystemTokens()` without overriding declared names; dials read from `--motion-speed` and `--motion-bounce` tokens and clamped
- [x] 1.3 Measured brands: `evidenceToTokens.ts` fills distance, slow and stagger from `brandKit.motion`, with `observed` sources; still sites get `--motion-bounce: 0` and a note

## 2. Brief and craft

- [x] 2.1 Motion section in the brief for skills that animate (video mode, `frame-*`, motion examples, pages with entrances): values, entrance recipe line, reduced-motion rule, "use these tokens"
- [x] 2.2 `local/craft/motion-film.md` adapted from upstream `motion-design` (pin the source commit); source credited in the doc header; `craft-requires.json` entries for video skills; content check reports an upstream `motion-design` skill once the pin includes one

## 3. Out of the kit

- [x] 3.1 README Motion section with the vocabulary in `export_open_design_design_system` and the Claude Design builds (no motion family in Claude tokens)
- [x] 3.2 Preview tweaks: `speed` and `bounce` dials for one design

## 4. Tests and docs

- [x] 4.1 Fixtures: a bundled system with no overlay, a system declaring `--motion-slow`, an extracted brand with staggered reveals, a still brand
- [x] 4.2 Two eval briefs (a launch film, a landing page with entrances) checking that only vocabulary values appear
- [x] 4.3 Docs: design systems reference, `brand.json` reference, CHANGELOG
