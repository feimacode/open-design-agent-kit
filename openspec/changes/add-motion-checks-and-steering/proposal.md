Roadmap area: Design quality and steering

## Why

The kit checks how a design looks: contrast, overflow, taste rules against the generic "AI" look, and accessibility in hover and focus states. It doesn't check how a design moves. The only motion finding is the reduced-motion pass. A page where every card bounces in for 1.2 seconds, a button that eases linearly, or a hero that animates `width` and janks all pass today. The `review-animations` and `emilkowalski-motion` skills describe good motion, but they are advice the agent may or may not read, and nothing measures it.

Steering edits (`add-steering-edits`) let a person say "bolder" or "quieter" about one part of a design and get proof that only that part changed. There is no verb for motion, which is where people most often say "too much", "too slow" or "feels cheap".

The kit already has what this needs. The virtual clock can stop a page at any time, `check_open_design_artifact` takes `at` timestamps, `document.getAnimations()` lists every running animation, and `animation-discipline.md` sets the numeric limits. With `add-motion-vocabulary`, the design system also says which durations and easings are allowed.

Source: motion design study, 17 November 2026, recommendation 3.

## What Changes

- **Motion findings in the check.** For pages and motion designs, the check plays the page on the virtual clock (load, then hover and focus on up to 10 controls, then scroll steps) and reads `getAnimations()`. It reports:
  - `motion-slow-ui` (warning): a hover, focus or state transition over 500 ms;
  - `motion-linear-ui` (warning): `linear` easing on a UI transition that isn't a spinner, progress bar or marquee;
  - `motion-layout-property` (warning): animating `width`, `height`, `top`, `left`, `margin` or `padding` instead of `transform` or `opacity`;
  - `motion-crowded` (warning): more than 6 separate elements starting to move in the same 100 ms outside a stagger;
  - `motion-off-vocabulary` (warning): durations or easings not in the design system's motion vocabulary, beyond a 10% tolerance;
  - `motion-no-reduced-path` (error, extends the existing pass): entrance or looping motion still running with reduced motion on.
  Films (video mode, `data-duration` storyboards) skip the UI rules and get only the vocabulary and crowding rules.
- **A filmstrip.** `check_open_design_artifact` with `filmstrip: true` returns one image of up to 12 frames, labelled with their times. Frames come from beat boundaries (`data-duration` frames, or animation start and end times), not an even grid, so they show the moments that matter. This works with the existing `at` list.
- **Three motion verbs.** Steering edits gain `calmer` (fewer moving things, shorter distances, less bounce), `snappier` (shorter durations, stronger ease-out, no overshoot) and `smoother` (fewer abrupt changes, consistent easing, one easing family). Each has a craft definition and a measured direction read from `getAnimations()` inside the scope. The guard keeps proving that nothing outside the scope changed, on screen and in its motion.
- **Critic sees motion.** The critic gets the filmstrip and the motion findings, so a review can say "the hero and the cards fight for attention at 0.4 s".

Not in this change: judging films for story or pacing (the critic does that), audio checks (see `add-video-sound-and-captions`) and a motion score in evals.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `artifact-visual-check`: motion findings, the filmstrip, and the critic's motion input.
- `steering-edits`: the `calmer`, `snappier` and `smoother` verbs with their measurements.

## Impact

- `packages/core/src/export`: new `motionAudit.ts` (playback on the virtual clock, animation inventory, rules), filmstrip sheet, wiring in `checkArtifact.ts`; `editGuard.ts` motion measurements.
- `packages/content/local/craft/steering-verbs.md`: three definitions; critique rubric lines.
- `packages/mcp-server`, VS Code, CLI: `filmstrip` argument; verb enum.
- Evals: one brief that steers a section with `calmer`.
- Docs: checks reference, steering guide, CHANGELOG, roadmap.
