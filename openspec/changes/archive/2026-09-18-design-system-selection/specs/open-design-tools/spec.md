## ADDED Requirements

### Requirement: Design System Category Filtering and Native Browsing
The system SHALL read each design system's canonical `manifest.json` (name, category, description, `craft.suggested`) when present, falling back to parsing `DESIGN.md`'s heading/blockquote only for legacy entries without one. `list_open_design_design_systems` SHALL support an exact `category` filter in addition to free-text `query` (which SHALL also match against `category`), and SHALL return each result's `category`. The system SHALL additionally provide a native command (`OpenDesign: Browse Design Systems`) that presents all design systems in a category-grouped, fuzzy-searchable picker and, on selection, opens Copilot Chat with a prefilled, editable message naming the chosen design system.

#### Scenario: manifest.json is the canonical source
- **WHEN** a design system folder contains both `DESIGN.md` and `manifest.json`
- **THEN** its returned name, category, and summary SHALL come from `manifest.json`, not from parsing `DESIGN.md`

#### Scenario: Legacy fallback
- **WHEN** a design system folder contains `DESIGN.md` but no `manifest.json`
- **THEN** its name and summary SHALL be derived from `DESIGN.md`'s leading heading and blockquote, and its category SHALL be absent

#### Scenario: Filtering by exact category
- **WHEN** `list_open_design_design_systems` is invoked with a `category` matching an existing category exactly
- **THEN** only design systems in that category SHALL be returned

#### Scenario: Browsing without leaving the keyboard
- **WHEN** the user runs the `OpenDesign: Browse Design Systems` command and selects a design system from the picker
- **THEN** Copilot Chat SHALL open with an editable message naming that design system's id, without the command writing or sending anything on the user's behalf

### Requirement: Craft Rules Follow the Active Design System's Own Suggestions
When composing a generation brief, the system SHALL narrow the applied craft-rule set to the active design system's `craft.suggested` list (from its `manifest.json`) when that list is non-empty. When no design system is active, or the active one has no suggestion list, every vendored craft doc SHALL still be applied, matching prior behavior.

#### Scenario: Design system with a suggested craft list
- **WHEN** `prepare_open_design_brief` is invoked with a `designSystemId` whose `craft.suggested` names a non-empty subset of the craft catalog
- **THEN** only that subset SHALL be included in the composed instructions

#### Scenario: No design system, or one without a suggestion list
- **WHEN** `prepare_open_design_brief` is invoked with no `designSystemId`, or one whose `craft.suggested` is empty or absent
- **THEN** every vendored craft doc SHALL be included, as before this change
