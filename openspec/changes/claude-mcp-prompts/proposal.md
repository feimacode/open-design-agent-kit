## Why

VS Code's Gallery Grid and the original OpenDesign app both let a user click an example and get its starting prompt inserted directly into the chat composer — editable, not auto-sent — before deciding whether to use it as-is or tweak it. CLI agents have no such picker today: on Claude Code, using an example means either freeform natural language (the model has to guess the right skill) or an explicit skill invocation (the model acts on fixed instructions, with no user-editable text step in between). Claude Code's MCP client has real, dedicated support for exactly this UX shape (the MCP "Prompts" primitive — a server-exposed, user-selectable template that becomes the user's own next message), which our MCP server does not yet implement.

Codex is explicitly out of scope for this change: its own MCP client has no support for the `prompts` capability (confirmed by reading its Rust source — only tools/resources are implemented), and it has no file-based custom-prompt equivalent either (confirmed against the public Codex docs). A future change would need a different mechanism entirely if Codex ever adds one.

## What Changes

- Add MCP "Prompts" support to `packages/mcp-server`: `capabilities.prompts`, plus `prompts/list` and `prompts/get` handlers.
- Expose one prompt per vendored "remixable example" (`source: 'example'` entries with a rendered starting artifact — the same ~167-entry set VS Code's Gallery Grid shows), each named with the hyphenated `od-<mode>-<name>` form already used for skill/prompt-file names elsewhere in this repo.
- Each prompt's content mirrors the VS Code extension's `chatWithExample.ts` message shape exactly (`Use the OpenDesign skill "<publicId>" (<displayName>). <examplePrompt>`), as a single user-role text message — no MCP prompt `arguments`, matching VS Code's own no-form, edit-the-text-directly behavior.
- No changes to any existing tool, skill, or npm package version-pinning behavior.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `open-design-agent-plugins`: extends the MCP server's capabilities with a new "Remixable Example Prompts" requirement (MCP `prompts/list`/`prompts/get`), additive to the existing MCP Server Tool Parity requirement. Note: this capability itself is still a pending, unarchived delta from `agent-plugin-support` (not yet merged into `openspec/specs/`) — this change layers an additional delta on top of it under the same capability name.

## Impact

- `packages/mcp-server/src/index.ts`: new `capabilities.prompts` declaration and two new request handlers.
- `packages/mcp-server/src/tools.ts` (or a new sibling module): a small function reusing `ContentIndex.listSkills(..., source: 'example', remixableOnly: true)` to build the prompt catalog, rather than duplicating content-loading logic.
- `packages/mcp-server/src/test/unit/`: new coverage for `prompts/list` and `prompts/get`.
- No change to `packages/content`, `packages/cli`, `packages/claude-plugin`, `packages/codex`, or any published package version.
- One real open risk, not resolved by this change: whether Claude Code's interactive TUI actually lands the returned prompt text in an editable composer (matching VS Code) or submits it immediately is unverified from this sandbox (headless mode never exercised the real picker) — needs a live check once implemented.
