## Decisions

### Replicas from specs, not the site's HTML

design-extract copies the element's `outerHTML` and restyles it. That brings the site's markup, class names and sometimes its content into our files, which is wrong for a reference site and fragile everywhere. Our component specs already hold the measured properties and the label text. A replica built from a plain element with those properties is enough to compare the look, and keeps `review.html` free of the site's markup.

### Snap to the nearest token, per family

Colours snap to the nearest colour token by ΔE 2000, radii and spacing to the nearest step, font sizes to the type scale, weights to the declared weights, and shadows to `--elev-*`. "Nearest" is what a designer building from the tokens would reach for. Snapping is deterministic, so the same tokens always give the same replica.

### Explain by ablation

One fidelity number invites a shrug. Restoring one family at a time and measuring the recovery says which tokens cost the most, in the units a designer fixes (px, weights, colours). With six families and seven components that is at most 49 small renders, which fits inside one check run.

### 90% threshold, tuned on fixtures

Anti-aliasing and font hinting keep even a perfect replica slightly off. Fixtures where the replica uses the exact measured values set the floor (expected 98% or more). 90% leaves room for that, and still flags a visible padding or weight miss. The threshold is a constant, revisited with real reviews.
