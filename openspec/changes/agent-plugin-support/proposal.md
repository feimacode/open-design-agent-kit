## Why

Today OpenDesign only works inside VS Code, wired to Copilot Chat via native `languageModelTools`. The monorepo split done two rounds ago (`packages/core` vs `packages/vscode`) was explicitly done in preparation for "a future npm package usable from Claude Code, Codex, and other agent hosts" — that second surface doesn't exist yet. This change plans (does not yet build) the shape of that surface: a transport any MCP-capable coding agent can use, plus a first-class Claude Code plugin on top of it, so OpenDesign's skills/design-systems/artifact workflow works the same way outside VS Code, not just inside it.

## What Changes

- Extract vendored content (skills, design-templates, design systems, craft, examples — currently under `packages/vscode/assets/open-design/`) into a new `packages/content` package, so it has exactly one home shared by every consumer instead of being owned by the VS Code package alone. **BREAKING** for anything that currently reads `packages/vscode/assets/open-design/` directly (only the sync/check-drift scripts and `ContentIndex`'s default root do today).
- Add a small core-level `ActiveDesignSystemStore` interface (get/set/clear) to `packages/core`, replacing the assumption that "persist the active design system" is inherently a VS Code settings concern. `packages/vscode` keeps its existing `vscode.workspace.getConfiguration`-backed implementation, now satisfying this interface instead of being a one-off.
- New `packages/mcp-server` (`@feimacode/open-design-agent-kit-mcp`): a stdio MCP server exposing the same tool set, names, and input/output shapes as today's VS Code `languageModelTools`, backed by `packages/core` + `packages/content`, with a plain-filesystem `ActiveDesignSystemStore` implementation (`.open-design/config.json` under the launching process's cwd) and a plain-`fs` artifact writer (reusing `artifactCreate`'s existing injectable `writeProjectFile` callback — no core change needed there). Live preview, comments, and WYSIWYG editing remain VS-Code-webview-only and are explicitly not ported.
- New `packages/claude-plugin`: a Claude Code plugin bundling (a) an MCP server registration (a `.mcp.json` file) pointing at `packages/mcp-server`, (b) one `skills/open-design/SKILL.md` overview skill (a Claude-Skill-frontmatter port of today's single `open-design.instructions.md` — the full ~280-entry catalog stays behind the MCP list tool, not one skill per vendored OD skill), and (c) one explicit-only skill per curated entry, generated from the same curation signal that drives today's 23 VS Code prompt files. A root-level `.claude-plugin/marketplace.json` makes the plugin installable straight from this repo.
- Document (not automate) Codex CLI support: register `packages/mcp-server` as an `[mcp_servers.open-design]` entry in `~/.codex/config.toml`, plus an optional AGENTS.md instructions snippet the user copies in manually. This part is explicitly exploratory/lower-confidence — Codex's plugin/skill-bundling surface is thinner than Claude Code's and should be re-verified against its current docs before implementation, not assumed from this session's knowledge.
- Shared curated-entry generator: the logic that turns curated vendored-content signals into slash-command files gets one shared implementation emitting both the VS Code `chatPromptFiles` shape and the Claude Code `skills/<id>/SKILL.md` shape, instead of two independently-maintained generators.

## Capabilities

### New Capabilities
- `open-design-agent-plugins`: MCP server + Claude Code plugin surface exposing OpenDesign's skill/design-system/artifact workflow to non-VS-Code coding agents, plus exploratory Codex integration guidance.

### Modified Capabilities
- `open-design-tools`: found during this change (checking bare-id naming consistency across hosts), not caused by it — the "Skill and Design System Discovery" requirement's catalog merge silently dropped 129 of 444 vendored entries whenever a skill/design-template shared a bare directory name with a same-named example (common, since an example is typically that skill's own rendered counterpart). Fixed in `packages/core`'s shared `ContentIndex`, so it applies to `list_open_design_skills` on both VS Code and the new MCP server identically. Its "No Daemon or MCP Dependency" requirement is untouched — this change still adds an independent, additive path for other hosts, not a transport change.

## Impact

- New packages: `packages/content`, `packages/mcp-server`, `packages/claude-plugin`; new root `.claude-plugin/marketplace.json`.
- Moved: `packages/vscode/assets/open-design/`, `packages/vscode/scripts/sync-open-design-content.mjs`, `packages/vscode/scripts/check-content-sync.mjs`, and `packages/vscode/scripts/generate-featured-prompts.mjs` relocate into or get shared out of `packages/content` (exact split detailed in design.md).
- `packages/core`: adds `ActiveDesignSystemStore` interface; no existing export's behavior changes.
- `packages/vscode`: `ContentIndex` instantiation and the sync/check-drift npm scripts repoint at `packages/content`; `activeDesignSystem.ts` implements the new interface instead of being freestanding. No behavior change from a VS Code user's perspective.
- No implementation in this round — this proposal, its design, and its task list are the planning artifacts; building starts only once explicitly approved.
