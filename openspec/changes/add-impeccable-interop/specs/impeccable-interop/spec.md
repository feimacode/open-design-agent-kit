## ADDED Requirements

### Requirement: Product Context From PRODUCT.md
When the workspace root has a `PRODUCT.md`, `prepare_open_design_brief` SHALL include a "Product context" section taken from it, at most about 1,500 characters, with its headings kept. It SHALL look at the root, then `.agents/context/`, then `docs/`. When there is no `PRODUCT.md`, the brief SHALL be unchanged.

#### Scenario: Short PRODUCT.md
- **WHEN** the workspace root has a 600-character `PRODUCT.md` and the agent prepares a brief
- **THEN** the brief SHALL contain a "Product context" section with that text

#### Scenario: Long PRODUCT.md
- **WHEN** the root `PRODUCT.md` is 10,000 characters
- **THEN** the section SHALL be cut to the cap and SHALL keep the file's headings

### Requirement: Root DESIGN.md Notice
When the workspace root has a `DESIGN.md` and no design system is active, the brief SHALL say a project `DESIGN.md` was found and can be made the active design system. The server SHALL NOT change that file.

#### Scenario: Found
- **WHEN** a root `DESIGN.md` exists and no design system is active
- **THEN** the brief SHALL include the notice, and the file SHALL be unchanged

### Requirement: Write Project DESIGN.md Only When Absent
`set_active_design_system` SHALL accept `writeProjectDesignMd: true`. With it, the server SHALL write the active system's reconciled `DESIGN.md` to the workspace root only if no file exists there, and SHALL report `written` or `kept-existing`. It SHALL never overwrite an existing file.

#### Scenario: No file yet
- **WHEN** there is no root `DESIGN.md` and the option is set
- **THEN** the file SHALL be written and the result SHALL say `written`

#### Scenario: Existing file
- **WHEN** a root `DESIGN.md` exists and the option is set
- **THEN** the file SHALL be unchanged and the result SHALL say `kept-existing`

### Requirement: Impeccable Handoff in the Skill
The overview skill SHALL tell the agent, after `port_open_design_artifact_to_app`, to suggest `/impeccable polish` or `/impeccable audit` on the ported component when an `impeccable` skill is in its skill list, and to suggest nothing about Impeccable otherwise.

#### Scenario: Impeccable installed
- **WHEN** the agent has an `impeccable` skill and ports a design to app code
- **THEN** its reply SHALL end with one suggestion to run `/impeccable polish` or `/impeccable audit` on that component
