## ADDED Requirements

### Requirement: Published `init` Command
The system SHALL provide a published npm package (`@feimacode/open-design-agent-kit`) with a `bin` command exposing an `init [path]` subcommand (default path `.`), runnable via `npx` with no prior installation, that sets up OpenDesign's Claude Code and/or Codex integration directly inside the target path.

#### Scenario: Running via npx with no prior install
- **WHEN** a user runs `npx @feimacode/open-design-agent-kit init` in a project directory
- **THEN** the command SHALL execute without requiring any separate install step first

### Requirement: Tool Selection
The command SHALL let the user choose which of `claude` and `codex` to set up, via an interactive checkbox prompt when run interactively, or via a `--tools <comma-separated-list|all>` flag for non-interactive use.

#### Scenario: Interactive selection
- **WHEN** `init` is run in an interactive terminal with no `--tools` flag
- **THEN** the user SHALL be prompted to select one or more of `claude`/`codex` before any file is written

#### Scenario: Non-interactive selection
- **WHEN** `init --tools claude,codex` (or `--tools all`) is run
- **THEN** the corresponding tools SHALL be set up without any interactive prompt

### Requirement: Claude Code Setup Writes Standalone Skills and Merges MCP Registration
When `claude` is selected, the command SHALL write `.claude/skills/open-design/SKILL.md` and one `.claude/skills/<id>/SKILL.md` per curated OpenDesign entry into the target path, using the same generated content as `packages/claude-plugin/skills/`, and SHALL merge an `open-design` entry into the target path's `.mcp.json` (creating it if absent) without altering any other entry already present there.

#### Scenario: Fresh project, no existing .mcp.json
- **WHEN** `claude` is selected and the target path has no `.mcp.json`
- **THEN** a new `.mcp.json` SHALL be created containing only the `open-design` MCP server entry

#### Scenario: Existing .mcp.json with other servers
- **WHEN** `claude` is selected and the target path's `.mcp.json` already registers one or more other MCP servers
- **THEN** those entries SHALL remain unchanged, and an `open-design` entry SHALL be added or updated alongside them

#### Scenario: Skill content matches the Claude Code plugin
- **WHEN** `claude` is selected
- **THEN** the written `.claude/skills/open-design/SKILL.md` and per-curated-entry skill files SHALL contain the same content as `packages/claude-plugin/skills/`'s corresponding files

### Requirement: Codex Setup Copies Generated Skills and Conditionally Writes MCP Registration
When `codex` is selected, the command SHALL copy this repo's generated `.agents/skills/` tree into the target path's `.agents/skills/`, and SHALL write a project-scoped `.codex/config.toml` containing an `[mcp_servers.open-design]` table only when that file does not already exist at the target path; when it does exist, the command SHALL print the registration snippet instead of modifying the file.

#### Scenario: Fresh project, no existing .codex/config.toml
- **WHEN** `codex` is selected and the target path has no `.codex/config.toml`
- **THEN** a new `.codex/config.toml` SHALL be created containing the `[mcp_servers.open-design]` table

#### Scenario: Existing .codex/config.toml is never rewritten
- **WHEN** `codex` is selected and the target path already has a `.codex/config.toml`
- **THEN** that file SHALL NOT be modified, and the command SHALL print the `[mcp_servers.open-design]` snippet for the user to add themselves

#### Scenario: Codex skill content matches the generated .agents/skills/
- **WHEN** `codex` is selected
- **THEN** the copied `.agents/skills/` tree SHALL match this repo's own generated `.agents/skills/` content, including the per-curated-entry `agents/openai.yaml` sidecars

### Requirement: Re-running `init` Is Safe
The command SHALL be safe to run more than once against the same target path. Generated skill files SHALL be fully regenerated on every run without requiring the user to remove old ones first. Any existing `.mcp.json` or `.codex/config.toml` content not belonging to the `open-design` entry SHALL never be lost across repeated runs.

#### Scenario: Re-running after a content update
- **WHEN** `init` is run a second time against a target path that already has OpenDesign's Claude Code and/or Codex files set up
- **THEN** the skill files SHALL be refreshed to the current generated content, and no previously-added, non-`open-design` entries in `.mcp.json` SHALL be removed

### Requirement: No Writes Outside the Target Path
The command SHALL only ever write inside the resolved target path given to `init`. It SHALL NOT write to any location outside that path, including global user configuration directories (e.g. `~/.codex/`, `~/.claude/`).

#### Scenario: No global config touched
- **WHEN** `init` is run against a project directory
- **THEN** no file outside that directory SHALL be created or modified
