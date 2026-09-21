## MODIFIED Requirements

### Requirement: Skill and Design System Discovery
The system SHALL expose the vendored skill, design-template, and design system catalogs as `languageModelTools` (`list_open_design_skills`, `list_open_design_design_systems`) that return id/name/description for each entry, optionally filtered by a free-text query matched against name, description, and (for skills/design-templates) triggers and tags. Skills and design-templates SHALL be merged into a single catalog exposed by `list_open_design_skills`, each entry tagged with a `source` of `skill` or `design-template`; either may be passed as `skillId` to `prepare_open_design_brief`. Each entry's display name SHALL prefer an upstream `en_name` field over the raw `name` field when present, since `name` is frequently a machine slug rather than a human-readable title.

Each skill/design-template's returned `id` SHALL be namespaced as `od:<mode>:<dirId>`, where `mode` is derived from the entry's `od.mode` frontmatter field, normalized against a fixed vocabulary (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`), falling back to `other` when absent or unrecognized. `list_open_design_skills` SHALL support an exact `mode` filter in addition to free-text `query`. Tools accepting a `skillId` (`prepare_open_design_brief`) SHALL accept both the namespaced form and a bare directory id.

The system SHALL NOT allow two distinct vendored entries (across the skill, design-template, and example pools) to silently collide on a shared bare directory id — a routine occurrence, since an example is typically the rendered counterpart of a same-named skill or design-template and always shares that entry's `mode`, so the plain `od:<mode>:<dirId>` id alone does not disambiguate them. When two or more entries share a bare directory id, the highest-priority source (`skill`, then `design-template`, then `example`) SHALL keep the plain `od:<mode>:<dirId>` id, and every other colliding entry SHALL have its own source name appended (`od:<mode>:<dirId>:<source>`), so every vendored entry remains individually reachable and distinguishable rather than one silently replacing another.

#### Scenario: Listing without a query
- **WHEN** `list_open_design_skills` is invoked with no `query`
- **THEN** every vendored skill and design-template SHALL be returned, each with a `source` field and a namespaced `id`

#### Scenario: Human-readable display name
- **WHEN** an entry's frontmatter has an `en_name` distinct from its machine `name`/directory slug
- **THEN** the returned `name` SHALL be the `en_name` value

#### Scenario: Filtering by query
- **WHEN** `list_open_design_skills` is invoked with a `query` that matches a subset of skills' name/description/triggers
- **THEN** only the matching subset SHALL be returned

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

#### Scenario: A skill and its own same-named example both remain reachable
- **WHEN** a skill or design-template shares a bare directory id (and therefore the same `od:<mode>:<dirId>` id) with a vendored example
- **THEN** `list_open_design_skills` SHALL return both as distinct entries, the skill/design-template keeping the plain id and the example's id carrying an `:example` suffix

#### Scenario: A bare, ambiguous skillId prefers the task/style entry over its own example
- **WHEN** `prepare_open_design_brief` or `remix_open_design_example` is invoked with a bare directory id that matches both a skill/design-template and a same-named example
- **THEN** the skill or design-template SHALL be resolved, not the example — a caller wanting the example specifically SHALL use its `:example`-suffixed id, as returned by `list_open_design_skills`
