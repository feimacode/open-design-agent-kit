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
When brief preparation is given a `format`, the returned instructions SHALL include a Canvas section stating the exact size and unit, the safe inset, that the design is one fixed-size `[data-od-card]` element with `overflow: hidden`, and the `data-od-field` / `data-od-qr` attribute conventions. For print formats, the section SHALL also state that the card is authored at the bleed box (trim plus bleed on every side) in `mm`, that full-bleed backgrounds fill the card while text and logos stay inside trim minus the safe inset, that viewport units are not allowed, and the minimum type size.

#### Scenario: Print canvas section
- **WHEN** a brief is prepared with `format: "a3"`
- **THEN** the instructions SHALL state a 303×426 mm card (297×420 mm plus 3 mm bleed on each side), the trim size, the safe inset and the minimum type size

#### Scenario: Screen canvas section
- **WHEN** a brief is prepared with `format: "story"`
- **THEN** the instructions SHALL state a 1080×1920 px card and a safe inset, with no bleed

### Requirement: Format Recorded on the Artifact
When an artifact is registered with a `format`, the system SHALL record the format id in the manifest's `metadata.format`, so later exports, adaptations and preflight can use it without the caller repeating it.

#### Scenario: Export falls back to the recorded format
- **WHEN** an artifact registered with `format: "a2"` is exported with `format: "pdf"` and no preset
- **THEN** the export SHALL use the A2 print settings

