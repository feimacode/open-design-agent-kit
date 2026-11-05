## Context

Since Chrome 111, `getComputedStyle` serialises colours in their own colour space (CSS Color 4). Only legacy notations come back as `rgb()`. The kit has about ten colour parsers, all written for `rgb()`.

## Decisions

### Canvas in the page, maths in Node

In the page, the browser is the reference implementation. A 1×1 canvas converts anything Chrome can paint, including `color-mix()`, relative colour syntax and `light-dark()` already resolved by the computed style, with Chrome's own gamut mapping. That is shorter and more correct than porting CSS Color 4 maths into every page script. A context with `willReadFrequently`, plus a `Map` cache keyed by the string, keeps the cost negligible next to `getComputedStyle`.

Node has no canvas, so `sources` text (CSS, tokens, brand guides) gets a parser. `colorMix.ts` already does OKLab to sRGB. Adding Lab/LCH (via XYZ D50 to D65) and display-p3 (a linear matrix) is about 60 lines, with conversion tests checked against Chrome's canvas output.

### Clip, but keep the original

The token contract and every consumer expect hex. Clipping a display-p3 accent changes it by a little; dropping it loses the brand. The draft keeps the sRGB value and records the original string in `sources[token].declared` or in a note, so a writer can put `color(display-p3 …)` in DESIGN.md or as a progressive enhancement.

### Skipped, not white

For contrast, an unknown background is unknown. Walking past it to the page's white turns "couldn't read" into "failed". Counting the element as skipped matches what the check already does for background images.

## Risks

- Canvas colour reads are subject to fingerprinting defences in some browsers. The kit drives its own Chrome without them; a read that returns all zeros for a non-black input is treated as unreadable.
