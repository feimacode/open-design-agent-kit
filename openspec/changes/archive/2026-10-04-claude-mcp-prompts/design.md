## Context

`packages/mcp-server` implements the MCP `Server` low-level API (not the high-level `McpServer`, which caused a real `tsc` OOM earlier — its zod-compat generic overloads blew up type-checking memory; the low-level API with hand-written JSON Schemas is the only pattern in use in this file today). It currently registers `ListToolsRequestSchema`/`CallToolRequestSchema` only. `ContentIndex.listSkills(query?, mode?, source?, remixableOnly?)` (in `packages/core`) already supports the exact filter needed here — `source: 'example'` with `remixableOnly: true` returns only entries with a non-empty `exampleArtifactPath` (~167 of the 444-entry catalog) — because this filter was added earlier this session for the `list_open_design_skills` tool's `remixableOnly` parameter and the generated `references/remixable-examples.md` file. Nothing new needs to be added to `packages/core`.

Claude Code's compiled CLI (inspected directly via `strings` on the installed binary) has real, dedicated support for the MCP "Prompts" primitive: `prompts/list`, `prompts/get`, a `GetPromptRequestSchema`, and internal text that explicitly treats an "MCP prompt" as a distinct concept from a "skill" (`"X" is an MCP prompt, not a skill`), invoked as `/mcp__<server-name>__<prompt-name>`. A minimal hand-built test server confirmed the SDK's `ListPromptsRequestSchema`/`GetPromptRequestSchema` work correctly end-to-end via a raw JSON-RPC handshake. What could **not** be confirmed from this sandbox is the live interactive behavior — whether selecting a prompt in the real TUI lands its text in an editable composer (matching VS Code's `isPartialQuery: true` behavior) or submits it immediately. Headless `-p` mode never connected to the test server at all, most plausibly because that mode has no composer to populate in the first place, not because of a server-side defect (a second, real test server implementing the same SDK primitives round-tripped correctly over raw stdio outside of `claude`'s own client).

VS Code's existing equivalent, `chatWithExample.ts`, is the UX and message-shape reference point: `Use the OpenDesign skill "<skillId>" (<displayName>). <examplePrompt>`, opened via `workbench.action.chat.open` with `isPartialQuery: true` (prefilled, still editable, nothing written or generated until the user sends it).

Codex is out of scope: its `rmcp-client` crate (the code that talks to *external* MCP servers, as opposed to `codex-mcp`, which is Codex acting as a server) has zero references to `Prompt` anywhere in its source, and the public Codex docs describe no file-based custom-prompt-library feature either — confirmed directly against `developers.openai.com/codex/cli/slash-commands`.

## Goals / Non-Goals

**Goals:**
- Give Claude Code users a native, protocol-correct way to pick a remixable example and get its brief as an editable starting message, mirroring VS Code's Gallery Grid.
- Reuse the existing content-filtering logic (`source: 'example'`, `remixableOnly: true`) rather than re-deriving the remixable set.
- Keep the low-level `Server` API pattern already established in `packages/mcp-server/src/index.ts` — no dependency or API-shape changes.

**Non-Goals:**
- Codex support (see proposal — no client-side mechanism exists there today).
- MCP prompt `arguments`/a form step. VS Code's reference UX has none — the user edits the inserted text directly. Adding an argument schema here would be a UX regression relative to the thing being mirrored, not an improvement.
- Exposing curated skills or design-templates as prompts. Scope is deliberately limited to the same ~167-entry remixable-example set VS Code's Gallery Grid shows, since that's the literal UX being replicated (browsing skills/templates already has its own flow via `list_open_design_skills` + `prepare_open_design_brief`, unchanged by this work).
- Changing anything about the existing 23 curated Claude Code skills, VS Code prompt files, or their `od-<mode>-<name>` naming — this change only adds prompts alongside them.

## Decisions

**Decision 1 — Reuse `ContentIndex.listSkills` with `source: 'example', remixableOnly: true`, not a new query path.**
This is the exact filter already backing `list_open_design_skills`'s `remixableOnly` parameter and `references/remixable-examples.md`. A prompts-specific catalog function would duplicate that logic for no benefit. Alternative considered: exposing the full 444-entry catalog as prompts — rejected, since it doesn't match the thing being replicated (VS Code's picker is examples-only) and would flood the `/mcp__open-design__` autocomplete with entries that have no rendered starting artifact to hand the user anyway.

**Decision 2 — Prompt `name` is the hyphenated `od-<mode>-<name>` form (`entry.publicId.replace(/:/g, '-')`), matching the naming already applied to Claude Code skills and VS Code prompt files this session.**
Alternative considered: the bare directory id (`frame-liquid-bg-hero`), which is unique within the examples-only pool and would also work. Chosen the mode-prefixed hyphenated form instead purely for cross-surface naming consistency (per explicit prior direction: "we should use `-` as splitter for all the cases") — even though Claude Code's `/mcp__server__name` syntax doesn't have VS Code's colon-to-space rendering problem that originally motivated the hyphen choice.

**Decision 3 — `prompts/get` returns exactly one user-role text message, no `arguments`, mirroring `chatWithExample.ts`'s message string verbatim.**
`Use the OpenDesign skill "${entry.publicId}" (${entry.displayName}). ${entry.examplePrompt ?? ''}`. Keeping `publicId` (colon form) inside the message body is intentional and unrelated to Decision 2 — that's the value the `open-design` skill's own instructions already tell the model to pass as `skillId` to `remix_open_design_example`/`prepare_open_design_brief`; only the MCP prompt's own `name` (the invocation identifier) uses the hyphenated form.

**Decision 4 — Add the two new request handlers directly in `packages/mcp-server/src/index.ts`, with the catalog-building logic in `packages/mcp-server/src/tools.ts` (next to `listSkills`), not a new file.**
`tools.ts` already owns the `ContentIndex` access pattern and `ToolContext` shape; a new `prompts.ts` module would just re-import the same context type for one small function. Revisit only if this grows non-trivial complexity later.

## Risks / Trade-offs

- **[Risk] Unverified interactive behavior** — Claude Code's real TUI might submit the prompt's message immediately rather than landing it in an editable composer, which would not match the VS Code UX this change is meant to replicate. → **Mitigation**: none possible from this sandbox; call this out explicitly as a task to verify live immediately after implementation, before considering the feature done. If it turns out to auto-submit, the value of this change is much lower and worth revisiting rather than shipping as-is.
- **[Risk] ~167 prompts in one flat list** — no pagination is implemented (MCP's `prompts/list` supports a `cursor`, unused here since the catalog is small and static); relies entirely on the client's own fuzzy-filtering of `/mcp__open-design__` completions, the same way skills already do for the plugin's 23 entries. → **Mitigation**: none needed unless the real picker turns out to handle 167 entries poorly, which is also something to check during the live verification pass above.
- **[Trade-off] Examples-only scope** — a user who wants to riff on a curated skill/template (not a rendered example) gets no prompt-picker equivalent from this change; they still use the existing tool-based flow. Accepted as correct scope per the proposal (this mirrors VS Code's Gallery Grid specifically, not the whole catalog).

## Open Questions

- Does the real Claude Code TUI land the prompt text in an editable composer, or send it immediately? (See Risk above — must be checked live once built, not assumed.)
