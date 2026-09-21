## 1. Catalog helper

- [x] 1.1 In `packages/mcp-server/src/tools.ts`, add a small function (next to `listSkills`) that calls `ctx.contentIndex.listSkills(undefined, undefined, 'example', true)` and maps each entry to `{ name: <hyphenated publicId>, description: displayName, entry }` (or equivalent), reusing the existing content-loading path rather than duplicating it.

## 2. MCP server wiring

- [x] 2.1 In `packages/mcp-server/src/index.ts`, add `capabilities: { prompts: {} }` to the `Server` constructor, alongside the existing `tools: {}` capability.
- [x] 2.2 Add a `ListPromptsRequestSchema` handler returning the mapped catalog from Task 1.1 (`name` + `description` per prompt, no `arguments`).
- [x] 2.3 Add a `GetPromptRequestSchema` handler that looks up the requested `name` against the same catalog and returns a single user-role text message: `Use the OpenDesign skill "<publicId>" (<displayName>). <examplePrompt>` (mirroring `packages/vscode/src/extension/commands/chatWithExample.ts`'s message construction exactly). Return a clear MCP error for an unknown `name`.

## 3. Tests

- [x] 3.1 In `packages/mcp-server/src/test/unit/tools.test.ts`, added coverage: `listRemixablePrompts` returns exactly the remixable-example set with hyphenated names; `buildRemixPromptMessage` matches `chatWithExample.ts`'s exact message shape (with and without an `examplePrompt`). All 14 tests in the file pass.

## 4. Verification

- [x] 4.1 Ran the repo-wide `npm run typecheck`/`npm run lint`/`npm run test:unit` — all clean, no regressions.
- [x] 4.2 Wired the real compiled server (`packages/mcp-server/out/index.js`) into real sessions and verified for real:
  - Raw JSON-RPC handshake against the built server directly: `initialize` advertises `capabilities.prompts`; `prompts/list` returns the real 167-entry catalog with correctly hyphenated names (e.g. `od-audio-audio-jingle-example`); `prompts/get` on a real name returns the exact expected message text (verified byte-for-byte against a real catalog entry, including its multi-line `examplePrompt`); `prompts/get` on an unknown name returns a proper MCP error, not a malformed/empty result.
  - Wired the same build into a real headless Claude Code session (`--mcp-config`, `.mcp.json` pointing at the built server) and asked it to introspect its own available MCP prompts: it reported **0 prompts** despite the server correctly advertising and serving them over the raw protocol (confirmed a moment earlier via the direct JSON-RPC test above).
  - **Conclusion, not just an assumption**: MCP Prompts are a human-facing picker feature (`/mcp__<server>__<name>`), not something surfaced into the model's own context — this was already hinted at by Claude Code's own internal distinction ("X is an MCP prompt, not a skill") found earlier in the binary, and is now confirmed by this test: the model genuinely cannot see prompts that a correctly-implemented server serves, because that catalog only reaches the interactive composer layer, not the model. This means the "does it land editable in the composer" question **cannot be verified from any headless/scripted environment** — it requires a human opening a real interactive `claude` session, adding this server, and typing `/mcp__open-design__` to see the picker and try selecting an entry. This is a hard environment limitation, not a gap in this implementation, and is the one thing left for you to check by hand.
