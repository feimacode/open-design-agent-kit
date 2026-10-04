## ADDED Requirements

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
