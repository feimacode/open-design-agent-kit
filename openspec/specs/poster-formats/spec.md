# poster-formats Specification

## Purpose
Give every host one catalog of named canvas formats (social sizes in px, print trim sizes in mm with bleed, safe area and minimum type size), so brief preparation, export presets, preflight and adaptation all use the same numbers instead of sizes copied by hand.
## Requirements
### Requirement: Named Canvas Format Catalog
The system SHALL provide one catalog of named canvas formats, shared by brief preparation, export, adaptation and the workflow prompts. Each format SHALL define a stable kebab-case id, a label, a medium (`screen` or `print`), width and height with a unit (`px` for screen, `mm` trim size for print), a safe inset, and as applicable a bleed (print), a minimum type size (print), a byte budget (screen) and a default recipe. The catalog SHALL contain at least the social formats from the social-post workflow (with the same sizes and byte budgets) and the print formats A4, A3, A2, A1, A0, US Letter, Tabloid, 18×24 in and 24×36 in.

#### Scenario: Social formats match the existing workflow
- **WHEN** the catalog entry `ig-portrait` is read
- **THEN** it SHALL be a screen format of 1080×1350 px with an 8000000-byte budget and default recipe `od:prototype:poster-hero`

#### Scenario: Print format carries print parameters
- **WHEN** the catalog entry `a3` is read
- **THEN** it SHALL be a print format of 297×420 mm with a bleed and a minimum type size

### Requirement: Formats Are Discoverable
The system SHALL let the agent see the available format ids and their sizes without guessing. The `prepare_open_design_brief`, `export_open_design_artifact` and `adapt_open_design_artifact` tool descriptions SHALL list the format ids, and an unknown id SHALL produce an error that lists the valid ids.

#### Scenario: Unknown format id
- **WHEN** any tool is called with `format` or `preset` `"a7"`
- **THEN** the call SHALL fail with a message listing the valid format ids

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

