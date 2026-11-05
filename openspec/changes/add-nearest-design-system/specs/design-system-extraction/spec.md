## ADDED Requirements

### Requirement: Nearest Systems And Distinctive Features

An extraction result whose draft yields at least 8 style-vector features SHALL include `nearest`: the three closest bundled design systems, each with its distance, the number of features compared and the axes where it differs most, in plain words. It SHALL also include the three features furthest from the middle of the bundled set. With fewer features, `nearest` SHALL be omitted, and the result SHALL say why.

#### Scenario: Thin draft
- **WHEN** a screenshot-only draft has 5 features
- **THEN** the result has no `nearest`, and a note says too little was measured to compare
