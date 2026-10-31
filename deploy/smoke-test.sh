#!/bin/sh
# Smoke-tests a running hosted server (openspec add-remote-mcp-server):
#   deploy/smoke-test.sh http://127.0.0.1:8080 <token>
set -eu
BASE="$1"
TOKEN="$2"
curl -fsS "$BASE/healthz" | grep -q '"ok":true'
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/mcp" -H 'content-type: application/json' -d '{}')
[ "$code" = 401 ] || { echo "expected 401 without a token, got $code"; exit 1; }
init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
headers=$(curl -fsS -D - -o /dev/null -X POST "$BASE/mcp" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d "$init")
echo "$headers" | grep -qi '^mcp-session-id:' || { echo "no Mcp-Session-Id in the initialize response"; exit 1; }
echo "hosted server OK at $BASE"
