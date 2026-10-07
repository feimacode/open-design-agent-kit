## Context

Curation lives in `packages/content/scripts/curatedEntries.mjs` (frontmatter `featured`/`recommended`/`od.default_for`, plus `local/curated.json`) and drives 27 per-template commands on every host. The Gallery webview (`packages/vscode/src/webview/gallery/main.ts`) groups examples by upstream `category`. The overlay (`local/`, applied by `apply-local-overlay.mjs`) is the established place for extension-owned content. Stub skills are recognisable by the sentence "This catalogue entry advertises" in the body.

## Goals / Non-Goals

**Goals:** a stable, extension-owned "what can I make" layer; never route to stubs; same surfaces on every host; zero new runtime tools.

**Non-Goals:** rewriting upstream taxonomy; a full-screen "new project" wizard; changing the 27 per-template commands.

## Decisions

### D1. A JSON file in the overlay, not frontmatter edits
Surfaces cut across upstream entries we don't own. A single `local/surfaces.json` is reviewable in one diff and survives upstream syncs. *Alternative:* add `surface:` to SKILL.md frontmatter — rejected, upstream files are never hand-edited.

### D2. `surface` argument on the existing list tool
The agent already calls `list_open_design_skills` first; a filter keeps one discovery tool. `surface: "list"` returns the catalog (id, label, description, entry count, prompt). *Alternative:* a new `list_open_design_surfaces` tool — one more tool for the agent to choose between.

### D3. Planned surfaces ship hidden
Diagram, Color + type and 3D object point at content other changes add. Marking them `status: "planned"` lets this change land first; the guard skips planned surfaces' entries, and each later change flips its surface to `ready` and adds entries.

### D4. Stub detection in ContentIndex
`ContentIndex` marks an entry `stub: true` when its body contains the catalogue-entry sentence and it ships no other file. Surface results exclude stubs; free queries still return them, flagged, so nothing disappears.

### D5. Gallery "New design" grid → chat, not a wizard
Matches the existing Gallery click-to-chat pattern: clicking a surface opens Copilot Chat with `/open-design-new <surface-id>`; the prompt asks the surface's clarifying questions and routes. No new webview state.

## Risks / Trade-offs

- [Surface entries drift as upstream content changes] → the build guard fails on missing or stub entries during sync.
- [Two discovery paths (surfaces vs per-template commands)] → the instructions put surfaces first only when the request names a surface; a template-specific request still goes straight to its command.

## Migration Plan

Additive. Rollback: remove `surfaces.json` and the grid; the `surface` argument is optional.

## Open Questions

- Should a surface remember the user's last choice of entry per workspace? Deferred.
