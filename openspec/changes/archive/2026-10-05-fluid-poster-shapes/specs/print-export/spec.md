## MODIFIED Requirements

### Requirement: Card Must Match the Bleed Box
Before printing a **fixed** design, the system SHALL compare the rendered `[data-od-card]` size to the expected bleed box. A difference of more than 1 mm in either dimension SHALL be reported as a `bleed-size` preflight error naming both sizes, with a note that fixed designs include the bleed in the card; the export SHALL still be written. A **fluid** design's card SHALL be sized to the bleed box by export (see the fluid-canvas capability) and SHALL NOT get this check.

#### Scenario: Fixed card authored at trim size
- **WHEN** a fixed A3 artifact's card is 297×420 mm and it is exported with bleed 3 mm
- **THEN** the result SHALL contain a `bleed-size` error saying the card is 297×420 mm but the bleed box is 303×426 mm

#### Scenario: Fluid card authored at trim size
- **WHEN** a fluid A3 artifact authored at 297×420 mm is exported with bleed 3 mm
- **THEN** the page SHALL be 303×426 mm and there SHALL be no `bleed-size` finding
