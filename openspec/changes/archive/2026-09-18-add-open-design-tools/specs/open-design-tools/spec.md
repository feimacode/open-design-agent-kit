## ADDED Requirements

### Requirement: Skill and Design System Discovery
The system SHALL expose the vendored skill and design system catalogs as `languageModelTools` (`list_open_design_skills`, `list_open_design_design_systems`) that return id/name/description for each entry, optionally filtered by a free-text query matched against name, description, and (for skills) triggers.

#### Scenario: Listing without a query
- **WHEN** `list_open_design_skills` is invoked with no `query`
- **THEN** every vendored skill SHALL be returned

#### Scenario: Filtering by query
- **WHEN** `list_open_design_skills` is invoked with a `query` that matches a subset of skills' name/description/triggers
- **THEN** only the matching subset SHALL be returned

### Requirement: Brief Preparation Without File Writes
The system SHALL expose `prepare_open_design_brief`, which composes generation instructions from a chosen skill, an optional design system, universal craft rules, and the caller's brief, and returns those instructions plus a suggested workspace-relative entry path. This tool SHALL NOT write any files.

#### Scenario: Valid skill, no design system
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId` and a `brief`, and no `designSystemId`
- **THEN** the returned instructions SHALL include the skill's workflow body and the brief, and SHALL NOT reference a design system section

#### Scenario: Valid skill and design system
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId` and a valid `designSystemId`
- **THEN** the returned instructions SHALL include both the skill's workflow body and the design system's token content, with the design system marked authoritative for visual tokens

#### Scenario: Unknown skillId
- **WHEN** `prepare_open_design_brief` is invoked with a `skillId` that does not exist in the vendored catalog
- **THEN** the tool SHALL return an error message naming the problem and pointing the caller back to `list_open_design_skills`, rather than silently proceeding

### Requirement: Artifact Registration Requires an Existing Entry File
The system SHALL expose `register_open_design_artifact`, which validates and writes an artifact manifest sidecar (`<entry>.artifact.json`) next to an already-written entry file. It SHALL reject registration when the entry file does not yet exist in the workspace.

#### Scenario: Entry file already written
- **WHEN** `register_open_design_artifact` is invoked with an `entryPath` that exists in the workspace, plus a valid `kind` and `title`
- **THEN** a manifest sidecar SHALL be written at `<entryPath>.artifact.json` containing the validated manifest

#### Scenario: Entry file missing
- **WHEN** `register_open_design_artifact` is invoked with an `entryPath` that does not exist in the workspace
- **THEN** the tool SHALL return an error instructing the caller to write the file first, and SHALL NOT write a manifest

### Requirement: Artifact Readback
The system SHALL expose `get_open_design_artifact`, returning the manifest (if present), entry file content, and supporting file list for a given workspace-relative entry path.

#### Scenario: Registered artifact
- **WHEN** `get_open_design_artifact` is invoked with an `entryPath` that has both an entry file and a manifest sidecar
- **THEN** the manifest, entry content, and supporting file list SHALL all be returned

#### Scenario: Entry file not found
- **WHEN** `get_open_design_artifact` is invoked with an `entryPath` that does not exist
- **THEN** the tool SHALL return a clear "not found" result rather than throwing

### Requirement: No Daemon or MCP Dependency
The system SHALL perform all of the above without spawning open-design's daemon process and without an MCP transport. All skill/design-system content SHALL be vendored into the extension at build time, not fetched live from a daemon or an open-design checkout at runtime.

#### Scenario: Extension used with no open-design checkout present
- **WHEN** the extension is installed and activated on a machine with no open-design checkout and no `od` daemon running
- **THEN** all five tools SHALL function normally, sourcing content from the extension's own bundled `assets/open-design/` directory

### Requirement: Native File Authoring
The system SHALL NOT provide any tool that writes design content (HTML/CSS/JS/etc.) on the caller's behalf. Artifact content SHALL be authored by the calling model using VS Code's own native file-editing tools; the extension's only file-write responsibility is the artifact manifest sidecar.

#### Scenario: Generation flow
- **WHEN** a chat agent follows the documented flow (list skills → optionally list design systems → prepare_open_design_brief → author files → register_open_design_artifact)
- **THEN** the entry and supporting files SHALL be written by the calling model's own tools, and this extension SHALL only have written the `.artifact.json` sidecar
