## ADDED Requirements

### Requirement: Rows Across Shapes
When `data` is combined with `presets` on a fluid design, the system SHALL export every row at every shape, naming each file `<base>-<rowSuffix>-<formatId>.<ext>`. Print shapes SHALL produce one multi-page PDF per shape (`<base>-<formatId>.pdf`), or one PDF per row and shape with `split`. Per-row preflight findings SHALL carry both the row and the shape. Before rendering, the system SHALL fail when rows × shapes exceeds 400 outputs, with a message to split the data or the shapes.

#### Scenario: Speaker cards for two platforms
- **WHEN** a fluid speaker card is exported with 12 rows, `nameField: "name"` and `presets: ["ig-portrait", "story"]`
- **THEN** 24 PNGs SHALL be written, such as `card-ada-lovelace-ig-portrait.png` and `card-ada-lovelace-story.png`

#### Scenario: Too many outputs
- **WHEN** 200 rows are exported with `presets` of 3 shapes
- **THEN** the export SHALL fail before rendering, saying 600 outputs exceeds the 400 limit
