## ADDED Requirements

### Requirement: Derived Motion Vocabulary

Resolving a design system's tokens SHALL append a derived motion block with `--motion-instant`, `--motion-fast`, `--motion-base`, `--motion-slow`, `--motion-scene`, `--ease-standard`, `--ease-enter`, `--ease-exit`, `--ease-spring`, `--motion-stagger` and `--motion-distance`. Durations SHALL follow a fixed ratio of the system's `--motion-fast` and `--motion-base`, scaled by the `speed` dial and rounded to 10 ms. A name the system already declares SHALL keep its declared value. The vendored token files and schema SHALL NOT be changed.

#### Scenario: Bundled system with only core tokens
- **WHEN** a system declares `--motion-fast: 150ms` and `--motion-base: 200ms` and no motion dials
- **THEN** the resolved tokens SHALL include `--motion-slow: 400ms` and `--motion-scene: 800ms`, and its `tokens.css` SHALL be unchanged on disk

#### Scenario: System declares its own slow duration
- **WHEN** a system's `tokens.css` declares `--motion-slow: 500ms`
- **THEN** the resolved `--motion-slow` SHALL be `500ms`

### Requirement: Speed and Bounce Dials

A design system's tokens MAY set `--motion-speed` (0.5 to 2, default 1) and `--motion-bounce` (0 to 1, default 0.2); values outside the range SHALL be clamped. `speed` SHALL multiply every derived duration. `bounce` SHALL set the overshoot of `--ease-spring`, written as a `linear()` curve with an `@supports` fallback to a `cubic-bezier` for engines without `linear()`, and of `--ease-enter`. The preview's tweaks SHALL offer both dials for one design without changing the system.

#### Scenario: Calm brand
- **WHEN** a system sets `--motion-speed: 1.5` and `--motion-bounce: 0`
- **THEN** derived durations SHALL be 1.5 times the defaults and `--ease-spring` SHALL not overshoot

### Requirement: Motion Rules in the Brief

When the chosen skill animates (video mode, a motion example or template, or a page with entrance motion), `prepare_open_design_brief` SHALL include a Motion section listing the vocabulary with its values, a one-line entrance recipe, the reduced-motion rule, and an instruction to use these tokens instead of new durations or easings. Briefs for still designs SHALL NOT include it.

#### Scenario: Poster without animation
- **WHEN** a brief is prepared for a static poster skill
- **THEN** it SHALL contain no Motion section

#### Scenario: Launch film for an extracted brand
- **WHEN** a brief is prepared for `video-hyperframes` with a brand whose cards rose 24 px over 600 ms, 80 ms apart
- **THEN** the Motion section SHALL state that entrance recipe and the matching token values

### Requirement: Film Craft Doc

The content overlay SHALL provide a `motion-film` craft doc adapted from upstream open-design's `motion-design` skill, credited in the doc's header with its source commit. It SHALL be attached to video skills through `craft-requires.json`, leaving upstream files unedited. The content check SHALL report when the vendored upstream content also contains a `motion-design` skill.

#### Scenario: Video skill loads the doc
- **WHEN** the content for `video-hyperframes` is loaded
- **THEN** its craft list SHALL include `motion-film`
