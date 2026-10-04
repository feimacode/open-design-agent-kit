## Why

Claude Code and Codex have no way to browse OpenDesign's 167 remixable examples other than eyeballing all 444 mixed catalog entries — VS Code has a Gallery UI for this, the text-only hosts have nothing. 21 of those examples already carry upstream `featured`/`recommended` signal that nothing currently surfaces. Explored this session with the user (4 options, findings verified against real data and each platform's actual docs); the two cheapest, most idiomatic ones were approved to build now.

## What Changes

- `list_open_design_skills` gains a `source` filter (`skill`/`design-template`/`example`) and a `remixableOnly` boolean (only entries with a non-empty `exampleArtifactPath`) — implemented once in `packages/core`'s `ContentIndex.listSkills()`, so every host (VS Code, MCP server, and therefore Claude Code/Codex) gets it identically. Tool schema/description updated in both `packages/vscode/package.json` and `packages/mcp-server/src/index.ts` to stay in parity.
- A new generated `references/remixable-examples.md` inside the `open-design` overview skill, for both `packages/claude-plugin/skills/open-design/` and the repo-root `.agents/skills/open-design/` — the full 167-example pool, grouped by category, one line each (id, display name, description). Linked from each `SKILL.md` body via a plain markdown link, matching Claude Code's own documented progressive-disclosure pattern (their docs name "example collections" as the canonical use case) and Codex's `references/` convention.
- Deliberately NOT built (see design.md for why): per-example pinned commands/skills, and MCP resources as a discovery mechanism.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `open-design-tools`: `list_open_design_skills`'s requirement gains the `source`/`remixableOnly` filter behavior.
- `open-design-agent-plugins`: still an open, unarchived change (`openspec/changes/agent-plugin-support/`, not yet in `openspec/specs/`) — this proposal adds an ADDED requirement under that same capability name for the new reference file, rather than a MODIFIED delta against a not-yet-shipped spec.

## Impact

- `packages/core`: `ContentIndex.listSkills()` gains the two filter params; new pure logic for building the reference-file content (shared, so both plugin generators use identical rendering).
- `packages/vscode`, `packages/mcp-server`: tool schema/description updates only, no behavior change beyond the new optional params.
- `packages/content`: new shared generator (alongside `curatedEntries.mjs`) for the reference-file content, plus a drift guard.
- `packages/claude-plugin`, `.agents/skills` (via `packages/codex`), `packages/cli` (via its existing wholesale mirror of both): each gains the new `references/remixable-examples.md` file and an updated `SKILL.md` linking to it.
- No implementation until the plan artifacts are complete — but per the user's prior approval, this change proceeds straight into implementation once they are.
