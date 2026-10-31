# Hosted Open Design MCP server

Phase 1 of `openspec/changes/add-remote-mcp-server`: one container that serves
Open Design as a remote MCP server over streamable HTTP, for ChatGPT web (developer
mode), Claude web connectors and other remote MCP clients. The full reference is
[docs/reference/remote-server.md](../docs/reference/remote-server.md).

## Build and run

```sh
docker build -f deploy/Dockerfile -t open-design-remote .
docker run -p 8080:8080 \
  -e OPEN_DESIGN_REMOTE_TOKEN="$(openssl rand -hex 24)" \
  -e OPEN_DESIGN_PUBLIC_URL=https://design.example.com \
  -v od-data:/data \
  open-design-remote
deploy/smoke-test.sh http://127.0.0.1:8080 <token>
```

The image has Node 22, the same bundled server and content the desktop bundles
ship (`deploy/stage-server.ts`), and Debian's Chromium behind a `--no-sandbox`
wrapper, and runs as an unprivileged user. Put it behind HTTPS: ChatGPT and
Claude only connect to `https://` servers.

## Storage

Every MCP session gets a folder under `/data/sessions/<id>`. Mount `/data` on
a volume (on Cloud Run, a Cloud Storage FUSE volume; on Fly.io, a volume) so
files survive restarts. Folders idle for `OPEN_DESIGN_REMOTE_SESSION_DAYS` are
deleted. Run one instance until sessions are shared across instances: an MCP
session lives in the memory of the instance that started it.

## Not decided yet

The host, domain, registry and budget. `.github/workflows/remote-image.yml`
builds and smoke-tests the image by hand and pushes nowhere.
