# Hosted server

The hosted gateway (`packages/mcp-gateway`) serves Open Design's tools over HTTPS, so remote MCP clients can use them without installing anything. It exists for two directory listings: the Claude connector directory and the ChatGPT plugin directory. Everywhere else (Claude Code, Claude Desktop, Codex, VS Code, the ChatGPT desktop zip, `npx`) the local server stays the way to run Open Design, and nothing about it changes.

It ships as the `open-design-gateway` container image. To build and deploy it, see [deploy/README.md](https://github.com/feimacode/open-design-agent-kit/blob/main/deploy/README.md).

## Run it

```sh
docker run -p 8080:8080 \
  -e OPEN_DESIGN_LINK_SECRET="$(openssl rand -hex 24)" \
  -e OPEN_DESIGN_PUBLIC_URL=https://open-design.feimacode.com \
  -v od-data:/data \
  ghcr.io/feimacode/open-design-gateway:<version>
```

Clients connect to `https://<host>/mcp`. Every setting is an environment variable, listed in [Settings and environment variables](settings-and-env.md#open_design_link_secret).

## Routes

| Route | What it does |
|---|---|
| `POST /mcp` | MCP over streamable HTTP. |
| `/healthz` | `{"ok":true,"version":…,"sessions":…,"readOnly":…,"signIn":…,"viewer":…}`. |
| `/files/<ref>/<path>?exp=…&sig=…` | A signed download link for an export, valid for [`OPEN_DESIGN_REMOTE_LINK_HOURS`](settings-and-env.md#open_design_remote_link_hours). The ref is not the project handle. |
| `/.well-known/openai-apps-challenge` | OpenAI's domain verification ([`OPEN_DESIGN_OPENAI_CHALLENGE`](settings-and-env.md#open_design_openai_challenge)). |
| `/.well-known/oauth-protected-resource` | Sign-in metadata, when [sign-in](#sign-in) is on. |
| `/v/<view id>/` | The read-only viewer, served only on the [user-content host](#viewer-links). |

## Projects

There is no folder on the user's computer, so work happens in projects. The agent calls [`start_open_design_project`](tools.md#start_open_design_project) once and passes its handle as `project` on every call that reads or writes a design. Browsing tools work without one. Inside a project the agent works as in a Claude Desktop chat with no folder: [`use_open_design_managed_workspace`](tools.md#use_open_design_managed_workspace) opens a design folder and [`write_open_design_file`](tools.md#write_open_design_file) saves files.

Projects are folders under [`OPEN_DESIGN_REMOTE_DATA_DIR`](settings-and-env.md#open_design_remote_data_dir), with no database:

```
<data>/anon/<handle>/              anonymous projects
<data>/users/<user key>/<handle>/  signed-in users' projects
  project.json  usage.json  files/  jobs/
<data>/refs/<ref>.json             download-link refs
<data>/views/<view id>/            viewer copies
```

MCP sessions hold nothing but the client's capabilities. A gateway restart costs the client a new `initialize`, never a file. The MCP protocol revision of 2026-07-28 drops sessions entirely; the gateway moves to it once the MCP SDK supports it.

Anonymous projects are deleted 7 days after their last use. Signed-in projects are kept for [`OPEN_DESIGN_ACCOUNT_PROJECT_DAYS`](settings-and-env.md#open_design_account_project_days) after their last use. [`delete_open_design_project`](tools.md#delete_open_design_project) deletes one at once.

## What a project can do

Every tool has a `title` and a `readOnlyHint` or `destructiveHint`, as the Claude directory asks. Hosts that load no plugin skills get short server instructions with the main flow.

Hidden, because they need the user's own computer or accounts, or would make the server fetch any website: `set_open_design_workspace`, `set_up_open_design_browser_pane`, `open_open_design_preview`, `port_open_design_artifact_to_app`, `prepare_open_design_component_library`, `read_open_design_source`, `start_open_design_job_run`, `finish_open_design_job_run`, `pull_open_design_figma_frame`, `push_open_design_artifact_to_figma`, `publish_open_design_artifact_to_canva`, `publish_open_design_artifact_to_shop`, `restore_open_design_artifact` and `extract_open_design_design_system`.

Refused arguments: `sourceUrl` on `create_open_design_design_system` and `embedAssets` on `export_open_design_artifact`.

Exports return download links. They run through a queue of [`OPEN_DESIGN_EXPORT_CONCURRENCY`](settings-and-env.md#open_design_export_concurrency) slots. An export that takes longer than [`OPEN_DESIGN_EXPORT_WAIT_SECONDS`](settings-and-env.md#open_design_export_wait_seconds) returns a job id for [`get_open_design_export_status`](tools.md#get_open_design_export_status). PowerPoint, video, GIF, data and multi-preset exports always do.

## Viewer links

With [`OPEN_DESIGN_USERCONTENT_URL`](settings-and-env.md#open_design_usercontent_url) set, `show_open_design_artifact` adds a viewer link and `publish_open_design_artifact` returns one in place of third-party hosting. A link is a read-only copy of the design as it was when the link was made, at `<user-content origin>/v/<view id>/`.

- The user-content origin must be on a different registrable domain from the gateway, because designs are untrusted pages. Requests for that host serve only the viewer, and the viewer never runs on the gateway's host.
- Responses set no cookies, and send `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` and a content security policy.
- A small bar links to [`OPEN_DESIGN_SUPPORT_EMAIL`](settings-and-env.md#open_design_support_email) to report the page.
- Links stop working when their project is deleted.

## Sign-in

Sign-in is optional and goes through feima-idp. Set [`OPEN_DESIGN_AUTH_ISSUER`](settings-and-env.md#open_design_auth_issuer) to turn it on. The gateway then:

- serves protected resource metadata (RFC 9728) naming the issuer, with `<public origin>/mcp` as the resource;
- accepts RS256 access tokens signed by a key in the issuer's JWKS, with that issuer, an unexpired `exp`, and an `aud` equal to the resource. Tokens for other services (for example `aud` = a client id) are refused, and tokens are never passed on;
- answers HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="…"` for an invalid token, or for [`list_open_design_projects`](tools.md#list_open_design_projects) and [`claim_open_design_project`](tools.md#claim_open_design_project) without one, so the host starts sign-in;
- keeps a signed-in user's projects under that user, reachable from any conversation and by no one else.

Anonymous use keeps working with sign-in on. What feima-idp needs is in `openspec/changes/add-gateway-sign-in`.

## Maintenance

[`OPEN_DESIGN_GATEWAY_READONLY`](settings-and-env.md#open_design_gateway_readonly)`=1` makes every tool that writes answer with a maintenance notice, while browsing, downloads and viewer links keep working.

## Known gaps

- One instance: rate counters and export jobs that are still running live in its memory.
- Checks and exports render the project's own files in headless Chromium. A design's HTML can still reference outside URLs, which the browser loads, so run the gateway where it can't reach private networks or cloud metadata.
