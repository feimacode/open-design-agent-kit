## 1. Package

- [x] 1.1 Create `packages/mcp-gateway` (workspace, tsconfig, build, test script); export the tool registry, `REMOTE_HIDDEN_TOOLS`/`REMOTE_AVAILABLE_TOOLS` and `TOOL_ANNOTATIONS` from `packages/mcp-server`
- [x] 1.2 Move `httpServer.ts` and the HTTP half of `remote.ts` (limits, signed links, sweep) into the gateway; remove `--http` from mcp-server; keep `/healthz`
- [x] 1.3 Point `deploy/Dockerfile`, `deploy/stage-server.ts`, `deploy/smoke-test.sh` and `remote-image.yml` at the gateway

## 2. Protocol and handles

- [x] 2.1 Read the 2026-07-28 MCP spec; support `server/discover` and per-request version/capabilities, and keep the previous revision; tests with an SDK client on each
- [x] 2.2 `start_open_design_project` (optional title) returns an `odp_` handle and creates `data/anon/<handle>/`
- [x] 2.3 Wrap file-touching tools with a required `project` argument; catalog tools stay handle-free; plain error for a missing or unknown handle; tests
- [x] 2.4 Sweep folders idle for 7 days; replace phase 1 session folders

## 3. Host requirements

- [x] 3.1 A `title` for every tool; test that every listed tool has a title and a `readOnlyHint` or `destructiveHint`
- [x] 3.2 Build step that generates server `instructions` and MCP prompts from the skill sources; size limit test
- [x] 3.3 `GET /.well-known/openai-apps-challenge` from `OPEN_DESIGN_OPENAI_CHALLENGE`
- [x] 3.4 Async export jobs (queue concurrency 2, 20 s sync budget) and `get_open_design_export_status`; tests
- [x] 3.5 Limits per project and per client IP (honour `CF-Connecting-IP` only when the request came through the trusted proxy); `usage.json`; tests

## 4. Verification

- [x] 4.1 Local stdio unchanged: full unit suite and the `.mcpb`/plugin smoke tests
- [ ] 4.2 MCP Inspector against the gateway: start a project, make a poster, check it, export a PDF, fetch the link
- [x] 4.3 Docs: `docs/reference/remote-server.md` rewritten for the gateway; CHANGELOG
