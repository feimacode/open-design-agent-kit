## Why

Integrations now drive real workflows (Canva publish, Figma pull and push), but users have no way to see which ones exist, which are already working, or how to set one up, short of hitting a step that needs one. The connectors pages in Claude and Discord set the bar: one list, a clear state per service, one obvious next step.

Separately, when an integration isn't available the agent sometimes misses the manual path the workflow already has. In a Copilot test, the agent said Notion paste export didn't exist when it did. So each integration should name its manual fallback.

## What Changes

- **Three statuses for every integration,** shown as coloured dots:
  - 🟢 **connected:** its tools are available now;
  - 🟡 **installed, not connected:** configured but not usable yet (needs sign-in, failed or not started);
  - ⚪ **not installed.**
- **Chat command on every agent:** a shared `open-design-integrations` prompt, a skill in Claude Code and Codex and a prompt file in VS Code. It lists the integrations grouped by purpose, each with its dot, what it does in Open Design and the next step, then offers setup under the existing consent rules. The agent decides the status from its own tools (including deferred ones) and from the read-only `claude mcp list` / `codex mcp list`, when available, for the 🟡 state.
- **VS Code Integrations panel:** a fourth view in the Open Design sidebar.
  - **Detection:** 🟢 comes from the tool list (`vscode.lm.tools`); 🟡 from the user's and workspace's MCP configuration files.
  - **Refresh:** when the view is shown, when the window regains focus, and from a Refresh button.
  - **Clicking an item opens a setup view** with a button for VS Code's native install page (a `vscode:mcp/install` link, which uses VS Code's own secure prompt for API keys), the equivalent `mcp.json` snippet for manual setup, caveats, the manual fallback and docs. A connected item offers "Use in chat" instead.
- **Manual fallback per integration:** a new registry field, e.g. Notion → paste export, Canva → PDF/PPTX import, Figma → import plugin. It's shown in lookups, the chat list and the setup view.
- **Catalog mode of `list_open_design_integrations`** gains, per entry, the agent's tool-name hints, the purpose group and the manual fallback, so the chat command needs one call.

## Capabilities

### New Capabilities
- `integrations-list`: the three statuses and how each host decides them, the chat command, the VS Code panel, and its setup view.

### Modified Capabilities
- `integration-registry`: entries carry a manual fallback and a purpose group. The catalog result includes hints and fallbacks.

## Impact

- **`packages/content/local/integrations.json`:** `manualFallback` on every entry, checked by the content guard.
- **`packages/core/src/integrations/`:** status helpers (tool matching, configured-server matching, grouping), richer catalog output, and fallbacks in lookups.
- **`packages/content/local/prompts/integrations.md`:** the new shared prompt, regenerated into Claude Code and Codex skills, CLI assets and the VS Code prompt files.
- **`packages/vscode`:** the Integrations tree view, the setup webview, its commands and `package.json` contributions.
- **Docs:** the integrations guide, and the prompts-and-commands reference.
- No new dependencies. Nothing is installed without the user acting: in VS Code, the native install page asks for confirmation itself.
