## ADDED Requirements

### Requirement: Remixable Examples Reference File
The Claude Code plugin's and Codex's `open-design` overview skill SHALL each include a generated `references/remixable-examples.md` listing every vendored remixable example (an entry with a non-empty `exampleArtifactPath`), grouped by `mode`, each entry naming its plain `id`, display name, and description. Each `SKILL.md` SHALL link to this file via a plain markdown link, so it is available to the calling model on demand without requiring a tool call to discover what's remixable. The reference file's content SHALL be generated from a single shared source shared by both platforms' generators, not independently derived per platform.

#### Scenario: Full example pool is covered
- **WHEN** the reference file is generated
- **THEN** it SHALL include every vendored example with a non-empty `exampleArtifactPath`, not only curated/featured ones

#### Scenario: Grouped by mode
- **WHEN** the reference file is generated
- **THEN** its entries SHALL be grouped under their `mode` heading (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`, or `other`)

#### Scenario: Linked from the overview skill
- **WHEN** a user or model reads the `open-design` overview skill's `SKILL.md`
- **THEN** it SHALL contain a markdown link to `references/remixable-examples.md`

#### Scenario: Identical content on both platforms
- **WHEN** the reference file is generated for both the Claude Code plugin and Codex's `.agents/skills/`
- **THEN** both copies SHALL contain identical example listings, sourced from the same generator
