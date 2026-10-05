## ADDED Requirements

### Requirement: Adapt a Design to Other Formats
The system SHALL expose `adapt_open_design_artifact` in every host (VS Code tool and MCP). It SHALL take a registered HTML artifact's `entryPath`, 1–6 target `formats` (catalog ids) and optional `notes`. For each format it SHALL return a suggested entry path `<dir>/<base>-<formatId>.html`, instructions, and the arguments to register with. It SHALL NOT write any design file.

#### Scenario: Three adaptations of a master poster
- **WHEN** `adapt_open_design_artifact` is called on `.open-design/launch/launch.html` with `["ig-portrait", "story", "a3"]`
- **THEN** the result SHALL contain three entries with suggested paths `launch-ig-portrait.html`, `launch-story.html` and `launch-a3.html`, each with its own instructions

#### Scenario: Unregistered or missing master
- **WHEN** the entry path doesn't exist or has no manifest
- **THEN** the tool SHALL fail with a message saying to register the artifact first

### Requirement: Recompose, Don't Scale
Each format's instructions SHALL include the master's HTML, that format's Canvas section, and rules to keep the copy hierarchy and design tokens while re-flowing the layout for the new aspect ratio rather than scaling it. They SHALL give a content-priority order for dropping secondary elements in small or extreme-aspect formats, require `mm` and bleed rules for print targets, and require `data-od-field` and `data-od-qr` attributes to be carried over unchanged.

#### Scenario: Data fields survive adaptation
- **WHEN** the master contains `data-od-field="name"`
- **THEN** every adaptation's instructions SHALL require that field to be kept, so bulk export works on every size

### Requirement: Master and Adaptations Form a Collection
If the master has no `collectionId`, the tool SHALL assign one and write it to the master's manifest with `screenRole: "master"`. The returned register arguments for each adaptation SHALL carry the same `collectionId`, `screenRole` equal to the format id, and `format`. Writing the master's manifest is the only file write.

#### Scenario: Collection browsing
- **WHEN** a master and two adaptations are registered as instructed
- **THEN** the collection scan SHALL report one collection with three screens, and the VS Code Collections view SHALL list them

#### Scenario: Master already in a collection
- **WHEN** the master's manifest already has a `collectionId`
- **THEN** the tool SHALL reuse it and SHALL NOT change the master's manifest
