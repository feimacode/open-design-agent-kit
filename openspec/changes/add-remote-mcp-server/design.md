## Context

The server is built around a workspace folder on the user's disk: `managedWorkspace.ts`, `workspace.ts`, `store.ts`. Folderless mode already exists for hosts with no file tools: `write_open_design_file` writes the agent's files, and `use_open_design_managed_workspace` picks the folder. MCP App views get the design inline, so they need no localhost. Checks and exports launch a local Chromium.

ChatGPT custom MCP apps need a public HTTPS URL. Write tools need confirmation unless they're marked `readOnlyHint`, and our annotations already cover every tool. Claude custom connectors take a URL as well.

## Goals / Non-Goals

**Goals**
- One codebase: the same tools, skills and content serve stdio and remote.
- A test instance good enough to judge the experience in ChatGPT web and Claude web.
- Nothing kept longer than needed, and no accounts in phase 1.

**Non-Goals**
- Multi-user libraries, sharing or teams.
- Directory listings.
- Paying for Chromium at scale.

## Decisions

**1. Streamable HTTP, sessions in memory.** One process holds the MCP sessions. A session's files live in the store, so a restart loses only the connection, not the files. Horizontal scaling is a phase 2 problem.

**2. Hide, don't stub, local-only tools.** A hidden tool can't be called by mistake, and the model doesn't learn about features it can't use. A single `REMOTE_HIDDEN_TOOLS` set is tested against `TOOL_DEFS`, so a new tool has to be classified.

**3. Phase 1: a folder per session, on a mounted volume.** (Changed while applying.) Each session's files live in `<data dir>/sessions/<id>/`, and the session is a managed root, so every tool keeps its file-system code and Chromium reads the files where they are. Durability comes from the host: mount the data directory on a volume (Cloud Storage FUSE on Cloud Run, a volume on Fly.io). A `WorkspaceStore` interface with an object-storage store, read, write, list, stat, delete and "materialise to a temp folder" for Chromium, is deferred to phase 2, when several instances must share sessions. This avoids the riskiest refactor before anyone has used the hosted server.

**4. Session lifetime: 7 days, no accounts.** Files are kept under an opaque id for 7 days after the last request, then deleted. Download links expire after 24 hours. Without accounts, a new ChatGPT or Claude conversation may get a new session, so the guide says to export what you want to keep.

**5. Decisions for Iven before deploying:**
- **Host.** Candidates are Google Cloud Run (container, Chromium works, scales to zero, pay per use), Fly.io (container, cheap always-on), or Cloudflare Containers plus R2 (cheap storage; Chromium support to be confirmed). My suggestion is Cloud Run with GCS for phase 1.
- **Domain** for the URL (for example `mcp.<project domain>`).
- **Budget cap** for the test instance.

## Risks / Trade-offs

- **Cost and abuse.** Chromium per export is CPU-heavy. Phase 1 has hard per-session limits and a token-gated URL.
- **Privacy.** User content sits on our storage. Phase 1 is private testing only. A privacy policy is required before any listing.
- **Refactor risk.** Avoided in phase 1 by keeping sessions as folders (decision 3). The cost: one instance only, and the host must provide a durable volume.
- **Server-side fetching.** Remote mode hides `extract_open_design_design_system` and refuses `sourceUrl` and `embedAssets`, so the server never fetches a URL a user names. Headless Chromium still loads whatever URLs a design's HTML references during checks and exports; run the server where it can't reach private networks or cloud metadata. Blocking those requests in Chromium is phase 2.
- **Host differences.** ChatGPT may render MCP Apps differently from Claude (see `chatgpt-mcp-apps-compat`). The text fallback has to be good on its own.
