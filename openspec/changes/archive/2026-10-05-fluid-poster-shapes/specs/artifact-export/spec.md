## MODIFIED Requirements

### Requirement: Export Size Resolution
The system SHALL determine the capture size in this order: (1) explicit `width` and `height`; (2) the canvas format named by `preset`, or else by the manifest's `metadata.format`; (3) the first `W×H` pair parsed from the `aspect_hint` of the catalog entry named by the manifest's `sourceSkillId`; (4) when `selector` is given, each matched element's bounding box; (5) 1080×1080. For a **fluid** design (see the fluid-canvas capability), steps (1) and (2) SHALL also resize the card to that size in the rendered page before capture, instead of assuming the card already has it. A screen `preset` SHALL also default `selector` to `[data-od-card]` and `maxBytes` to the format's budget. A print preset, or a print default shape (the recorded format) when no `format` is given, SHALL select the print PDF path. Explicit arguments SHALL override anything a preset supplies. A `scale` argument (1–3, default 1) SHALL multiply output pixels without changing layout size. The result SHALL report which rule applied, and for a fluid design that it was reflowed.

#### Scenario: Size taken from the source skill
- **WHEN** an artifact registered with `sourceSkillId` `od:prototype:card-twitter` (aspect_hint `"1600×900 (16:9)"`) is exported with no size arguments and no preset or recorded format
- **THEN** the PNG SHALL be 1600×900 pixels and the result SHALL report the size source as the skill's aspect hint

#### Scenario: Explicit size wins
- **WHEN** the same artifact is exported with `width: 1080, height: 1350`
- **THEN** the PNG SHALL be 1080×1350 pixels

#### Scenario: Preset supplies size, selector and budget
- **WHEN** an artifact is exported with `preset: "ig-portrait"` and no other arguments
- **THEN** each `[data-od-card]` SHALL be captured at 1080×1350 within 8000000 bytes, and the result SHALL report the preset as the size source

#### Scenario: Preset beats the skill hint
- **WHEN** a `card-twitter` artifact is exported with `preset: "story"`
- **THEN** the capture SHALL be 1080×1920

#### Scenario: Fluid design reflowed to the preset
- **WHEN** a fluid poster authored at A3 is exported with `preset: "x-image"`
- **THEN** the card SHALL be resized to 1600×900 px in the page, laid out by its wide rule, and captured at that size, and the result SHALL say it was reflowed

#### Scenario: Unparseable hint falls back
- **WHEN** the source skill's `aspect_hint` has no `W×H` pair (e.g. `"A4 / 长页面"`) and no size, preset, recorded format or selector is given
- **THEN** the export SHALL use 1080×1080 and the result SHALL say so

#### Scenario: High-DPI export
- **WHEN** an artifact is exported at 1280×720 with `scale: 2`
- **THEN** the PNG SHALL be 2560×1440 pixels
