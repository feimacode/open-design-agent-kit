## Context

`siteExtraction.ts` loads each page with `networkidle2`, waits 400 ms, runs one self-contained measurement function in the page and maps the result with the pure `evidenceToTokens.ts`. Role elements are marked with `data-od-extract-*` attributes and cropped. The draft only ever holds measured values; anything else is listed as unmeasured.

## Goals / Non-Goals

**Goals:** the draft's `--accent` is the brand's, not a third party's; the required structure tokens are measured; every contract role a site actually shows is attempted; disagreements are visible.

**Non-Goals:** clicking anything, accepting consent or logging in; crawling links beyond `extraUrls`; per-component tokens (the contract has none; component specs go to DESIGN.md in `add-brand-kit-capture`).

## Decisions

### Hide overlays, never consent

Clicking "Accept" would set cookies and change what the site does, and "Reject" buttons are as prominent as "Accept" ones. Hiding with an injected style (`display: none !important` on matched elements) changes nothing on the server and keeps the tool's "no cookies, no form submissions" promise. The marker list is a small, versioned constant with the vendors above; the 30%-coverage rule catches the rest. Elements inside a hidden overlay are skipped by role scoring through the same marker, so a failed hide still cannot set the accent.

### Scroll in steps, with a budget

One jump to the bottom does not trigger intersection observers on the way. Viewport-height steps with a 150 ms pause, capped at 12 steps or 8 s, keep the total inside the existing 20 s page timeout. Infinite feeds stop at the cap.

### Two widths, one measurement function

The measurement function already takes the viewport from `window`; running it at 390 px gives mobile values for free. Only structure tokens and radii use the mobile result; colours stay from desktop, since sites rarely change colour by width.

### Radius: follow the contract, keep the evidence

The contract's descriptions are what the craft docs and templates follow (`--radius-sm` on buttons and chips). Buttons and inputs usually share a radius; when they don't, buttons win because they are more visible, and the input radius is kept in `sources` with a note.

### Status colours only from real evidence

Alert, badge and error colours are taken only when the element's text or ARIA role says what it is (`role="alert"`, `[aria-invalid]`, class names with success, warning, error or danger). Without such an element or a clearly named declared property, the role stays unmeasured and the contract fallback applies. No hue-guessing from the palette.

### Declared-property matching by value, then by name

Value matching is exact on the computed colour, so it can't be wrong, only absent. Name matching fills only unmeasured roles and only for unambiguous words; the source names the property, so the review can reject it.

## Risks / Trade-offs

- Some sites put their real CTA in a sticky bar that looks like a promo. Mitigation: only elements with consent or chat markers, or covering more than 30% of the viewport, are hidden; a sticky header or CTA bar under that size stays.
- Scrolling adds time. Mitigation: the step and time caps; the scroll runs once per page, before the desktop measurement only.
- Fixing the radius mapping changes drafts for the same site. Mitigation: CHANGELOG note; existing saved systems are untouched.
