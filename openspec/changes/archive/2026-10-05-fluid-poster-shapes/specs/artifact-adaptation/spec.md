## MODIFIED Requirements

### Requirement: Adapt a Design to Other Formats
The system SHALL expose `adapt_open_design_artifact` in every host (VS Code tool and MCP). It SHALL take a registered HTML artifact's `entryPath`, 1–6 target `formats` (catalog ids) and optional `notes`, and SHALL NOT write any design file. For a **fixed** master, each format's entry SHALL have `mode: "new-file"`, a suggested entry path `<dir>/<base>-<formatId>.html`, instructions, and the arguments to register with. For a **fluid** master, each format's entry SHALL have `mode: "tune"` and instructions to check the master at that shape (in the preview, or with `export_open_design_artifact` and `checkOnly`), to fix what fails by adding or adjusting `@container` rules for that shape's aspect range in the master itself without breaking the other shapes, and to re-check every shape with a shape sheet. It SHALL have no new entry path or register arguments.

#### Scenario: Three adaptations of a fixed master
- **WHEN** `adapt_open_design_artifact` is called on a fixed `.open-design/launch/launch.html` with `["ig-portrait", "story", "a3"]`
- **THEN** the result SHALL contain three `new-file` entries with suggested paths `launch-ig-portrait.html`, `launch-story.html` and `launch-a3.html`, each with its own instructions

#### Scenario: Tuning a fluid master
- **WHEN** it is called on a fluid master with `["story"]`
- **THEN** the result SHALL contain one `tune` entry whose instructions edit the master's tall-shape rules, and no new file path

#### Scenario: Unregistered or missing master
- **WHEN** the entry path doesn't exist or has no manifest
- **THEN** the tool SHALL fail with a message saying to register the artifact first

### Requirement: Master and Adaptations Form a Collection
For a **fixed** master with no `collectionId`, the tool SHALL assign one and write it to the master's manifest with `screenRole: "master"`. The returned register arguments for each adaptation SHALL carry the same `collectionId`, `screenRole` equal to the format id, and `format`. Writing the master's manifest is the only file write. A **fluid** master SHALL NOT be given a collection by this tool, since its shapes live in one file.

#### Scenario: Collection browsing
- **WHEN** a fixed master and two adaptations are registered as instructed
- **THEN** the collection scan SHALL report one collection with three screens, and the VS Code Collections view SHALL list them

#### Scenario: Fluid master untouched
- **WHEN** a fluid master is adapted
- **THEN** its manifest SHALL be unchanged
