## 0. Spikes (resolve the design's open questions first)

- [x] 0.1 Capture the client name each agent sends in the MCP `initialize` handshake (Claude Code, Codex, Cursor if available, VS Code) by logging it from `packages/mcp-server`. Record the mapping in a test fixture.
- [x] 0.2 Verify secret references per agent with a dummy env var against a harmless HTTP MCP endpoint:
  - Claude Code: a single-quoted `${VAR}` in a user-scope `--header`, else `headersHelper`;
  - Codex: `bearer_token_env_var`;
  - VS Code: an `inputs` password entry, including whether `code --add-mcp` accepts it;
  - Cursor: `${env:VAR}` (docs only if not installed).
  
  An agent that can't reference a secret safely gets manual-only steps for `api-key-header` entries.
- [x] 0.3 Inventory tool names for Figma, Notion, Google Drive, Slack and Metricool. Where possible, connect the service and list its tools via `claude -p`, as was done for Canva; otherwise use vendor docs. Unverified names stay `null` with `toolsVerified: false`.

## 1. Registry content and guard

- [x] 1.1 Add `packages/content/local/integrations.json` with the D9 entries: canva, figma, notion, google-drive, slack, buffer, metricool, x. Each entry gets its URL, auth, caveats, claude.ai connector name, docs URL, `verifiedAt` and capability → tool mapping.
- [x] 1.2 Copy `integrations.json` to the assets root in `apply-local-overlay.mjs`, the same way as `surfaces.json`, and remove it when absent.
- [x] 1.3 Add `packages/content/scripts/integrations.mjs` with `checkIntegrations()`:
  - errors: schema, unique ids, https URLs, known tier and auth kind, capability vocabulary, `envVar` for `api-key-header`, credential-looking literals;
  - warnings: `verifiedAt` older than 180 days, `toolsVerified: false`.
  
  Wire it into `check-content-sync.mjs`, with tests in `packages/content/scripts/test/`.

## 2. Core module

- [x] 2.1 `packages/core/src/integrations/types.ts` and the entry types, tiers and auth kinds (as built: `registry.ts`; the capability vocabulary lives in `integrations.json` itself so the content check and core read one source; tiers/auth kinds/platforms are mirrored in `integrations.mjs` with a keep-in-step note, like surfaces).
- [x] 2.2 `load.ts`: read and validate `integrations.json` from the content root (the same root resolution as `ContentIndex`), with clear errors.
- [x] 2.3 `resolve.ts`: `resolveIntegrations({ capability, integration, platform })`, ordered by tier then registry order, flagging the "several aggregators, ask the user" case.
- [x] 2.4 `render.ts`: `renderInstall(entry, agent)` for claude-code, codex, vscode, cursor and generic:
  - connector-first on Claude Code;
  - `claude-ai-only` and `installable: false` handling;
  - user scope;
  - secret references only;
  - sign-in, reload and verify steps;
  - per-agent tool-name patterns derived from the verified naming rules.
- [x] 2.5 `format.ts`: the markdown result for the tool. It covers the catalog mode, and the provider list with caveats, hints, the template and the consent rules (D7 text).
- [x] 2.6 `agentFromClientName()` mapping from 0.1, falling back to `generic`.
- [x] 2.7 Export from `packages/core/src/index.ts`. Unit tests for:
  - resolution order (X before aggregators on `social.post`/`x`);
  - Buffer on Codex using `bearer_token_env_var` with no literal key;
  - Canva on Claude Code connector-first;
  - the X entry being manual-only;
  - no template targeting a project-committed file;
  - the consent text being present.

## 3. Tool on both hosts

- [x] 3.1 VS Code: a `languageModelTools` entry for `list_open_design_integrations` in `packages/vscode/package.json` (modelDescription, inputSchema, `toolReferenceName: od-integrations`), plus `src/tools/listIntegrationsTool.ts` (agent fixed to `vscode`), registered in `registerTools.ts`.
- [x] 3.2 MCP server: a tool definition and handler in `packages/mcp-server/src/tools.ts` and `index.ts`. Capture the client name at `initialize` and pass the inferred agent, with explicit `agent` winning.
- [x] 3.3 Parity test: the same input on both hosts (explicit `agent`) produces identical output.

## 4. Shared instruction block

- [x] 4.1 Add the integration block (D6 text: look up, check including deferred tools, use, offer once, explicit yes, sign-in/reload/verify, fall back) to `packages/vscode/instructions/open-design.instructions.md` and `packages/claude-plugin/skills/open-design/SKILL.md`.
- [x] 4.2 Regenerate the Codex skills and CLI bundled skills (`generate-codex-skills`, CLI asset sync). Run the skills-sync lint scripts.
- [x] 4.3 Add a lint (in `check-skills-sync.mjs` or the content check) that fails if any generated skill's `allowed-tools` names a tool from a registry entry. Add a test asserting every host's overview contains the block.

## 5. Docs and verification

- [x] 5.1 `docs/reference/tools.md`: an entry for `list_open_design_integrations` (the reference completeness check must pass). Add a short "Connect other services" section to `docs/guides/share-and-publish.md`, or a new guide linked from `docs/guides/README.md`, explaining providers, priority, consent and keys-as-env-vars. Run the docs checks.
- [x] 5.2 Build and test all packages (`npm test`, content check, skills lint).
- [x] 5.3 Manual, Claude Code: with Canva connected on claude.ai, ask for the Canva integration. The agent calls the tool, finds `mcp__claude_ai_Canva__*` and doesn't offer setup.
- [x] 5.4 Manual, Claude Code: ask to use Notion when it isn't installed. The agent offers setup once, waits for a yes, and on decline continues without it. Nothing is written to a project file.
- [ ] 5.5 Manual, VS Code Copilot: the same lookup returns the VS Code template, and the `code --add-mcp` path or "MCP: Add Server" fallback works after consent.
