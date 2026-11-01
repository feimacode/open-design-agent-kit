## Context

`packages/mcp-server` registers about 45 tools over one `McpServer`. Phase 1's `httpServer.ts` creates a `StreamableHTTPServerTransport` per MCP session and roots each session's workspace at `data/sessions/<session id>/`. Every tool reads and writes through the workspace helpers (`workspace.ts`, `store.ts`, `managedWorkspace.ts`), so pointing those helpers at a different root is enough to host them.

All durable kit state is already files in a workspace: entry HTML and assets, `*.artifact.json` sidecars (revisions, review status), comments, `open-design.json` (active design system), `exploration.json`, `history.json` and exports. In-memory state (preview sessions, example caches) can be rebuilt.

## Goals / Non-Goals

**Goals**
- Pass Claude connector and ChatGPT plugin review with the same tools the local server has, minus those that need the user's computer.
- One codebase for the tools. Hosted-only code lives in one package.
- No database and a single instance on Iven's existing Azure VM.

**Non-Goals**
- Replacing the local server anywhere.
- Accounts (`add-gateway-sign-in`), a separate render service, horizontal scaling.

## Decisions

**1. A separate package, not a flag.** Hosted concerns (handles, limits, links, challenge, auth, viewer) would otherwise ship to every stdio user through npm and grow `packages/mcp-server`. The gateway imports `createToolRegistry({ root, profile: 'remote' })` (or the nearest existing factory) from mcp-server. The dependency only goes one way.

**2. Project handles in tool arguments.** The 2026-07-28 revision drops protocol sessions, and hosts may open a new connection per call anyway. Explicit handles work on both revisions, survive gateway restarts and need no sticky routing. The model carries the handle from `start_open_design_project`'s result. The welcome text tells it to reuse the handle for the rest of the conversation. A handle is a bearer capability: anyone with it can read the project. That's acceptable for 7-day anonymous projects, and the handle never appears in share links (the viewer uses its own ids).

**3. The `project` argument is added by the gateway, not the tool code.** The gateway wraps each file-touching tool's input schema with a required `project` string, resolves it to a root, and calls the shared handler with that root. Read-only catalog tools (skills, design systems, examples, print houses) stay handle-free, so a user can browse before starting a project.

**4. Files, not a database.** `data/anon/<handle>/` plus `usage.json` covers storage, limits and expiry on one VM. A nightly sweep deletes folders idle for 7 days. Postgres (Iven's existing server, own schema) comes in only for shared quotas, billing or teams.

**5. Guidance generated from skills.** A build step condenses the overview skill and the most-used flows into the server `instructions` (kept short, because hosts truncate them) and into MCP prompts. Full instructions keep coming from `prepare_open_design_brief`, as today.

**6. Async exports, keep-alive for the rest.** Cloudflare drops proxied requests idle for about 100 s. Single-page PNG and PDF exports and checks stay synchronous, with a 20 s budget. Anything longer is a job, run in-process on a small queue (concurrency 2, so Chromium can't starve other services on the VM). The status tool is read-only.

## Risks / Trade-offs

- **The model loses the handle.** Mitigations: the handle is in every tool result's text, and `start_open_design_project` accepts an optional title, so a lost handle costs a new project, not a crash. To be measured in the 4.x checks.
- **Hosts that still use sessions.** Both protocol revisions are served. Tests cover both.
- **Spec revision details.** The 2026-07-28 summary came from a third-party post. Read the normative spec before task 2.1.
- **Single VM.** It's a single point of failure, which is acceptable for a directory listing at this stage. Backups are in `deploy-hosted-gateway`.
