## 1. Vocabulary

- [ ] 1.1 `generation/motionVocabulary.ts`: derive durations, easings (`linear()` spring with `cubic-bezier` fallback), stagger and distance from the core tokens and the two dials; unit tests at dial extremes
- [ ] 1.2 Append the derived block in `resolveDesignSystemTokens()` without overriding declared names; overlay `motion` block (`speed`, `bounce`) read and validated by the sync
- [ ] 1.3 Measured brands: `evidenceToTokens.ts` fills distance, slow and stagger from `brandKit.motion`, with `observed` sources; still sites get `bounce: 0` and a note

## 2. Brief and craft

- [ ] 2.1 Motion section in the brief for skills that animate (video mode, `frame-*`, motion examples, pages with entrances): values, entrance recipe line, reduced-motion rule, "use these tokens"
- [ ] 2.2 `local/craft/motion-film.md` adapted from upstream `motion-design` (pin the source commit); notice file; `craft-requires.json` entries for video skills; content check reports an upstream `motion-design` skill once the pin includes one

## 3. Out of the kit

- [ ] 3.1 Derived block in `export_open_design_design_system` and the Claude Design builds; DESIGN.md Motion section lists the vocabulary
- [ ] 3.2 Preview tweaks: `speed` and `bounce` dials for one design

## 4. Tests and docs

- [ ] 4.1 Fixtures: a bundled system with no overlay, a system declaring `--motion-slow`, an extracted brand with staggered reveals, a still brand
- [ ] 4.2 Two eval briefs (a launch film, a landing page with entrances) checking that only vocabulary values appear
- [ ] 4.3 Docs: design systems reference, `brand.json` reference, CHANGELOG
