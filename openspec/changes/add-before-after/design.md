## Context

`baseScreen.ts` stores one "before" image per design under `.bases/`. The check already attaches it beside the design's screenshot. `explorationCompare.ts` renders a comparison page for 2 to 4 directions, and publish and export handle single designs and whole flows. The site audit (add-site-audit) writes `audit.json` with findings, selectors and crops. Redesigns (add-redesign-from-url) mark copy edits.

## Goals / Non-Goals

**Goals:** one page a designer can screen-share in a call and send afterwards, showing that the new design fixes the specific problems found, with nothing claimed that wasn't checked.

**Non-Goals:** pixel diffing, A/B testing, analytics, proposal or pricing documents (the pitch pack is a later change), and comparing two kit designs (explore does that).

## Decisions

### Images, not live frames

The "before" is a screenshot taken at audit or extraction time; the "after" is captured when the page is made. Live iframes of the old site would break on frame-blocking headers and change under the designer. The capture time of both sides is printed on the page.

### Re-check rather than trust

For each audit finding, the tool runs the same live-safe check on the design at the same size and reports the new value. A finding with no equivalent element in the design (the old booking button was removed) is shown as "replaced by" with the new element, chosen by the agent and confirmed by the check passing on it.

### Summary lines must cite

The agent writes up to three summary lines, and each must cite one or more finding ids. The tool rejects a line with no citation, or one that cites a finding still open. This keeps the sales summary honest without a fixed template.

### Works without the audit

With only a base screen, the page shows the slider and the design's own check results ("passes contrast, tap targets, reflow"). The page doesn't claim fixes it can't pair.

## Risks / Trade-offs

- **Different page lengths.** The old and new pages rarely have the same height. The slider compares the first screen at each size, and a "full page" toggle shows both full height side by side.
- **Stale before.** If the base screen is older than 30 days, the page says so and the tool offers to recapture it.
- **Third-party material in a published page.** The before screenshots are the client's site. The concept ribbon and publish warning from add-redesign-from-url apply to this page too.
