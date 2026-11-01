## Context

`feima-infra` deploys feima-api and feima-idp with Ansible into Docker Compose behind Traefik. The `global` region is an Azure VM serving `api.feimacode.com` and `auth.feimacode.com`. DNS for feimacode.com is on Cloudflare.

## Decisions

**1. Same VM, own container, hard limits.** A share of an existing VM costs nothing extra, which suits a listing whose traffic is unknown. Chromium is the only heavy part. CPU and memory limits plus the gateway's export queue (concurrency 2) protect the other services. Move to its own VM when the export queue is often full.

**2. GHCR image, pulled by Ansible.** The kit already releases from GitHub Actions. GHCR needs no extra account, and the role pins a version tag, so a deploy is "bump tag, run playbook".

**3. Cloudflare in front, never challenging machines.** Bot challenges break ChatGPT and Claude, which can't run JavaScript. WAF managed rules stay on. Challenges are skipped for the MCP, well-known and viewer paths. A Tunnel is preferred because the VM then exposes no new port. Origin certificates are the fallback if the existing Traefik setup makes a Tunnel awkward.

**4. Two listings, one server, no plugin switch.** The Claude listing is a connector (a server URL). The ChatGPT listing is a plugin whose `mcp.json` points at the URL. Every other install path keeps the local stdio server.

**5. Region and privacy.** Data sits in Singapore (Azure, plus R2 for backups). The privacy policy says so, and lists the retention periods (7 days anonymous, account period from `add-gateway-sign-in`) and how to ask for deletion.

## Risks / Trade-offs

- **Shared VM blast radius.** A runaway export could slow feima-api. Mitigated by the limits, and watched in the first weeks.
- **Review outcomes.** A Claude reviewer may require OAuth. In that case `add-gateway-sign-in` must ship before resubmitting.
- **Name permanence.** Changing the host later breaks every saved connector and the OAuth audience, so the hostname is decided once (task 0.1).

## Changes while applying (2026-11-01)

- **Image publishing.** Releases are created by `release.yml` with the workflow token, which can't trigger other workflows, so the image isn't pushed automatically on release. The Gateway image workflow is dispatched by hand with `push: true` after a release (`deploy/README.md`, runbook).
- **ChatGPT listing variant.** `build-chatgpt-plugin.ts --hosted <url>` writes `mcp.json` with `{ "type": "streamable-http", "url": … }`, the transport name in OpenAI's examples, and no `server/`. (A first upload with `"type": "http"` showed "This plugin does not reference any MCP server" in the portal.)
- **Cross-repo work.** The Ansible role, Traefik routes and backup cron (tasks 2.1–2.4) are in a feimacode/feima-infra PR; Cloudflare settings (2.3) and the external health check (2.5) are manual steps listed in `deploy/README.md`.
