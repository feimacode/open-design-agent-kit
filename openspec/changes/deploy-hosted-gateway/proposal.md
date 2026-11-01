## Why

The gateway (`add-mcp-gateway`) exists only to get Open Design into two directories: the Claude connector directory and the ChatGPT plugin directory. Both need a public HTTPS URL, a privacy policy that covers hosted data, reviewer instructions and test cases. Iven decided on 2026-11-01 to reuse existing Feima infrastructure:
- the Azure Ubuntu VM in Singapore (the `global` region in `feimacode/feima-infra`: Ansible, Traefik, Docker Compose)
- `feimacode.com` DNS on Cloudflare
- feima-idp for sign-in

This replaces tasks 0.1 and 3.3 of `add-remote-mcp-server` (Cloud Run was only a suggestion).

## What Changes

- **Image.** `remote-image.yml` builds the gateway image from `deploy/Dockerfile`, smoke-tests it, and pushes it to GHCR (`ghcr.io/feimacode/open-design-gateway:<version>`) on release and on manual dispatch.
- **Host.** `open-design.feimacode.com` (Iven may choose `od-mcp.feimacode.com`; the name is permanent once listed), MCP at `/mcp`, plus the viewer's user-content domain. Both are on Cloudflare, proxied, with TLS Full (strict) or a Cloudflare Tunnel.
- **Cloudflare rules.**
  - No bot challenge, JS challenge or Super Bot Fight Mode on `/mcp`, `/.well-known/*` and the viewer, because machine clients can't solve challenges.
  - A rate-limit rule per IP on `/mcp` as an outer guard.
  - The gateway trusts `CF-Connecting-IP` only from Cloudflare ranges or the tunnel.
- **feima-infra** (cross-repo, a PR there):
  - an `open-design-gateway` Ansible role and a Traefik router for both hosts in the `global_prod` group
  - a volume at `/opt/feima/prod/open-design/data`
  - container limits (`cpus: 1.5`, `memory: 2g`, to be tuned after load checks) so Chromium can't starve feima-api and feima-idp
  - secrets in Ansible Vault: link-signing secret and OpenAI challenge value
- **Backups.** A nightly copy of the data folder to Cloudflare R2 (or Azure Blob), kept 7 days, matching anonymous retention. The restore is tested once.
- **Operations.**
  - Health check monitored from outside (Cloudflare health check or UptimeRobot).
  - Structured logs with no design content.
  - A kill switch (`OPEN_DESIGN_GATEWAY_READONLY=1` answers every write tool with a maintenance message).
  - A monthly cost line for the VM share, R2 and Cloudflare.
- **Listing kit.**
  - Privacy policy and terms updated for hosted data: what is stored, where (Singapore), how long, deletion, contact. The current `docs/legal/*.md` describe local use only.
  - A support page and a reviewer guide (test prompts, plus a test account once sign-in ships).
  - Five positive and three negative test cases for OpenAI.
  - 3–5 PNG carousel screenshots of the in-chat view for Claude.
  - The allowed link URIs for the viewer origin.
- **ChatGPT plugin for the listing.** A build variant of `packages/chatgpt-plugin` whose `mcp.json` names the hosted URL instead of the bundled stdio server. It is used only for the directory submission. The self-install zip stays local.
- **Submissions.** Claude: developer portal → MCP connector (auth "Required when the server asks" once `add-gateway-sign-in` ships, "none" before). ChatGPT: platform.openai.com/plugins with the hosted plugin variant and domain verification.

Not in this change: switching the Claude plugin or any other install to the hosted server (not planned), multi-VM, a separate render service.

## Capabilities

### New Capabilities
- `hosted-gateway-operations`: how the gateway is built, deployed, protected, backed up, operated and listed.

### Modified Capabilities
None. The hosted-URL listing variant of the ChatGPT plugin is a build flag and is covered by the "Hosted Listing Only for Directories" requirement here.

## Impact

- This repo: `remote-image.yml`, `deploy/README.md`, `docs/legal/`, `docs/reference/remote-server.md`, a listing folder (`docs/listing/`), `packages/chatgpt-plugin` build flag.
- `feimacode/feima-infra`: role, router, vault entries.
- Cloudflare: DNS records, rules, R2 bucket (Iven's account).
- Cost: a share of an existing VM, plus R2 at a few cents a month at this scale.
