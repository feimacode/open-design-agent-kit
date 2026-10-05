# fluid-canvas Specification

## Purpose
Let a poster be authored once as a fluid design (a card sized by CSS variables, with contents in container units and layout rules for wide and tall shapes), so it can reflow to any canvas shape without regeneration. Covers how a design declares itself fluid, how briefs teach the contract, bleed added at export, and the fixed-size check.
## Requirements
### Requirement: Fluid Designs Declare Themselves
A design SHALL be treated as fluid when its `[data-od-card]` element also carries `data-od-fluid`. The attribute in the HTML is the source of truth for export, preflight, adaptation and the preview. Registration SHALL also record `metadata.fluid: true` when the entry HTML contains a fluid card.

#### Scenario: Fluid attribute present
- **WHEN** an artifact's HTML contains `<div data-od-card data-od-fluid>` and it is registered
- **THEN** its manifest SHALL record `metadata.fluid: true`, and export SHALL treat it as fluid

#### Scenario: No attribute
- **WHEN** the card has no `data-od-fluid`
- **THEN** every tool SHALL treat the design as fixed-size, exactly as before this change

### Requirement: Fluid Brief Preparation
`prepare_open_design_brief` SHALL accept `fluid` (boolean). When `fluid` is not given, it SHALL default to `true` for print formats and `false` for screen formats. With `fluid: true`, the Canvas section SHALL teach the fluid contract:
- the card carries `data-od-card data-od-fluid`, with its size from `--od-w`/`--od-h` (set to the default shape) plus `2 × --od-bleed`, and `container-type: size`;
- content sits in a safe container inset by `--od-bleed` plus a relative margin;
- sizes inside the card are container query units, `%`, `em` or `fr`, with fixed units only for hairlines;
- there is a default layout plus rules for wide (`aspect-ratio > 1.2`) and tall (`aspect-ratio < 0.6`) shapes;
- `data-od-priority` marks elements to drop on small or extreme shapes, and `object-position` marks photo focus points;
- print designs are authored at trim size, because export adds the bleed.

`fluid: true` without `format` SHALL default the shape to A3.

#### Scenario: Print brief defaults to fluid
- **WHEN** a brief is prepared with `format: "a2"` and no `fluid`
- **THEN** the Canvas section SHALL be the fluid variant with `--od-w: 420mm; --od-h: 594mm`, and SHALL NOT tell the author to include the bleed in the card

#### Scenario: Screen brief stays fixed
- **WHEN** a brief is prepared with `format: "x-image"` and no `fluid`
- **THEN** the Canvas section SHALL be the fixed 1600×900 px variant, unchanged from before

#### Scenario: Explicitly fluid screen poster
- **WHEN** a brief is prepared with `format: "story"` and `fluid: true`
- **THEN** the Canvas section SHALL be the fluid variant with `--od-w: 1080px; --od-h: 1920px`

### Requirement: Bleed Added at Export for Fluid Print
When a fluid design is exported at a print shape, the system SHALL set `--od-bleed` to the bleed in use (the format's, or `bleed`), so the card grows to the bleed box and its content stays inside the trim. A fluid design SHALL NOT be reported for a `bleed-size` mismatch caused by being authored at trim size.

#### Scenario: Fluid A3 authored at trim size
- **WHEN** a fluid card with `--od-w: 297mm; --od-h: 420mm` is exported with `preset: "a3"`
- **THEN** the PDF page SHALL be 303×426 mm, with TrimBox 297×420 mm, and no `bleed-size` finding

### Requirement: Fixed-Size Check for Fluid Designs
For fluid designs, preflight SHALL re-render the card at 1.5× the exported shape's width and height, and SHALL report a `fixed-size` warning for each text element, `img` or `svg` whose font size (text) or box width (`img`, `svg`) grew by less than 1.05×, i.e. didn't follow the card at all, naming it. A size with a `max(…)` floor that grows partly SHALL NOT be reported. Borders of 2 px or less SHALL NOT be measured. The card SHALL then be restored to the exported shape before capture.

#### Scenario: Headline sized in px
- **WHEN** a fluid poster's headline has `font-size: 96px`
- **THEN** preflight SHALL report a `fixed-size` warning for the headline saying it doesn't scale with the poster

#### Scenario: Fully fluid poster
- **WHEN** every size in the card is in container query units
- **THEN** no `fixed-size` finding SHALL be reported

