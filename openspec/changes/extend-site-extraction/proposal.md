## Why

`extract_open_design_design_system` (from `add-design-system-from-url`, PR #21) measures the right things in the right way, rendered computed styles with a source and a crop for every value, but it measures too little of the page and is fooled by common page furniture. An audit of `siteExtraction.ts` and `evidenceToTokens.ts` (2026-11-02) found:

- **Overlays win the accent.** Nothing hides cookie banners, consent dialogs, chat launchers or promo bars. The primary-button score favours large, saturated, filled buttons above the fold, which is exactly what an "Accept all" button is, so a European visit can make the consent manager's colour the brand's `--accent`. The banner is also in the screenshot the review compares against.
- **Only the first screen is real.** The page is never scrolled, so lazy-loaded sections and scroll-reveal content (often `opacity: 0` until seen, which the `visible()` filter drops) never count toward surfaces, cards, borders or spacing.
- **The mobile render is a screenshot only.** It is captured but never measured, so `--container-gutter-*` and `--section-y-*`, which the contract marks as required structure tokens, are always unmeasured; so is `--section-y-desktop`.
- **Radius steps are swapped against the contract.** The draft maps inputs to `--radius-sm`, buttons to `--radius-md` and cards to `--radius-lg`. The contract says `--radius-sm` is buttons, inputs and chips and `--radius-md` is cards and modals, so every design built on an extracted system gets button corners on its cards and card corners on featured blocks.
- **Many contract tokens are never attempted:** `--focus-ring`, `--success`, `--warn`, `--danger`, `--fg-2`, `--meta`, `--border-soft`, `--surface-warm`, `--elev-ring`. Sites often declare these as custom properties (which the bundle already records) or show them in alerts, badges and form errors.
- **Gradients and images are invisible.** Only `background-color` is read. A brand whose hero or buttons are a gradient gets a flat colour with no note, and a dark hero over a light body is missed.
- **Pages don't agree and nobody hears about it.** With `extraUrls`, the first page's value silently wins for every colour; a pricing page with another accent is dropped without a note. Dark theme is measured on the first page only.
- **Declared tokens are recorded but not used.** `customProperties` (the site's own `--brand-primary`, `--color-success`…) go into evidence.json but the draft never matches them to measured values or to unmeasured contract roles.

## What Changes

- **Quiet the page before measuring.** Before the screenshot and measurement, hide (never click) fixed or sticky elements that match consent, cookie, chat-launcher and promo markers (known consent-manager ids and classes such as OneTrust, Cookiebot, Didomi, TrustArc, Usercentrics; Intercom, Drift, HubSpot and Zendesk launchers; any fixed element covering more than 30% of the viewport with consent wording). Hidden elements are listed in evidence with their selectors, and are excluded from role scoring even if hiding fails.
- **Scroll the page once.** Scroll to the bottom in viewport steps (at most 12 steps or 8 seconds), wait for lazy content, scroll back, then measure. Reveal animations are finished by setting `animation` and `transition` to none on the measured copy. A full-page screenshot (capped at 6,000 px) joins the viewport one.
- **Measure the mobile render.** Run the measurement at 390 px too and take container gutters and section padding from both widths: `--container-gutter-desktop` and `--container-gutter-phone` from the main container's inline padding, `--section-y-desktop` and `--section-y-phone` from the most common vertical padding of top-level sections; tablet values are interpolated only when the site has a breakpoint between them, otherwise left unmeasured.
- **Fix the radius mapping** to the contract: buttons and inputs to `--radius-sm` (buttons win when they differ, and the input value is noted), cards and modals to `--radius-md`, the largest featured container or hero media to `--radius-lg`.
- **More roles.** `--focus-ring` from the primary control with `:focus-visible` forced; `--success`, `--warn`, `--danger` from alert, badge, toast and `[aria-invalid]` error colours, or from declared properties whose names say so; `--fg-2` and `--meta` from the next two readable text colours by weight; `--border-soft` from row separators (table rows, list dividers); `--elev-ring` when cards use a 1 px shadow ring instead of a border.
- **Declared token matching.** Each measured value is matched to the site's own custom property with the same computed value, recorded in `sources` (`--accent` ← `--color-brand-500`), and unmeasured contract roles are filled from declared properties whose names map clearly onto them (`success`, `danger`/`error`, `warning`, `focus`). Matched names go into the draft as comments so DESIGN.md can use the brand's own vocabulary.
- **Gradients and media backgrounds.** When the primary control, hero or main surface paints a `background-image` gradient, the evidence records it, the draft keeps the gradient's dominant stop as the token and adds a note with the full gradient for DESIGN.md. A hero with an image or video background is recorded as such.
- **Pages that disagree.** Every page is measured fully (dark theme included); when pages give different values for a role, the draft keeps the first page's, and `conflicts` lists each other value with its page and crop.
- **Evidence version.** `evidence.json` gains `"version": 2`; the draft and review read both versions.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction` (from `add-design-system-from-url`, not yet archived): overlay quieting, scrolling, mobile measurement, contract-correct radius mapping, more roles, declared token matching, gradients and page conflicts are added as new requirements.

## Impact

- `packages/core/src/generation/siteExtraction.ts`: overlay hiding, scroll pass, mobile measurement, forced `:focus-visible`, status colours, gradients, per-page dark pass.
- `packages/core/src/generation/evidenceToTokens.ts`: radius mapping, structure tokens from two widths, new roles, declared-property matching, conflicts; existing unit tests updated for the radius fix.
- Browser fixtures: a page with a consent banner whose button is greener than the brand's, a scroll-reveal page, a gradient-button page, a two-page site with different accents.
- `packages/content/local/prompts/design-system-from-url.md`: read `conflicts` and gradient notes; mention hidden overlays.
- Docs: `docs/guides/design-systems.md` ("Take one from a website"), `docs/reference/tools.md`.
- Existing user systems are not changed. A note in the CHANGELOG says systems extracted before this change have button and card radii swapped and can be re-extracted.
