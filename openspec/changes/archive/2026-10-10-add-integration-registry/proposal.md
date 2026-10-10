## Why

Several workflows end in a copy-paste handoff to another service. The Canva flow says "export a PDF and import it on canva.com". The Figma flow asks for a personal access token. The social pipeline stops with "posting itself is out of scope". Yet the services users already rely on now ship high-quality MCP servers: Canva, Figma, Notion, Google Drive and Slack run official remote servers, and Buffer and Metricool cover social platforms that have no official server. Every agent we support can use these servers: Claude Code (claude.ai connectors or `claude mcp add`), Codex, VS Code/Copilot and Cursor. In a live Claude Code session, a synced Canva connector exposed 40 tools.

What's missing is a way for our workflows to know these servers exist, prefer them in the right order, and help the user install a missing one safely. Without that, every future integration (Canva publish, Figma, social posting) would hard-code its own server details and install steps into each agent's prompts.

## What Changes

- **Integration registry** (new content file + core module): one entry per trusted third-party MCP server. Each entry holds the server URL and transport, how it signs in (OAuth with dynamic registration, API key via env var, the user's own OAuth client, admin enablement, or claude.ai-connector-only), client-allowlist and plan/admin caveats, a priority tier (official platform > official service > aggregator), our capability keys mapped to the server's bare tool names, how to recognize its tools, and a `verifiedAt` date. The first entries are Canva, Figma, Notion, Google Drive, Slack, Buffer and Metricool, plus X as an official platform server with manual-only setup.
- **Per-agent install templates** rendered from each entry for Claude Code, Codex, VS Code, Cursor and generic MCP clients:
  - the command or config snippet, user scope by default;
  - secrets referenced as env vars, never written literally;
  - the sign-in and reload steps that follow;
  - for Claude Code users signed in with claude.ai, the claude.ai connector offered first when one exists.
- **New tool `list_open_design_integrations`**, on both the VS Code extension and the MCP server with the same shape. Given a capability and/or integration id, plus optionally the agent (inferred from the MCP client when omitted), it returns:
  - the providers in priority order;
  - the tool-name patterns that show each one is installed;
  - the install template for that agent;
  - the consent rules.
  It never installs anything and never contacts the services.
- **Shared integration instruction block** in the overview instructions on every host: before using another service, look up its providers. Check your own tools, including deferred or on-demand ones. Use the integration if it's present. If it isn't, offer to install it with the returned template, wait for an explicit yes, then guide sign-in and reload, and confirm by listing the tools. Otherwise continue with the existing manual fallback. Third-party tools are referred to by their bare, server-defined names, the same way on every agent.
- **Confirm-and-install flow rules**:
  - install only after explicit consent, at user scope, never into a committed project file;
  - the user sets API keys themselves as env vars, and they never appear in chat or config;
  - Anthropic-hosted connectors (e.g. Microsoft 365) are offered only through claude.ai;
  - community servers are never installed from a template.
- **Content build guard**: the registry is validated on every content check. Checks include https URLs, known auth kinds, no literal secrets, every capability mapped to a tool name, and the presence of `verifiedAt`.

Out of scope here, and covered by later backlog items: reworking the Canva publish or Figma pull flows to use these connectors, social posting and post kits, a generated integrations docs page, and Codex `agents/openai.yaml` auto-install dependencies.

## Capabilities

### New Capabilities
- `integration-registry`: the trusted third-party MCP registry, its per-agent install templates, the `list_open_design_integrations` tool on every host, the shared look-up/check/offer/consent/fallback instruction block, and the content guard that validates the registry.

### Modified Capabilities
<!-- None. open-design-tools' "No Daemon or MCP Dependency" still holds: every
     existing tool works with no third-party server installed; integrations are
     optional accelerators with a manual fallback. -->

## Impact

- **New content**: `packages/content/local/integrations.json` (registry data), validated by the content check script.
- **New core module**: `packages/core/src/integrations/`, covering loading, validation, priority resolution, per-agent template rendering and result formatting, exported from `packages/core/src/index.ts`.
- **New tool on both hosts**: `packages/vscode/package.json` (`languageModelTools` entry) + `packages/vscode/src/tools/listIntegrationsTool.ts` + `registerTools.ts`; `packages/mcp-server/src/tools.ts` and `index.ts`. The MCP server reads the client name from the MCP `initialize` handshake to infer the agent.
- **Overview instructions**: the integration block is added to `packages/vscode/instructions/open-design.instructions.md` and `packages/claude-plugin/skills/open-design/SKILL.md`. Codex's overview copy and the CLI's bundled skills are regenerated from the latter.
- **Docs**: `docs/reference/tools.md` gets the new tool (required by the reference completeness check), and a short section explains integrations and consent.
- **No new runtime dependencies.** No network calls to third-party services from our code. No behavior change for users who never use an integration.
