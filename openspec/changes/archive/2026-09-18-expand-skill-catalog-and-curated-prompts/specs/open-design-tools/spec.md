## MODIFIED Requirements

### Requirement: Skill and Design System Discovery
The system SHALL expose the vendored skill, design-template, and design system catalogs as `languageModelTools` (`list_open_design_skills`, `list_open_design_design_systems`) that return id/name/description for each entry, optionally filtered by a free-text query matched against name, description, and (for skills/design-templates) triggers and tags. Skills and design-templates SHALL be merged into a single catalog exposed by `list_open_design_skills`, each entry tagged with a `source` of `skill` or `design-template`; either may be passed as `skillId` to `prepare_open_design_brief`. Each entry's display name SHALL prefer an upstream `en_name` field over the raw `name` field when present, since `name` is frequently a machine slug rather than a human-readable title.

#### Scenario: Listing without a query
- **WHEN** `list_open_design_skills` is invoked with no `query`
- **THEN** every vendored skill and design-template SHALL be returned, each with a `source` field

#### Scenario: Filtering by query
- **WHEN** `list_open_design_skills` is invoked with a `query` that matches a subset of entries' name/description/triggers/tags
- **THEN** only the matching subset SHALL be returned

#### Scenario: Human-readable display name
- **WHEN** an entry's frontmatter has an `en_name` distinct from its machine `name`/directory slug
- **THEN** the returned `name` SHALL be the `en_name` value

## ADDED Requirements

### Requirement: Curated Slash-Command Shortcuts
The system SHALL generate a `chatPromptFiles` entry for each catalog entry flagged as curated in upstream frontmatter (presence of a top-level `featured`, a top-level `recommended`, or an `od.default_for` field), pinning that entry's exact `skillId` and, when available, its curated `example_prompt` as the default input. This generation SHALL be idempotent and re-derived from vendored content on every content sync, not hand-maintained.

#### Scenario: A named, curated entry gets its own command
- **WHEN** a catalog entry carries a top-level `featured` or `recommended` key, or `od.default_for`
- **THEN** a `prompts/featured/<id>.prompt.md` file SHALL be generated pinning that exact `skillId`, and its path SHALL be included in `package.json`'s `contributes.chatPromptFiles`

#### Scenario: Re-running content sync does not accumulate stale commands
- **WHEN** `npm run sync-content` is run again after upstream content changes which entries are curated
- **THEN** the generated `prompts/featured/` directory and the generated slice of `contributes.chatPromptFiles` SHALL both be fully replaced to match the current curated set, not merged with the previous run's output
