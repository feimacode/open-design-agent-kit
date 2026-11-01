## 0. Decisions

- [x] 0.1 Iven picks the host, domain and budget cap (design.md, decision 5). Replaced by `deploy-hosted-gateway`: the Feima Azure VM, feimacode.com on Cloudflare

## 1. Storage

- [x] 1.1 Phase 1 keeps each session as a folder under `OPEN_DESIGN_REMOTE_DATA_DIR` on a mounted volume (design.md, decision 3); the `WorkspaceStore` interface moves to phase 2
- [ ] 1.2 Phase 2: `WorkspaceStore` in `packages/core` with an object-storage store, when sessions must be shared across instances

## 2. Remote mode

- [x] 2.1 `--http [--port]`: streamable HTTP at `/mcp`, `/healthz`; integration test with the SDK client
- [x] 2.2 `OPEN_DESIGN_PROFILE=remote`: always folderless, per-session workspace; `REMOTE_HIDDEN_TOOLS` with a test that every tool is classified
- [x] 2.3 Session folders named by session id, 7-day expiry sweep; tests
- [x] 2.4 Exports return expiring signed HTTPS links (`/files/...`)
- [x] 2.5 Per-session limits (files, bytes, exports, request rate) with plain-language errors; unit tests
- [x] 2.6 Bearer token (or token in the URL) for the private instance
- [x] 2.7 No server-side fetching of user-named URLs: `extract_open_design_design_system` hidden, `sourceUrl` and `embedAssets` refused, only temporary publish providers

## 3. Image and deploy

- [x] 3.1 `deploy/Dockerfile` (Node, bundled server and content, Chromium, unprivileged user); `deploy/smoke-test.sh`
- [x] 3.2 Manual workflow that builds and smoke-tests the image (`remote-image.yml`); `deploy/README.md`
- [x] 3.3 Push the image to the chosen registry and deploy the private instance (after 0.1). Replaced by `deploy-hosted-gateway` (GHCR, feima-infra role)

## 4. Verification

- [ ] 4.1 ChatGPT web, developer mode: add the URL, make a poster, see it in chat (view or link), export a PDF and download it
- [ ] 4.2 Claude web custom connector: the same
- [x] 4.3 Stdio unchanged: the full unit suite passes (the `.mcpb` and plugin smoke tests run in the release workflow)
- [ ] 4.4 Write up cost per design and what phase 2 needs
