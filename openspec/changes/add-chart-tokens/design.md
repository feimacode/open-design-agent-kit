## Context

`resolveDesignSystemTokens()` already appends a derived motion block (`add-motion-vocabulary`) without changing vendored `tokens.css` files or the token schema. Contrast helpers exist in `colorMix.ts` and the Claude Design build code. Only 1 of 198 bundled systems has dark values today.

## Goals / Non-Goals

**Goals:** every system gets chart colours that fit its brand and are readable on its background; charts on one dashboard agree.

**Non-Goals:** colour-blind simulation in the check (the series spacing rule and "not colour alone" cover the common cases); measured chart colours from a brand's website (a later extraction change).

## Decisions

### Derive, don't hand-write

Hand-writing 13 colours for 198 systems would be weeks of work and would drift. Deriving at resolve time costs one function and covers custom and extracted systems too. A system can still declare any `--chart-*` name to override it.

### Hue steps from the accent

Series 1 is the accent (adjusted to 3:1 if needed). Later series step hue around the OKLCH circle by a fixed order that keeps neighbours far apart, at the accent's chroma, clamped so grey brands still get distinguishable series. Lightness is adjusted per colour until it meets 3:1 on `--bg`. If six distinguishable colours can't be found (a very low-chroma brand), series 5 and 6 fall back to lightness steps of series 1 and 2, and the check's `chart-too-many-series` note stays the guard.

### Positive and negative

Taken from `--success` and `--danger` so they match status chips, adjusted to 3:1 on `--bg`. The brief says to pair them with a sign or arrow.

## Risks / Trade-offs

- **Brand purists.** A derived palette can include hues a brand never uses. The override path and the preview page make that visible and fixable.
- **Overlap with readable pairs.** Both adjust colours for contrast. Sharing the helper keeps them consistent; whichever lands second reuses the first's code.
