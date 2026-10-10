## Context

The integration registry (`integrations.json`) and `list_open_design_integrations` exist. Lookups give providers, tool-name hints and per-agent setup; catalog mode lists entries by name.

Facts confirmed in VS Code's own code (stable build, 2026-10):
- `vscode.lm.tools` returns every tool known to the workbench, MCP tools included. Each has `name` (VS Code's MCP id: `mcp_` + server prefix + tool, e.g. `mcp_canva_import-design-from-url`), `fullReferenceName` and `tags`.
- There's no stable event for tool-list changes. `vscode.lm.mcpServerDefinitions` and its change event are proposed APIs, which Marketplace extensions can't use.
- VS Code handles `vscode:mcp/install?<url-encoded JSON {name, type, url, headers, inputs}>` by opening its own MCP server page with an Install button, the page the `@mcp` gallery uses. `inputs` gives VS Code's secure prompt for API keys.
- VS Code keeps a server's tool definitions cached after first start, so tools in the list mean "installed and started at least once". They don't prove the server is running right now.

The user chose: three statuses only, shown as coloured dots, and a setup view that offers both the native install link and a manual JSON snippet.

## Goals / Non-Goals

**Goals:** one list of integrations with an honest status and one next step, on every agent; native setup in VS Code; a manual fallback named for every integration.

**Non-Goals:**
- Installing anything without the user's own action.
- Showing live health or sign-in state that the APIs don't expose.
- Managing or removing servers (VS Code's own MCP view does that).
- Listing community servers.

## Decisions

### D1. Status model
Three values: `connected`, `installed` (installed, not connected) and `not-installed`.

Entries that can't be installed on the current agent (X's self-hosted server, or a claude.ai-only connector outside Claude Code) are `not-installed`, and their next step is the manual setup text. Dots:
- **chat:** 🟢 / 🟡 / ⚪;
- **VS Code:** a `circle-filled` ThemeIcon coloured `testing.iconPassed` / `charts.yellow` / `disabledForeground`, with the status word in the item description for accessibility.

### D2. Detection per host

| Host | 🟢 connected | 🟡 installed, not connected |
|---|---|---|
| Claude Code / Codex (chat) | The agent's own tool list, including deferred tools, matches the entry's hints | The entry appears in `claude mcp list` (✘ failed / needs authentication) or `codex mcp list` but its tools aren't available. The agent runs these read-only commands only when it has a shell. |
| Cursor / generic (chat) | Tool list matches | Not determinable, so ⚪ with "set up, or restart if you already did" |
| VS Code panel | Any name in `vscode.lm.tools` matches the entry's VS Code hints (core `matchesIntegrationTools`) | A server in the user's or workspace's MCP config matches the entry's URL host and path (or its suggested name), with no matching tools |

**VS Code config files read:**
- the user `mcp.json` in the user data folder (derived from `context.globalStorageUri`, two levels up), plus `profiles/*/mcp.json` beside it;
- the workspace's `.vscode/mcp.json` and root `.mcp.json`;
- the legacy `mcp.servers` setting.

Parsing is lenient JSONC (comments and trailing commas allowed). Failures are ignored.

### D3. Core helpers (`integrations/status.ts`)
- `matchesIntegrationTools(entry, toolNames, agent)`: true when a name matches the entry's hint patterns for that agent (glob → regex). It falls back to "ends with one of the entry's tool names" combined with the server prefix, so a generic tool called `create_file` doesn't make Google Drive look connected.
- `matchesConfiguredServer(entry, server)`: `server` is `{ name, url? }`. It compares the URL's host and path against the entry's server URL, or the name against `suggestedName`.
- `integrationGroup(entry)`: Design (design.*, brand.*), Docs & storage (docs.*, storage.*), Team (team.*) or Social posting (social.*), decided by the entry's first capability.
- `integrationStatus(entry, { toolNames, configuredServers, agent })`: one of the three values.

### D4. Catalog mode carries what the chat command needs
`list_open_design_integrations` with no filters returns, per entry:
- id, name, group, the agent's tool-name hints;
- whether it's installable on this agent;
- the manual fallback.

That's grouped markdown, so the chat command needs a single call. Filtered lookups add a "Manual path" line per provider.

### D5. Shared chat command
`packages/content/local/prompts/integrations.md` (`name: open-design-integrations`) goes through the existing local-prompt pipeline:
- **Claude Code and Codex:** a skill, model-invocable for "what integrations / connectors do I have".
- **VS Code:** a prompt file `/open-design-integrations`.

Its body:
1. Call the catalog.
2. Check tools, including deferred ones.
3. If a shell is available, run `claude mcp list` or `codex mcp list` read-only for the 🟡 state.
4. Reply with one table per group (dot, integration, what it does in Open Design, next step) and a one-line legend.
5. Offer to set up whatever the user names, using the filtered lookup and its consent rules. Never install from the list itself.

### D6. VS Code panel and setup view
- **`IntegrationsTreeProvider`** (`openDesign.integrationsView`, "Integrations"): groups, then items. Refresh on `onDidChangeVisibility`, on `window.onDidChangeWindowState` focus, and from a `openDesign.refreshIntegrations` title-bar button.
- **Clicking an item runs `openDesign.showIntegration`,** which opens one reusable webview panel (`IntegrationSetupPanel`) rendered from core data:
  - name, dot and status, what it does, sign-in type and caveats;
  - **Install in VS Code:** a button that opens `vscode:mcp/install?…` built by core `vscodeInstallLink(entry)`. For `api-key-header` entries it includes an `inputs` password entry and a `${input:…}` header. It's omitted for manual-only and claude.ai-only entries;
  - **Or add it yourself:** the `mcp.json` snippet (the same as the chat VS Code template), with Copy and **Open User MCP Configuration** (`workbench.mcp.openUserConfiguration`) buttons;
  - **Without it:** the manual fallback;
  - docs link, and for a connected entry, **Use in chat** (opens Copilot with the lookup);
  - the panel refreshes the tree when it closes.
- **The webview uses the extension's existing theme and nonce helpers** (`openDesignTheme`, as the other webviews do).

### D7. Manual fallback field
`manualFallback: string` is required on every entry and checked by the content guard. Initial values:

| Entry | Manual fallback |
|---|---|
| Canva | Export PDF/PPTX, then Canva's Import a file |
| Figma | `export_open_design_artifact`/pull with a token; the OD Figma Import plugin for push |
| Notion | `export_open_design_artifact` `format: "paste"`, `target: "notion"`, pasted into a page |
| Google Drive | Export and upload in Drive |
| Slack | Export a PNG or standalone HTML and post it |
| Buffer, Metricool, X | Export the images and post them yourself |

## Risks / Trade-offs

- **[Cached VS Code tools show 🟢 for a server that's currently stopped or signed out]** → the setup view says "connected (tools available)". VS Code starts servers on demand when a tool is used. We can't see live health without proposed APIs.
- **[Profile-specific `mcp.json` locations vary]** → we read the user file and every profile file, and treat any match as 🟡. Over-reporting 🟡 is harmless: the setup view still shows both options.
- **[Hint matching gives false positives]** → patterns include the server prefix, and tests cover look-alike names.
- **[The install link's JSON shape changes in a future VS Code]** → the JSON snippet is always shown alongside it.
