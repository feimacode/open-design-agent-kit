## Why

The local stdio server can't be listed in either directory. OpenAI lists a "command MCP server" only for partners its staff approve, and we have no route to one. The Claude plugin review has been waiting on a reviewer for weeks. Both directories list a **remote HTTPS server** through their normal review. Iven decided on 2026-11-01 that a hosted server exists **only for these two listings**: the Claude connector directory and the ChatGPT plugin directory. The local stdio server stays the default on every other surface. Research: `/mnt/project-files/remote-mcp/remote-mcp-architecture.md`.

Phase 1 (`add-remote-mcp-server`) put an HTTP mode inside `packages/mcp-server`. It keys each workspace on the MCP session id and is guarded by one shared bearer token. Neither works for a listing:
- The MCP protocol revision of 2026-07-28 removes protocol sessions (`Mcp-Session-Id`) and the `initialize` handshake, so state must travel in tool arguments.
- ChatGPT rejects static bearer tokens. It accepts only no auth or OAuth.

## What Changes

- **New package `packages/mcp-gateway`** in this monorepo. It holds all hosted-only code: the HTTP transport, project handles, the data layout, limits, signed download links, the OpenAI domain challenge and (in later changes) sign-in and the viewer routes. It depends on `@feimacode/open-design-agent-kit-mcp` for the tool registry, annotations and the remote tool filter. The stdio package never depends on the gateway. `httpServer.ts` and the HTTP half of `remote.ts` move here, and `--http` in `packages/mcp-server` is removed once the gateway ships.
- **Stateless protocol.** The gateway supports the 2026-07-28 revision (`server/discover`, per-request protocol version and capabilities) and keeps serving the previous revision while the hosts move over. It keeps no per-connection state that a request depends on.
- **Project handles instead of sessions.** A new tool `start_open_design_project` returns an unguessable handle (`odp_` + 128 random bits). Every tool that touches files takes a `project` argument. The handle maps to a folder, `data/anon/<handle>/`, which uses the same workspace layout as a local `.open-design/` folder, so every tool keeps its file-system code. A tool called without a valid handle returns a plain error telling the agent to call `start_open_design_project`.
- **Anonymous use first.** There is no sign-in in this change. A project is deleted 7 days after its last use. The welcome text and the replies tell users to export what they want to keep.
- **Guidance for hosts with no plugin skills.** ChatGPT-listed and Claude-connector users load no skills. The gateway sends server `instructions` and MCP prompts generated at build time from the same skill sources: an overview, the poster, social and deck flows, and design-system choice.
- **Directory requirements on every tool.** Every listed tool has a human-readable `title` (required by the Claude directory) plus the existing `readOnlyHint` and `destructiveHint` annotations. A test fails if any tool is missing them.
- **Long work runs asynchronously.** Exports that may take longer than 20 s (decks, PPTX, batches) return a job id at once, and `get_open_design_export_status` returns the link when the export is ready. This keeps every request well under Cloudflare's idle limit for proxied requests.
- **OpenAI domain challenge.** `GET /.well-known/openai-apps-challenge` returns the value of `OPEN_DESIGN_OPENAI_CHALLENGE`.
- **Per-project limits.** The phase 1 limits on files, bytes, exports and requests per minute are kept, now per project and per client IP. Usage is counted in memory plus a `usage.json` in the project folder. There is no database.

Not in this change: the hosted viewer (`add-hosted-design-viewer`), sign-in (`add-gateway-sign-in`), deployment and the directory submissions (`deploy-hosted-gateway`), a separate render service, and switching any existing plugin to the hosted URL (not planned).

## Capabilities

### New Capabilities
- `mcp-gateway`: the hosted gateway package, the stateless protocol, project handles, guidance delivery, tool titles, async exports, the domain challenge and limits.

### Modified Capabilities
None in `openspec/specs`. This change supersedes the session-folder, bearer-token and `--http` parts of the unarchived `add-remote-mcp-server` change. That change's tool filter (`REMOTE_HIDDEN_TOOLS`), signed links and Dockerfile are reused.

## Impact

- New `packages/mcp-gateway`. `packages/mcp-server` exports its tool registry, filter and annotations for the gateway, and loses `httpServer.ts`.
- New tools: `start_open_design_project` and `get_open_design_export_status` (gateway only). File-touching tools get a `project` argument, but only when they run in the gateway.
- `deploy/Dockerfile` builds the gateway instead of `mcp-server --http`.
- Stdio behaviour is unchanged.
