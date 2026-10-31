# MCP Apps host probe

A test tool for openspec `chatgpt-mcp-apps-compat`. It finds out what a host (first of all the ChatGPT desktop app) does with MCP Apps views from a **local** plugin, so the kit's in-chat preview can be adapted to facts.

It's a tiny stdio MCP server with one view. When the view opens, it runs by itself and records:

- the client's `initialize` capabilities and `clientInfo` (does ChatGPT list `io.modelcontextprotocol/ui`?);
- which tools the host offers and who calls them (are app-only tools kept from the model?);
- the host info, capabilities and context the view gets (display modes, theme), and which `window.openai` extras exist;
- whether a `srcdoc` iframe runs its inline script (the kit's preview needs that);
- the largest tool result that reaches the view (1 kB up to 5 MB);
- whether `ui/update-model-context` works.

Everything goes into `probe-log.jsonl` in the plugin's folder.

## Run it in ChatGPT desktop

```bash
npm ci
node scripts/probe-mcp-apps-host/build.mjs --install
```

1. Quit and reopen ChatGPT.
2. **Plugins → Personal**: turn on **Open Design probe**.
3. In a new **Work** thread (then once more in the **Codex** tab), ask: "run the Open Design probe".
4. Wait until the view says **Done** (or until nothing has changed for a minute: no view at all is also a result).
5. Send `~/.codex/plugins/od-mcp-apps-probe/probe-log.jsonl`.

Remove it with `node scripts/probe-mcp-apps-host/build.mjs --uninstall`.

Checked in a reference host (ext-apps `AppBridge` in headless Chromium, 2026-10-31): it connects, reports the host context, the `srcdoc` script runs, and 5 MB results arrive.
