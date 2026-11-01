# The hosted Open Design gateway (openspec add-mcp-gateway, deploy-hosted-gateway).
# Build from the repository root:
#   docker build -f deploy/Dockerfile -t open-design-gateway .
# Run (see deploy/README.md):
#   docker run -p 8080:8080 -e OPEN_DESIGN_LINK_SECRET=<secret> -v od-data:/data open-design-gateway

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY . .
RUN npm ci --no-audit --no-fund \
 && mkdir -p /tmp/release \
 && npm pack --workspace=packages/content --pack-destination /tmp/release \
 && npx tsx deploy/stage-server.ts --content /tmp/release/feimacode-open-design-agent-kit-content-*.tgz --out /stage

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source=https://github.com/feimacode/open-design-agent-kit \
      org.opencontainers.image.description="The hosted Open Design MCP gateway"
# Chromium renders checks, PDFs and images. Containers have no user namespaces
# for Chromium's sandbox, so a wrapper adds --no-sandbox; the server runs as an
# unprivileged user and only ever loads the project's own files.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto fonts-noto-cjk fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && printf '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox "$@"\n' > /usr/local/bin/chromium-no-sandbox \
 && chmod +x /usr/local/bin/chromium-no-sandbox \
 && useradd --create-home --uid 10001 opendesign \
 && mkdir -p /data && chown opendesign /data
COPY --from=build /stage/server /app/server
ENV NODE_ENV=production \
    OPEN_DESIGN_PROFILE=remote \
    OPEN_DESIGN_REMOTE_DATA_DIR=/data \
    OPEN_DESIGN_BROWSER_PATH=/usr/local/bin/chromium-no-sandbox \
    OPEN_DESIGN_PREVIEW=off \
    PORT=8080
USER opendesign
WORKDIR /home/opendesign
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "/app/server/out/index.js"]
