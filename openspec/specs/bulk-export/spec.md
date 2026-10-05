# bulk-export Specification

## Purpose
Export one image, or one PDF page, per row of a CSV, XLSX or JSON file by filling the design's marked fields in the rendered page, with the data checked before rendering and the design file left untouched.
## Requirements
### Requirement: Data-Bound Export
`export_open_design_artifact` SHALL accept `data` (a workspace-relative CSV, XLSX or JSON-array file), an optional `sheet` (XLSX) and an optional `nameField`. For each row, the system SHALL fill every `[data-od-field="<column>"]` element in the served page with that row's value: `textContent` by default (line breaks in a value become `<br>`), `src` for `img`, `href` for `a`. It SHALL render a QR code of the value into every `[data-od-qr-field="<column>"]` element, then capture after fonts and images are ready. The artifact file on disk SHALL NOT be modified.

#### Scenario: Speaker cards from a spreadsheet
- **WHEN** an artifact with `data-od-field` elements `name`, `title` and `talk` is exported as PNG with `data: "speakers.xlsx"` holding 12 rows and `nameField: "name"`
- **THEN** 12 PNGs SHALL be written under `exports/`, named from each row's slugified `name`, and the HTML file SHALL be unchanged

#### Scenario: Duplicate names
- **WHEN** two rows produce the same slug
- **THEN** their file names SHALL be made unique with a numeric suffix

### Requirement: Print Bulk Output Is One Multi-Page PDF
For a PDF bulk export, the system SHALL write one PDF with one page per row in data order, with each page meeting the print-export requirements. `split: true` SHALL write one PDF per row instead.

#### Scenario: Certificates for print
- **WHEN** an A4 certificate is bulk-exported as PDF from 40 rows
- **THEN** one 40-page PDF SHALL be written

### Requirement: Validate Data Before Rendering
Before launching a browser, the system SHALL check that every `data-od-field` and `data-od-qr-field` in the artifact names an existing column. A missing column SHALL fail the export, listing the missing fields and the available columns. Columns no field uses SHALL produce a warning. More than 200 rows SHALL fail with a message to split the data. An empty cell SHALL be bound as empty text and reported as a warning with its row.

#### Scenario: Field with no matching column
- **WHEN** the artifact uses `data-od-field="company"` and the CSV has no `company` column
- **THEN** the export SHALL fail with `invalid-args`, naming `company` and listing the CSV's columns

### Requirement: Per-Row Preflight
Preflight SHALL run for every row of a bulk export, and each finding SHALL carry its row number and `nameField` value.

#### Scenario: One name too long
- **WHEN** row 7's name overflows its box
- **THEN** the result SHALL include an `overflow` finding for row 7 naming that row, and the other rows' files SHALL still be written

