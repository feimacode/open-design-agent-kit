## MODIFIED Requirements

### Requirement: No Daemon or MCP Dependency
The system SHALL perform all of the above without spawning open-design's daemon process and without an MCP transport. All skill/design-system content SHALL be vendored into the extension at build time, not fetched live from a daemon or an open-design checkout at runtime. When a vendored skill's text instructs the model to use the Open Design daemon (e.g. `$OD_BIN`, `od media`, "OD daemon"), `prepare_open_design_brief` SHALL append after the skill text either a skill-specific host override that gives a daemon-free equivalent or, if none exists, a notice that the daemon-backed step is unavailable in this host and the model should tell the user rather than improvise. Vendored skill files SHALL NOT be edited to achieve this.

#### Scenario: Extension used with no open-design checkout present
- **WHEN** the extension is installed and activated on a machine with no open-design checkout and no `od` daemon running
- **THEN** all five tools SHALL function normally, sourcing content from the extension's own bundled `assets/open-design/` directory

#### Scenario: Skill with a daemon-free override
- **WHEN** `prepare_open_design_brief` is called for a skill that references the daemon and has a registered host override (e.g. `hyperframes`)
- **THEN** the returned instructions SHALL include the override, headed as taking precedence over the skill text above it

#### Scenario: Skill with no override
- **WHEN** `prepare_open_design_brief` is called for a skill that references the daemon and has no host override (e.g. `image-poster`)
- **THEN** the returned instructions SHALL include a notice that the daemon-backed step isn't available in this host

#### Scenario: Vendored content untouched
- **WHEN** content sync parity is checked after this change
- **THEN** every vendored upstream SKILL.md SHALL still match upstream byte for byte

### Requirement: Curated Slash-Command Shortcuts
The system SHALL generate a `chatPromptFiles` entry for each catalog entry that is curated. An entry is curated if it is flagged in upstream frontmatter (a top-level `featured`, a top-level `recommended`, or an `od.default_for` field) or if its id appears in the extension-owned local curation list. Each entry SHALL pin that entry's exact `skillId` and, when available, its curated `example_prompt` as the default input. This generation SHALL be idempotent and re-derived from vendored content and the local curation list on every content sync, not hand-maintained per host.

#### Scenario: A named, curated entry gets its own command
- **WHEN** a catalog entry carries a top-level `featured` or `recommended` key, or `od.default_for`
- **THEN** a `prompts/featured/<id>.prompt.md` file SHALL be generated pinning that exact `skillId`, and its path SHALL be included in `package.json`'s `contributes.chatPromptFiles`

#### Scenario: Locally curated entry gets its own command
- **WHEN** an entry with no upstream curation flag (e.g. `card-twitter`) is listed in the local curation list
- **THEN** a `prompts/featured/card-twitter.prompt.md` file SHALL be generated exactly as for an upstream-curated entry

#### Scenario: Unknown id in the local curation list
- **WHEN** the local curation list names an id that matches no catalog entry
- **THEN** content sync SHALL fail and name the unknown id

#### Scenario: Re-running content sync does not accumulate stale commands
- **WHEN** `npm run sync-content` is run again after upstream content or the local curation list changes which entries are curated
- **THEN** the generated `prompts/featured/` directory and the generated slice of `contributes.chatPromptFiles` SHALL both be fully replaced to match the current curated set, not merged with the previous run's output
