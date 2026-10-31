# Hosted server

The MCP server can also run as a hosted, remote MCP server over streamable HTTP, so ChatGPT web (developer mode connectors), Claude web connectors and other remote MCP clients can use Open Design without installing anything. This is phase 1: one container you run yourself, with a shared access token. There is no public Open Design endpoint yet.

## Start it

```sh
OPEN_DESIGN_REMOTE_TOKEN="$(openssl rand -hex 24)" npx -y @feimacode/open-design-agent-kit-mcp --http --port 8080
```

`--http` serves MCP at `/mcp` and sets [`OPEN_DESIGN_PROFILE`](settings-and-env.md#open_design_profile)`=remote`. `--port` defaults to `$PORT`, then `8080`. To run it in a container, see [deploy/README.md](https://github.com/feimacode/open-design-agent-kit/blob/main/deploy/README.md).

Put it behind HTTPS and give clients one of:

- `https://<host>/mcp` with the header `Authorization: Bearer <token>`
- `https://<host>/mcp/<token>`, for clients that take only a URL

## Routes

| Route | What it does |
|---|---|
| `/mcp`, `/mcp/<token>` | MCP over streamable HTTP. Each `initialize` starts a session with its own folder. |
| `/healthz` | `{"ok":true,"version":…,"sessions":…}`, no token needed. |
| `/files/<session>/<path>?exp=…&sig=…` | A signed download link for an export, valid for [`OPEN_DESIGN_REMOTE_LINK_HOURS`](settings-and-env.md#open_design_remote_link_hours). |

## What a session can do

A session works like a Claude Desktop chat with no folder: the agent opens a design folder with [`use_open_design_managed_workspace`](tools.md#use_open_design_managed_workspace) and saves files with [`write_open_design_file`](tools.md#write_open_design_file). After an export, the result lists a download link for each new file.

Hidden, because they need the user's own computer or accounts, or would make the server fetch any website: `set_open_design_workspace`, `set_up_open_design_browser_pane`, `open_open_design_preview`, `port_open_design_artifact_to_app`, `prepare_open_design_component_library`, `read_open_design_source`, `start_open_design_job_run`, `finish_open_design_job_run`, `pull_open_design_figma_frame`, `push_open_design_artifact_to_figma`, `publish_open_design_artifact_to_canva`, `publish_open_design_artifact_to_shop`, `restore_open_design_artifact` and `extract_open_design_design_system`.

Refused arguments: `sourceUrl` on `create_open_design_design_system`, `embedAssets` on `export_open_design_artifact`, and any `publish_open_design_artifact` provider other than `netlify-temporary` and `cloudflare-temporary`.

## Limits

Each session has a file, size, export and per-minute call limit, and its folder is deleted after [`OPEN_DESIGN_REMOTE_SESSION_DAYS`](settings-and-env.md#open_design_remote_session_days) without a request. All of them are set with the `OPEN_DESIGN_REMOTE_*` variables in [Settings and environment variables](settings-and-env.md#open_design_remote_token).

## Known gaps

- One shared token for every user; per-user sign-in (OAuth) is phase 2.
- Sessions live in the memory of the instance that started them, so run one instance.
- Checks and exports render the session's own files in headless Chromium. A design's HTML can still reference outside URLs, which the browser loads; run the server where it cannot reach private networks.
