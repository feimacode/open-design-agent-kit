## ADDED Requirements

### Requirement: Persistent, Sticky Active Design System
The system SHALL persist a single active design system id per workspace as the `openDesign.activeDesignSystemId` setting. `prepare_open_design_brief` SHALL treat `designSystemId` as optional, falling back to the active setting when omitted, and SHALL update the active setting to match whenever an explicit `designSystemId` is given. A stale active id that no longer resolves to a known design system SHALL be treated as no active design system, without producing an error. `list_open_design_design_systems` SHALL mark the currently active entry with `active: true`. `prepare_open_design_brief`'s response SHALL include the resolved `designSystemId` and `designSystemName` actually used, if any.

#### Scenario: Falling back to the active design system
- **WHEN** `prepare_open_design_brief` is invoked with no `designSystemId`, and an active design system is set
- **THEN** that active design system SHALL be used, and its id/name SHALL be reflected in the response

#### Scenario: Explicit selection becomes the new active one
- **WHEN** `prepare_open_design_brief` is invoked with an explicit, valid `designSystemId`
- **THEN** that id SHALL become the new active design system for subsequent requests in the same workspace

#### Scenario: Stale active id degrades gracefully
- **WHEN** the active setting names a design system id that no longer exists in the vendored catalog
- **THEN** `prepare_open_design_brief` SHALL proceed as if no design system were active, rather than returning an error

#### Scenario: Active flag in listings
- **WHEN** `list_open_design_design_systems` is invoked while a design system is active
- **THEN** that entry's result SHALL include `active: true`, and all others SHALL include `active: false`

### Requirement: Direct Active Design System Management
The system SHALL provide a `set_active_design_system` tool to set or clear the active design system without requiring an artifact generation, a native command (`OpenDesign: Browse Design Systems`) that sets the active design system on pick from a category-grouped, fuzzy-searchable list, and a persistent status bar item showing the current active design system (or its absence) that opens the same picker on click.

#### Scenario: Setting via tool
- **WHEN** `set_active_design_system` is invoked with a valid `designSystemId`
- **THEN** it SHALL become the active design system, confirmed in the tool's response

#### Scenario: Clearing via tool
- **WHEN** `set_active_design_system` is invoked with no `designSystemId` (or an empty string)
- **THEN** the active design system SHALL be cleared

#### Scenario: Status bar reflects current state
- **WHEN** the active design system changes, by any means (tool, command, or a direct settings edit)
- **THEN** the status bar item SHALL update to show the new active design system's name, or "No design system" when cleared
