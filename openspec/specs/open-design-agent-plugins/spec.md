# open-design-agent-plugins

## Purpose

How agent hosts other than VS Code (Claude Code, Codex and other MCP clients) reach Open Design: the MCP server, the Claude Code plugin, generated skills, and discovery aids such as the remixable-examples reference and MCP prompts. The foundational requirements arrive with the agent-plugin-support change.

## Requirements

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

### Requirement: Remixable Example Prompts
The MCP server SHALL declare the `prompts` capability and expose one MCP prompt per vendored remixable example (catalog entries with `source: 'example'` and a non-empty `exampleArtifactPath`), so a Claude Code user can pick a starting example directly from the client's prompt picker rather than only through a tool call. Each prompt's `name` SHALL be the entry's namespaced public id with colons replaced by hyphens (e.g. `od-video-frame-liquid-bg-hero`). Selecting a prompt SHALL NOT write, generate, or register any file — it SHALL only return message text for the client to present to the user.

#### Scenario: Listing remixable example prompts
- **WHEN** an MCP client calls `prompts/list` on the server
- **THEN** the response SHALL include exactly one prompt entry per catalog entry with `source: 'example'` and a non-empty `exampleArtifactPath`, and no entries for skills or design-templates

#### Scenario: Prompt name is hyphenated
- **WHEN** a remixable example's public id is `od:video:frame-liquid-bg-hero`
- **THEN** its corresponding MCP prompt's `name` SHALL be `od-video-frame-liquid-bg-hero`

#### Scenario: Getting a prompt returns the example's brief
- **WHEN** an MCP client calls `prompts/get` with a valid remixable-example prompt `name`
- **THEN** the response SHALL contain a single user-role text message of the form `Use the OpenDesign skill "<publicId>" (<displayName>). <examplePrompt>`, with no file writes performed

#### Scenario: Unknown prompt name
- **WHEN** an MCP client calls `prompts/get` with a `name` that does not match any remixable example
- **THEN** the server SHALL return an error rather than a malformed or empty prompt result
