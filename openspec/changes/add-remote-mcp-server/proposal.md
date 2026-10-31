## Why

ChatGPT web only takes remote HTTPS MCP servers (streamable HTTP or SSE). So do Claude web and mobile chats, which never load a local MCP server (see the 2026-10-21 install-surfaces research). Today the kit runs only as a local stdio server that writes to the user's disk. A hosted server is the one investment that reaches ChatGPT web, Claude web, Claude mobile, and the public directories of both, since public ChatGPT plugins with a remote URL don't need partner approval. It's also much bigger than anything the kit has done so far: hosting, storage, accounts, cost and privacy. Research: `/mnt/project-files/chatgpt-research/chatgpt-support.md`.

This change is **phase 1**. It makes the server able to run remotely and deploys a private test instance that Iven can add as a custom connector in ChatGPT developer mode and in Claude. Phase 2 (accounts, quotas, directory submissions) is a later change, once phase 1 shows the experience is worth it.

## What Changes

- **HTTP transport.** The server gets `--http [--port <n>]`, which serves MCP over streamable HTTP at `/mcp` using the SDK's `StreamableHTTPServerTransport`, with one MCP session per connection. Stdio stays the default.
- **A remote profile.** `OPEN_DESIGN_PROFILE=remote` changes what the server offers:
  - **Folderless always.** Every session gets its own managed workspace, and the agent writes files through `write_open_design_file`, the same path the Claude Desktop Chat no-folder mode already uses.
  - **Local-only tools are hidden.** Hidden tools: `open_open_design_preview`, `set_open_design_workspace`, `use_open_design_managed_workspace`, `set_up_open_design_browser_pane`, `port_open_design_artifact_to_app`, `read_open_design_source` for local paths, the recurring job tools, and Figma and Canva tools that need a local token. The list is in one place, with a unit test.
  - **Preview through MCP Apps only.** The view gets the design from `get_open_design_preview_state`. Where views don't render, the reply points at a temporary share link made by `publish_open_design_artifact`.
  - **Exports as links.** `export_open_design_artifact` stores PNG, PDF and PPTX files and returns HTTPS download links that expire.
- **One folder per session.** Each session's files live in a folder named by an opaque session id under the server's data directory, deleted after a fixed time. Durable storage comes from mounting that directory on a volume (for example Cloud Storage FUSE on Cloud Run). A `WorkspaceStore` interface for object storage waits for phase 2.
- **A deployable image.** A `Dockerfile` with Node, the bundled server and content, and Chromium for checks and exports. A `deploy/README.md` covers one host. Iven picks the host (see design.md). Health check at `/healthz`.
- **Abuse limits from day one.** Per-session limits on file count, total bytes, export count and request rate. Clear errors when they're hit.
- **Private test instance.** It's protected by a shared bearer token (ChatGPT's and Claude's custom connectors accept a URL; the token goes in the URL path or a header, whichever both hosts support). It's not listed anywhere.

Not in this change (phase 2): OAuth accounts, persistent per-user libraries, paid limits, a privacy policy and terms, and submissions to the ChatGPT plugin directory and the Claude connector directory.

## Capabilities

### New Capabilities
- `remote-mcp-server`: HTTP transport, the remote profile's tool set and behaviour, session storage, limits, and the deployable image.

### Modified Capabilities
None. Stdio behaviour is unchanged.

## Impact

- `packages/mcp-server`: HTTP entry point, profile switch, tool filtering, export links, limits.
- `packages/core`: unchanged in phase 1 (no `WorkspaceStore` yet).
- New `deploy/` (Dockerfile, README), and a manual GitHub Actions workflow that builds the image.
- Costs: hosting, storage and Chromium CPU are paid by the project once deployed. Phase 1 is a single small instance.
