## MODIFIED Requirements

### Requirement: Skill and Design System Discovery
The system SHALL expose the vendored skill, design-template, and design system catalogs as `languageModelTools` (`list_open_design_skills`, `list_open_design_design_systems`) that return id/name/description for each entry, optionally filtered by a free-text query matched against name, description, and (for skills/design-templates) triggers and tags. Skills and design-templates SHALL be merged into a single catalog exposed by `list_open_design_skills`, each entry tagged with a `source` of `skill` or `design-template`; either may be passed as `skillId` to `prepare_open_design_brief`. Each entry's display name SHALL prefer an upstream `en_name` field over the raw `name` field when present, since `name` is frequently a machine slug rather than a human-readable title.

Each skill/design-template's returned `id` SHALL be namespaced as `od:<mode>:<dirId>`, where `mode` is derived from the entry's `od.mode` frontmatter field, normalized against a fixed vocabulary (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`), falling back to `other` when absent or unrecognized. `list_open_design_skills` SHALL support an exact `mode` filter in addition to free-text `query`. Tools accepting a `skillId` (`prepare_open_design_brief`) SHALL accept both the namespaced form and a bare directory id.

#### Scenario: Listing without a query
- **WHEN** `list_open_design_skills` is invoked with no `query`
- **THEN** every vendored skill and design-template SHALL be returned, each with a `source` field and a namespaced `id`

#### Scenario: Filtering by query
- **WHEN** `list_open_design_skills` is invoked with a `query` that matches a subset of entries' name/description/triggers/tags
- **THEN** only the matching subset SHALL be returned

#### Scenario: Human-readable display name
- **WHEN** an entry's frontmatter has an `en_name` distinct from its machine `name`/directory slug
- **THEN** the returned `name` SHALL be the `en_name` value

#### Scenario: Mode-namespaced id
- **WHEN** an entry's `od.mode` frontmatter field is `deck`
- **THEN** its returned `id` SHALL be `od:deck:<dirId>`

#### Scenario: Unknown or missing mode
- **WHEN** an entry has no `od.mode` field, or an unrecognized value
- **THEN** its returned `id` SHALL use `other` as the mode segment

#### Scenario: Filtering by exact mode
- **WHEN** `list_open_design_skills` is invoked with a `mode` matching one of the fixed vocabulary values
- **THEN** only entries with that mode SHALL be returned

#### Scenario: skillId lookup accepts both id forms
- **WHEN** `prepare_open_design_brief` is invoked with a `skillId` that is either the full namespaced form or a bare directory id matching a vendored entry
- **THEN** the corresponding skill or design-template SHALL be resolved in both cases
