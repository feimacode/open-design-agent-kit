## Why

`review.html` (from `connect-brand-design-systems`) puts the site's screenshot beside fixed sample markup styled only by the new `tokens.css`. Its check reports `brand-fidelity` per property: accent, text, background, fonts, button and card radius, and button height. That catches a wrong value. It doesn't answer the question a designer asks: **would the site's own button, built only from these tokens, look like the site's button?** Padding that falls between two spacing steps, a shadow with no token, a weight or letter spacing the type tokens don't carry: none of these show up as a wrong property, but they are the difference between "on brand" and "close".

design-extract's `verify` answers that question directly. It takes the site's real button, card, input and nav, snaps every visual property to the nearest extracted token, renders the result and pixel-diffs it against the real crop. That gives a fidelity percentage for each component. Properties with no token family render neutral (radius 0, no shadow), so the score exposes a missing token instead of hiding it. The loss is attributed to a token family, so the number is explained.

We already capture what this needs: component crops and specs for primary, secondary and ghost buttons, the input, card, nav and badge (`add-brand-kit-capture`).

## What Changes

- **Token replicas.** For each captured component, the review renders a replica at the component's measured size and label. Every property the component spec measured (background, text colour, border, radius, padding, font family, size, weight, letter spacing, shadow, height) is set to the nearest token in the new `tokens.css`. A property with no matching token family takes the contract's neutral default, and is marked unmapped.
- **Pixel fidelity.** Each replica is screenshotted at the same scale as the site's crop and compared with a perceptual pixel diff (per-pixel ΔE 2000, anti-aliasing tolerant). The result is a fidelity percentage per component.
- **Loss by family.** For each component, the diff is repeated with one token family at a time restored to the site's measured value: colour, radius, spacing, type, shadow and border. The families whose restoration recovers the most are reported as the component's losses, with the measured and token values.
- **In the review page.** `review.html` gains a Components band: each site crop beside its replica, with its fidelity and top loss in a caption. It updates when `tokens.css` changes, like the rest of the review.
- **In the check.** Checking `review.html` adds a `brand-fidelity` finding for each component under 90%, naming the family and both values. An example: "Primary button 81%: spacing. The site pads 14px 28px; nearest tokens give 12px 24px." Unmapped properties are a note suggesting a token or a DESIGN.md line, not a failure.
- **The skill's review loop** uses those findings as its first fixes, within the existing two rounds.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `brand-design-systems`: the review gains component replicas built only from tokens, pixel fidelity with loss by token family, and findings from it.

## Impact

- `packages/core/src/export/brandReview.ts`: replica rendering, the Components band, snapping to tokens.
- New `packages/core/src/export/componentFidelity.ts`: pixel diff (pngjs, no new dependency), ablation by family, findings.
- `packages/core/src/export/checkArtifact.ts`: wire the findings for the review page.
- Skill (`design-system-from-url.md`): read component findings first in the review loop.
- Tests: fixture components with known padding, shadow and weight mismatches; a perfect match scores 98% or more; the ablation names the right family.
- Docs: design systems guide (review section), tools reference (`brand-fidelity`).
