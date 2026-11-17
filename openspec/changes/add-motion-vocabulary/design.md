## Context

`TOKEN_SCHEMA` is vendored from upstream and lists `--motion-fast`, `--motion-base` and `--ease-standard` as A2 tokens with fallbacks. Every bundled `tokens.css` declares them. `resolveDesignSystemTokens()` already applies `tokens.override.css` from the overlay on top of the vendored file. `evidenceToTokens.ts` fills the three tokens from observed motion (`add-runtime-motion`), and `summariseMotion()` writes `brandKit.motion`.

## Goals / Non-Goals

**Goals:** every design system gives an agent enough motion values to build a film or a page without inventing numbers; a measured brand moves like its site; one or two dials change the feel without editing CSS.

**Non-Goals:** a full motion token standard; editing the vendored schema; per-component motion specs.

## Decisions

1. **Derive at resolve time.** The same approach the roadmap names for readable colour pairs. The derived block is appended after the system's own tokens, so a system that already declares `--motion-slow` (one does) keeps its value. Alternative considered: add the names to every `tokens.css` through overrides. Rejected: 198 generated files for values that are a formula.
2. **Ratio scale for durations.** `instant = fast × 0.5`, `slow = base × 2`, `scene = base × 4`, each times `speed`, rounded to 10 ms. These sit inside the ranges in `animation-discipline.md` (hover 100–200 ms, state 200–300 ms) and upstream's film ranges (arrivals 350–650 ms, transformations 600–1200 ms) at the default dial.
3. **Spring as `linear()`.** `linear()` easing is supported in current Chrome, Safari and Firefox, so a spring needs no JavaScript. `bounce` sets the overshoot. A custom property can't fall back by itself, so CSS exports add an `@supports not (transition-timing-function: linear(0, 1))` block that sets `--ease-spring` to a `cubic-bezier` for older engines, and the brief tells the agent to fall back to `--ease-enter`.
4. **Dials are tokens.** `--motion-speed` and `--motion-bounce` live in `tokens.css` like any other token, so the preview's tweak panel finds them and a design can write `calc(<duration> * var(--motion-speed))`. No overlay format change is needed.
5. **Craft doc, not a vendored skill.** Copying upstream's skill into `local/skills/` would collide with the upstream id after the next sync. A craft doc is loaded through `craft-requires.json`, and its text drops the parts that assume upstream's app (plan contracts, its own export route).

## Risks / Trade-offs

- [Derived values don't match a brand's taste] → measured values win where they exist, and the dials let the agent or person move it.
- [Two copies of film craft after a sync bump] → the content check reports the overlap.
