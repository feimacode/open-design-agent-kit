## Context

`exportArtifact` already supports `presets` (fluid shapes) × `data` (rows) up to 400 outputs, shape sheets, and per-row and per-shape preflight. `adapt_open_design_artifact` returns in-place `@container` tuning for fluid masters. Collections group artifacts with roles. The poster flow is the closest existing orchestration, as a local prompt.

## Goals / Non-Goals

**Goals:** one brief → a consistent multi-channel set; localization and personalization through the existing `data` mechanism; every asset checked.

**Non-Goals:** publishing to ad networks or social APIs; video ads (handled by motion export later); A/B test management.

## Decisions

### D1. A prompt, not a tool
The flow is judgment-heavy (copy, channel choice, what to tune) and every mechanical step is already a tool. A host prompt like `/open-design-poster` keeps it native on every host. *Alternative:* a `prepare_open_design_campaign` tool that returns a plan. It's more machinery for something the prompt can state.

### D2. Copy deck as CSV, locales as rows
Rows already drive bulk export, with `nameField` naming the files. A `locale` column (en, de, ja…) yields `hero-de-ig-portrait.png` and similar names. One mechanism covers localization and personalization (per region or partner).

### D3. `data-od-fit` instead of per-locale layouts
German and Finnish copy runs long. `data-od-fit` on a bound element shrinks its font in steps of 5%, down to 70%, until the text no longer overflows. Shrinking further is reported as `overflow`, as today. Each fit is reported (info), so nothing is silent.

### D4. Ad sizes as canvas formats with byte budgets
IAB sizes become regular formats (medium `screen`, `maxBytes: 150000`), so `presets`, preflight, `card-size` and budget re-encoding apply unchanged. `email-header` captures at scale 2 for retina displays.

### D5. Campaign sheet reuses the shape-sheet composer
After the exports, `exportArtifact` with `shapeSheet` already composes the card shapes. The campaign sheet adds the landing page's and the email's first-screen thumbnails, from the visual check's capture code, into one labelled image.

## Risks / Trade-offs

- [Tiny banner sizes (320×50, 728×90) can't hold the master's composition] → the formats carry `skillHint` notes, and the flow tells the agent to tune them with `adapt` (headline + CTA only).
- [400-output cap: 10 shapes × 40 rows] → the flow exports per locale batch when the cap is hit.

## Migration Plan

Additive: new format ids and a new attribute.

## Open Questions

- Should the campaign sheet also be a browsable HTML index page (like the exploration comparison page)? Leaning yes, as a follow-up.
