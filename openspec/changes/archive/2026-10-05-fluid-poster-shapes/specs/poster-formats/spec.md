## MODIFIED Requirements

### Requirement: Canvas Instructions for a Format
When brief preparation is given a `format`, the returned instructions SHALL include a Canvas section. Its variant follows the brief's `fluid` setting (see the fluid-canvas capability). The **fixed** variant SHALL state the exact size and unit, the safe inset, that the design is one fixed-size `[data-od-card]` element with `overflow: hidden`, and the `data-od-field` / `data-od-qr` attribute conventions. For print formats, the fixed variant SHALL also state that the card is authored at the bleed box (trim plus bleed on every side) in `mm`, that full-bleed backgrounds fill the card while text and logos stay inside trim minus the safe inset, that viewport units are not allowed, and the minimum type size. The **fluid** variant SHALL state the format as the default shape, the fluid contract, the same attribute conventions and minimum type size, and that the shape can be changed at export.

#### Scenario: Print canvas section, fixed
- **WHEN** a brief is prepared with `format: "a3"` and `fluid: false`
- **THEN** the instructions SHALL state a 303×426 mm card (297×420 mm plus 3 mm bleed on each side), the trim size, the safe inset and the minimum type size

#### Scenario: Print canvas section, fluid by default
- **WHEN** a brief is prepared with `format: "a3"` and no `fluid`
- **THEN** the instructions SHALL give the fluid contract with a 297×420 mm default shape, and say export adds the bleed

#### Scenario: Screen canvas section
- **WHEN** a brief is prepared with `format: "story"` and no `fluid`
- **THEN** the instructions SHALL state a 1080×1920 px card and a safe inset, with no bleed

### Requirement: Format Recorded on the Artifact
When an artifact is registered with a `format`, the system SHALL record the format id in the manifest's `metadata.format`. Registering an artifact again SHALL keep the metadata its manifest already records (the format, export and share records, remix origin), replacing the format only when a new one is given and setting `metadata.fluid` from the HTML as it is now. The recorded format is used so later exports, adaptations and preflight can use it without the caller repeating it. For a fixed design it is the design's one size. For a fluid design it is the default shape, which can be changed without editing the HTML.

#### Scenario: Export falls back to the recorded format
- **WHEN** an artifact registered with `format: "a2"` is exported with `format: "pdf"` and no preset
- **THEN** the export SHALL use the A2 print settings

#### Scenario: Re-registering keeps the default
- **WHEN** an artifact whose manifest records `metadata.format: "poster-18x24"` (set in the preview) is registered again without `format`
- **THEN** the manifest SHALL still record `poster-18x24`, along with its earlier export and share records

#### Scenario: Fluid default is changeable
- **WHEN** a fluid artifact's recorded format is changed from `a2` to `a1`
- **THEN** later exports with no preset SHALL use A1, and the HTML SHALL be unchanged
