# Hosted Open Design gateway

The container behind the Claude connector directory listing and the ChatGPT plugin directory listing (openspec `add-mcp-gateway`, `deploy-hosted-gateway`). Every other install keeps the local stdio server. The full reference is [docs/reference/remote-server.md](../docs/reference/remote-server.md).

## Build and run

```sh
docker build -f deploy/Dockerfile -t open-design-gateway .
docker run -p 8080:8080 \
  -e OPEN_DESIGN_LINK_SECRET="$(openssl rand -hex 24)" \
  -e OPEN_DESIGN_PUBLIC_URL=https://open-design.feimacode.com \
  -v od-data:/data \
  open-design-gateway
deploy/smoke-test.sh http://127.0.0.1:8080
```

The image has Node 22, the gateway bundled with the kit's tools and content (`deploy/stage-server.ts`), and Debian's Chromium behind a `--no-sandbox` wrapper. It runs as an unprivileged user.

The **Gateway image** workflow (`.github/workflows/remote-image.yml`, run by hand) builds and smoke-tests the image. With `push` ticked, it pushes `ghcr.io/feimacode/open-design-gateway:<version>`, plus `latest` for a stable version. Run it after each release that should reach the hosted gateway.

## Where it runs

It runs on the Feima `global` VM (Azure, Singapore), deployed by the `open-design-gateway` Ansible role in `feimacode/feima-infra`, next to feima-api and feima-idp, behind Traefik:

| Host | Serves |
|---|---|
| `open-design.feimacode.com` | the gateway: `/mcp`, `/healthz`, `/files/…`, `/.well-known/…` |
| the user-content domain (a different registrable domain) | the viewer, `/v/<view id>/` |

Data lives in `/opt/feima/prod/open-design/data`, mounted at `/data`. The container runs with CPU and memory limits, so exports can't starve the other services. Exports also go through a queue of two.

### Settings in production

| Variable | Value |
|---|---|
| `OPEN_DESIGN_LINK_SECRET` | from Ansible Vault |
| `OPEN_DESIGN_PUBLIC_URL` | `https://open-design.feimacode.com` |
| `OPEN_DESIGN_USERCONTENT_URL` | `https://<user-content domain>` |
| `OPEN_DESIGN_OPENAI_CHALLENGE` | from the OpenAI platform's domain verification, in Vault |
| `OPEN_DESIGN_AUTH_ISSUER` | `https://auth.feimacode.com`, once feima-idp has the changes in `openspec/changes/add-gateway-sign-in` |
| `OPEN_DESIGN_TRUST_PROXY` | `1` (behind Cloudflare and Traefik) |

## Cloudflare

DNS for feimacode.com is on Cloudflare. Set it up like this:

- **Records.** Proxied records (orange cloud) for the gateway host and the user-content host. Prefer a Cloudflare Tunnel (`cloudflared` on the VM, pointing at Traefik) so the VM opens no new inbound port. Otherwise use SSL mode **Full (strict)** with a Cloudflare origin certificate on Traefik.
- **No challenges for machines.** ChatGPT and Claude can't solve JavaScript or bot challenges. Add a WAF custom rule that skips Bot Fight Mode, Super Bot Fight Mode and managed challenges for `/mcp`, `/.well-known/*` and `/files/*` on the gateway host, and for the whole user-content host. Keep the WAF managed rules on.
- **Rate limit.** A rate-limiting rule on `/mcp`, for example 300 requests a minute per IP, as an outer guard. The gateway has its own per-project and per-network limits.
- **Timeouts.** Cloudflare cuts proxied requests that stay idle for about 100 seconds. The gateway answers within [`OPEN_DESIGN_EXPORT_WAIT_SECONDS`](../docs/reference/settings-and-env.md#open_design_export_wait_seconds) (20 s) and hands back a job id for longer exports.

## Backups

A nightly job copies `/opt/feima/prod/open-design/data` to Cloudflare R2 (or Azure Blob) and keeps 7 copies. Anonymous projects live 7 days, so older copies would hold nothing useful.

```sh
# the cron entry the Ansible role installs (rclone remote "od-backup" configured from Vault)
rclone sync /opt/feima/prod/open-design/data od-backup:open-design-gateway/$(date +%a) --exclude 'views/**'
```

Viewer copies are left out because they can be made again. Test a restore once before the first submission (below).

## Runbook

- **Deploy.** Run the Gateway image workflow with `push`. Then set `open_design_gateway_version` in feima-infra and run `ansible-playbook playbooks/deploy-open-design-gateway.yml -l global_prod`.
- **Roll back.** Set the previous version and run the playbook again. Data is unaffected.
- **Maintenance.** Set `OPEN_DESIGN_GATEWAY_READONLY=1` and redeploy. Every tool that writes then answers with a notice, and browsing, downloads and viewer links keep working.
- **Restore.**
  1. Stop the container.
  2. `rclone sync od-backup:open-design-gateway/<day> /opt/feima/prod/open-design/data`.
  3. Start the container and run `deploy/smoke-test.sh`.
- **Health.** `GET /healthz` is watched from outside (Cloudflare health check or UptimeRobot). It reports the version, open sessions, and whether sign-in, the viewer and read-only mode are on.
- **Logs.** The gateway logs to stderr: start-up and errors, never design content.
