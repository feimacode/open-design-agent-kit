## 0. Decisions

- [ ] 0.1 Iven: final hostname (`open-design.feimacode.com` suggested), the user-content domain, the backup target (R2 or Azure Blob)

## 1. Image

- [x] 1.1 `remote-image.yml` pushes `ghcr.io/feimacode/open-design-gateway:<version>` on release and on dispatch, after the smoke test

## 2. Infrastructure (feimacode/feima-infra PR)

- [ ] 2.1 `open-design-gateway` role: compose service, volume, limits, env, vault secrets
- [ ] 2.2 Traefik routers for the gateway host and the user-content host
- [ ] 2.3 Cloudflare: DNS, Tunnel or Full (strict), no challenges on `/mcp`, `/.well-known/*` and the viewer, rate-limit rule
- [ ] 2.4 Nightly backup to R2/Blob, 7-day retention; one restore test
- [ ] 2.5 External health check, alert to Iven

## 3. Operations

- [x] 3.1 `OPEN_DESIGN_GATEWAY_READONLY` kill switch; tests
- [x] 3.2 Logs without design content (paths and tool names only); `deploy/README.md` runbook: deploy, roll back, read-only, restore

## 4. Listing kit

- [x] 4.1 Privacy policy and terms for hosted data (`docs/legal/`), support page
- [x] 4.2 Reviewer guide, 5 positive + 3 negative test cases, carousel screenshots, allowed link URIs (`docs/listing/`)
- [x] 4.3 `packages/chatgpt-plugin` build flag for the hosted-URL listing variant; the self-install zip unchanged

## 5. Submit

- [ ] 5.1 Claude: custom-connector test of every tool, then the developer portal (MCP connector)
- [ ] 5.2 ChatGPT: developer-mode test, domain verification, submit the hosted plugin variant
- [x] 5.3 Mark `add-remote-mcp-server` tasks 0.1 and 3.3 as replaced by this change
