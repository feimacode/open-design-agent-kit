## 1. Replicas and fidelity

- [x] 1.1 Snap a component spec to the nearest tokens per family; mark unmapped properties
- [x] 1.2 Render replicas at measured size and label; screenshot at the crop's scale
- [x] 1.3 `componentFidelity.ts`: perceptual pixel diff, fidelity percentage, ablation by family

## 2. Review and check

- [x] 2.1 Components band in `review.html` (crop, replica, unmapped properties), live on `tokens.css` edits; fidelity and top loss come from the check, which the static page can't compute
- [x] 2.2 `brand-fidelity` findings under 90% with family and both values; unmapped properties as notes
- [x] 2.3 Skill: component findings first in the review loop; `sync-content`

## 3. Tests and docs

- [x] 3.1 Fixtures: exact match raises nothing; padding, shadow and colour mismatches each named by ablation. Weight has no token family, so a weight mismatch is an unmapped note rather than a loss; scoring covers buttons and badges, since card, input and nav crops hold content the spec doesn't capture
- [x] 3.2 Docs: design systems guide, tools reference
