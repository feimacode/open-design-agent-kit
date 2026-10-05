# print-export Specification

## Purpose
Turn a print-format design into a PDF a print shop can use: one page the size of the bleed box, with vector text, TrimBox and BleedBox set, optional crop marks, and an honest statement that the output is RGB.
## Requirements
### Requirement: Print-Ready PDF for Print Formats
Exporting an artifact as PDF under a print format SHALL produce a single-page PDF whose page is the format's bleed box (trim plus bleed on every side), containing the `[data-od-card]` element at the page origin with vector text and backgrounds printed. The PDF SHALL set `TrimBox` to the trim size inset by the bleed and `BleedBox` to the full bleed box. The page SHALL be rendered with screen media emulation, so the printed result matches the preview.

#### Scenario: A3 poster with default bleed
- **WHEN** an artifact with a 303×426 mm card is exported with `preset: "a3"`
- **THEN** the PDF page SHALL be 303×426 mm, its `TrimBox` SHALL be 297×420 mm offset by 3 mm, and its text SHALL be selectable

#### Scenario: Zero bleed
- **WHEN** the export passes `bleed: 0`
- **THEN** the page SHALL equal the trim size and `TrimBox` SHALL equal the page

### Requirement: Optional Crop Marks
When `cropMarks: true` is given for a print export, the system SHALL enlarge the page by a slug area outside the bleed box and draw hairline crop marks at the four trim corners, positioned outside the bleed so they never overlap the artwork.

#### Scenario: Crop marks requested
- **WHEN** an A4 artifact is exported with `cropMarks: true`
- **THEN** the PDF page SHALL be larger than the bleed box, `TrimBox` and `BleedBox` SHALL keep their sizes, and marks SHALL appear at each trim corner outside the bleed

### Requirement: Card Must Match the Bleed Box
Before printing a **fixed** design, the system SHALL compare the rendered `[data-od-card]` size to the expected bleed box. A difference of more than 1 mm in either dimension SHALL be reported as a `bleed-size` preflight error naming both sizes, with a note that fixed designs include the bleed in the card; the export SHALL still be written. A **fluid** design's card SHALL be sized to the bleed box by export (see the fluid-canvas capability) and SHALL NOT get this check.

#### Scenario: Fixed card authored at trim size
- **WHEN** a fixed A3 artifact's card is 297×420 mm and it is exported with bleed 3 mm
- **THEN** the result SHALL contain a `bleed-size` error saying the card is 297×420 mm but the bleed box is 303×426 mm

#### Scenario: Fluid card authored at trim size
- **WHEN** a fluid A3 artifact authored at 297×420 mm is exported with bleed 3 mm
- **THEN** the page SHALL be 303×426 mm and there SHALL be no `bleed-size` finding

### Requirement: Honest Color Disclosure
Every print export result SHALL state that the PDF is RGB (sRGB) and that CMYK or PDF/X conversion, if a printer requires it, must be done with a separate tool. The system SHALL NOT claim CMYK or PDF/X output.

#### Scenario: Print export result
- **WHEN** any print-format PDF export succeeds
- **THEN** the formatted result SHALL include the RGB note

