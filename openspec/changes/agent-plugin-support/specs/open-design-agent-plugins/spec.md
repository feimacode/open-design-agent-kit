## ADDED Requirements

### Requirement: MCP Server Tool Parity
The system SHALL provide a standalone MCP server (`packages/mcp-server`) exposing `list_open_design_skills`, `list_open_design_design_systems`, `prepare_open_design_brief`, `register_open_design_artifact`, `get_open_design_artifact`, `set_active_design_system`, `create_open_design_design_system`, `port_open_design_artifact_to_app`, and `remix_open_design_example` as MCP tools, matching the VS Code extension's `languageModelTools` of the same names in input parameters and returned data shape, so that guidance written for one host applies to the other without a tool-specific fork.

#### Scenario: Same tool name resolves the same request shape
- **WHEN** `prepare_open_design_brief` is invoked via the MCP server with a given `skillId`, optional `designSystemId`, and `brief`
- **THEN** the response SHALL include the same fields (`instructions`, `suggestedEntryPath`, resolved `designSystemId`/`designSystemName`) as the equivalent VS Code tool call

#### Scenario: Preview-specific language is omitted outside VS Code
- **WHEN** a tool response would, on VS Code, reference an automatically-opened preview editor
- **THEN** the MCP server's equivalent response SHALL instead state only that the file was written and its path, without referencing a preview editor that does not exist in this host

### Requirement: MCP Server Workspace Root and Local Persistence
The MCP server SHALL treat its own working directory (`process.cwd()` at launch) as the workspace root by default, overridable via an `OPEN_DESIGN_WORKSPACE_ROOT` environment variable. It SHALL persist the active design system id as a local JSON file (`.open-design/config.json` under the workspace root) rather than any editor-specific settings store, and SHALL write generated artifacts and manifests under the same workspace-root-relative `.open-design/` convention the VS Code extension uses by default.

#### Scenario: Default workspace root
- **WHEN** the MCP server is launched with no `OPEN_DESIGN_WORKSPACE_ROOT` set
- **THEN** it SHALL treat its own process working directory as the workspace root for all file reads and writes

#### Scenario: Active design system persists across tool calls
- **WHEN** `set_active_design_system` is invoked with a `designSystemId`, followed by a separate `prepare_open_design_brief` call with no explicit `designSystemId`
- **THEN** the second call SHALL resolve to the design system set by the first, read back from `.open-design/config.json`

#### Scenario: Stale active id degrades gracefully
- **WHEN** `.open-design/config.json` names a design system id no longer present in the vendored catalog
- **THEN** `prepare_open_design_brief` SHALL proceed as if no design system were active, rather than returning an error

### Requirement: No Editor Dependency in the MCP Server
The MCP server SHALL run and serve all nine tools correctly with no VS Code (or any other editor) process present, using only `packages/core`, `packages/content`, Node's filesystem APIs, and an MCP transport library. It SHALL NOT provide live preview, pinned comments, or WYSIWYG editing — these SHALL remain exclusive to the VS Code extension's webview-based editor.

#### Scenario: Runs standalone
- **WHEN** the MCP server is started via its `npx`-invocable binary in an environment with no editor or daemon process running
- **THEN** all nine tools SHALL function normally, sourcing content from `packages/content`'s bundled assets

#### Scenario: No preview/comment/edit tools are exposed
- **WHEN** an MCP client lists the tools this server provides
- **THEN** no tool for opening a live preview, reading/writing pinned comments, or performing WYSIWYG edits SHALL be present

### Requirement: Claude Code Plugin Bundle
The system SHALL provide a Claude Code plugin (`packages/claude-plugin`) bundling an MCP server registration for `packages/mcp-server`, one skill document (`skills/open-design/SKILL.md`) describing the end-to-end OpenDesign workflow, and a generated set of slash commands for curated vendored entries — mirroring, respectively, the VS Code extension's tool registration, its single `chatInstructions` document, and its generated `chatPromptFiles`. The plugin SHALL be installable directly from this repository via a root-level `.claude-plugin/marketplace.json`. The system SHALL NOT generate an individual Claude Skill per vendored OpenDesign skill or design-template.

#### Scenario: Plugin installs from the repo directly
- **WHEN** a user adds this repository as a Claude Code plugin marketplace and installs the OpenDesign plugin
- **THEN** the MCP server, the overview skill document, and the generated per-entry skills SHALL all become available in that Claude Code session without any manual MCP configuration step

#### Scenario: One overview skill document, not one per full-catalog entry
- **WHEN** the Claude Code plugin is installed
- **THEN** exactly one OpenDesign overview skill document SHALL be present, and the long tail of vendored skills/design-templates beyond the curated subset SHALL remain reachable only through the `list_open_design_skills` MCP tool, not as individually registered Claude Skills

#### Scenario: Curated entries get their own explicit-only skill
- **WHEN** a vendored catalog entry carries the same curation signal (`featured`, `recommended`, or `od.default_for`) that drives a VS Code prompt file today
- **THEN** the Claude Code plugin's `skills/` directory SHALL include a corresponding `disable-model-invocation: true` skill generated from that same signal, invocable as `/open-design:<id>`

### Requirement: Single Shared Vendored Content Source
The system SHALL sync skill/design-template/design-system/craft/example content from upstream exactly once, into `packages/content`, consumed by `packages/core`'s content index via an explicit root path. Neither `packages/vscode` nor `packages/mcp-server` SHALL run its own independent sync from the upstream source. A host package MAY hold a mechanically-produced, drift-guarded mirror of `packages/content`'s assets when its own packaging model requires the content to be physically present inside its own distributable (as VS Code's `.vsix` packaging does); such a mirror SHALL be regenerated as part of the same sync pass that refreshes `packages/content`, and SHALL be checked for drift against the canonical copy as part of that package's lint/check step.

#### Scenario: Both hosts read the same synced content
- **WHEN** the vendored content is refreshed by the shared sync script
- **THEN** both the VS Code extension (via its regenerated mirror) and the MCP server (reading `packages/content` directly) SHALL reflect the updated catalog, without either package running its own separate sync from upstream

#### Scenario: A stale mirror is caught, not silently shipped
- **WHEN** `packages/content`'s assets are refreshed but a dependent package's own mirrored copy is not regenerated to match
- **THEN** that package's drift-check step SHALL fail with a clear message naming the mismatch, rather than silently packaging stale content

### Requirement: Shared Curated-Entry Generation
The system SHALL generate slash-command/skill artifacts for both the VS Code extension and the Claude Code plugin from one shared generator and one shared curation signal, rather than two independently maintained generators.

#### Scenario: Regenerating updates both outputs consistently
- **WHEN** the shared content-sync pass is run after upstream content changes which entries are curated
- **THEN** both the VS Code `prompts/featured/` output and the Claude Code plugin's `skills/` output SHALL be regenerated from the same curation signal in the same run

### Requirement: Codex Integration Documentation
The system SHALL document, in `docs/codex.md`, how to register the MCP server with Codex CLI (both the `codex mcp add` command and the equivalent `~/.codex/config.toml` `[mcp_servers.open-design]` table) and how to make the OpenDesign skill available to Codex by copying `packages/claude-plugin/skills/open-design/SKILL.md` into a project's `.agents/skills/open-design/SKILL.md`, as manual steps a user performs themselves. The system SHALL NOT automatically modify a user's global Codex configuration, a project's `.agents/skills/`, or any file outside the current workspace. This requirement covers documentation and the already-generic MCP server/skill file only; it does not commit to building against Codex's separate, account-level shared plugin directory (distributed jointly with ChatGPT), which requires a submission process outside this repo's control.

#### Scenario: Documented Codex registration works with the existing MCP server
- **WHEN** a user follows the documented `codex mcp add` command or `config.toml` snippet to register the MCP server with Codex CLI
- **THEN** Codex SHALL be able to invoke the same nine tools as any other MCP client, with no Codex-specific server code required

#### Scenario: The same skill file works for both hosts
- **WHEN** a user copies `packages/claude-plugin/skills/open-design/SKILL.md` into their project's `.agents/skills/open-design/SKILL.md`
- **THEN** Codex SHALL be able to discover and invoke it without any rewrite of its frontmatter or body

#### Scenario: No automatic global config changes
- **WHEN** any part of this system runs (sync scripts, the MCP server itself, or the Claude Code plugin)
- **THEN** none of them SHALL write to `~/.codex/config.toml`, a project's `.agents/skills/`, or any other file outside the current project workspace on the user's behalf
