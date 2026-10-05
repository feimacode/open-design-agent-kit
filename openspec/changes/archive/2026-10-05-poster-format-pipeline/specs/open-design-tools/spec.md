## MODIFIED Requirements

### Requirement: Brief Preparation Without File Writes
The system SHALL expose `prepare_open_design_brief`, which composes generation instructions from a chosen skill, an optional design system, universal craft rules, the caller's brief, an optional canvas `format`, and a best-effort signal of whether the workspace already contains a real application. It returns those instructions plus a suggested workspace-relative entry path. This tool SHALL NOT write any files.

#### Scenario: Valid skill, no design system
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId` and a `brief`, and no `designSystemId`
- **THEN** the returned instructions SHALL include the skill's workflow body and the brief, and SHALL NOT reference a design system section

#### Scenario: Valid skill and design system
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId` and a valid `designSystemId`
- **THEN** the returned instructions SHALL include both the skill's workflow body and the design system's token content, with the design system marked authoritative for visual tokens

#### Scenario: Canvas format given
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId`, a `brief` and `format: "a3"`
- **THEN** the returned instructions SHALL include the Canvas section for A3 defined by the poster-formats capability, the result SHALL echo the format id, and no file SHALL be written

#### Scenario: Unknown format
- **WHEN** `prepare_open_design_brief` is invoked with an unknown `format`
- **THEN** the tool SHALL return an error listing the valid format ids

#### Scenario: Unknown skillId
- **WHEN** `prepare_open_design_brief` is invoked with a `skillId` that does not exist in the vendored catalog
- **THEN** the tool SHALL return an error message naming the problem and pointing the caller back to `list_open_design_skills`, rather than silently proceeding

#### Scenario: Existing-app detection nudges without changing where the artifact is written
- **WHEN** the open workspace's `package.json` lists a recognized application framework
- **THEN** the returned instructions SHALL include a note naming the detected framework(s) and encouraging the model to check the app's real existing conventions, while still directing the artifact to be written as a standalone file at the usual suggested entry path

#### Scenario: No workspace or no recognizable framework degrades silently
- **WHEN** no workspace folder is open, or the workspace's `package.json` is absent, unparseable, or lists no recognized framework
- **THEN** `prepare_open_design_brief` SHALL behave exactly as it did before this detection existed, with no error and no existing-app section in the returned instructions
