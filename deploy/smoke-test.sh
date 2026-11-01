#!/bin/sh
# Smoke-tests a running gateway (openspec add-mcp-gateway, deploy-hosted-gateway):
#   deploy/smoke-test.sh http://127.0.0.1:8080
# Checks the health route, an MCP initialize, the tool list and one project.
set -eu
BASE="$1"
curl -fsS "$BASE/healthz" | grep -q '"ok":true'
H='content-type: application/json'
A='accept: application/json, text/event-stream'
init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
headers=$(curl -fsS -D - -o /dev/null -X POST "$BASE/mcp" -H "$H" -H "$A" -d "$init")
sid=$(echo "$headers" | tr -d '\r' | sed -n 's/^[Mm]cp-[Ss]ession-[Ii]d: *//p')
[ -n "$sid" ] || { echo "no Mcp-Session-Id in the initialize response"; exit 1; }
curl -fsS -o /dev/null -X POST "$BASE/mcp" -H "$H" -H "$A" -H "mcp-session-id: $sid" -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
tools=$(curl -fsS -X POST "$BASE/mcp" -H "$H" -H "$A" -H "mcp-session-id: $sid" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
echo "$tools" | grep -q 'start_open_design_project' || { echo "start_open_design_project is not listed"; exit 1; }
if echo "$tools" | grep -q '"name":"set_open_design_workspace"'; then echo "a local-only tool is listed"; exit 1; fi
started=$(curl -fsS -X POST "$BASE/mcp" -H "$H" -H "$A" -H "mcp-session-id: $sid" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"start_open_design_project","arguments":{"title":"smoke"}}}')
echo "$started" | grep -q 'odp_' || { echo "start_open_design_project returned no handle: $started"; exit 1; }
echo "gateway OK at $BASE"
