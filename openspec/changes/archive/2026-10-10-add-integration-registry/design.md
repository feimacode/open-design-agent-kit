## Context

Today every handoff to another service is hand-written into a single flow. `publishCanvaTemplateInstructions.ts` tells the user to import a file on canva.com, `figmaPull.ts` uses a Figma personal access token, and `docs/automation/social-pipeline.md` stops before posting. Research for this change (see the connectors backlog, D1–D5) established:

- **The services we need have MCP servers.** Official remote servers exist for Canva (`mcp.canva.com/mcp`, tested: 40 tools appeared through a claude.ai connector), Figma, Notion, Google Drive and Slack. Posting aggregators (Buffer `mcp.buffer.com/mcp`, Metricool `ai.metricool.com/mcp`) cover most social platforms. Only X has an official platform server for posting, and it's local and self-hosted.
- **The same server gets a different name in each agent.**
  - Claude Code: `mcp__claude_ai_<Name>__t`, `mcp__<name>__t` or `mcp__plugin_<p>_<s>__t`.
  - Codex: `mcp__<name>__t`.
  - VS Code: `mcp_` + the server's self-reported name, at most 18 characters, then `_t`.
  - Cursor: unverified.
  
  Only the server-defined tool name is stable. Models resolve bare names reliably: a skill saying "Canva's `help` tool" called `mcp__claude_ai_Canva__help`. Our own skills already reference our tools this way.
- **Sign-in differs per server.** OAuth with dynamic client registration (Canva, Notion, Slack, Metricool); API key in a header (Buffer); the user's own Google Cloud OAuth client (Drive); admin enablement (Box, Miro); claude.ai only (Microsoft 365, Gmail and Calendar, which can't sign in locally). Some servers accept only listed clients (Figma, Slack).
- **Our architecture is tools + instructions + prompts.** Our code composes instructions; the agent acts with its own tools. Everything has to work identically on the VS Code extension and the MCP server (parity requirement). The user prefers native mechanisms over bespoke machinery.

## Goals / Non-Goals

**Goals:**
- One data-driven registry of trusted third-party MCP servers, the single source for priorities, tool names, caveats and install steps.
- A runtime tool every agent can call, so prompts stay short and registry updates ship with content.
- A consistent, consent-first flow: look up, check, use; otherwise offer to install, wait for yes, then sign in, reload and verify; otherwise fall back.
- Safe install templates for Claude Code, Codex, VS Code, Cursor and generic clients.

**Non-Goals:**
- Changing the Canva publish, Figma pull or any export flow to use a connector. Those are follow-up changes that consume this registry.
- Social posting, post kits, image hosting, and remembering a user's preferred posting service.
- Our code installing servers, calling third-party servers, or holding credentials.
- Community servers as installable templates. They may appear later as docs-only entries.
- Codex `agents/openai.yaml` MCP dependencies, Codex ChatGPT apps, and Claude Code plugin-bundled third-party servers.
- A generated integrations docs page; only the tool reference and a short guide section are in scope.

## Decisions

### D1. Registry is content, logic is core
`packages/content/local/integrations.json` holds the data, beside `surfaces.json` and `curated.json`. `packages/core/src/integrations/` holds the typed loader, validator, priority resolver, template renderer and formatter.

This way a URL change (Asana and Atlassian both moved endpoints in 2026) is a content edit. The content check validates the file the same way it guards `surfaces.json`.

*Alternative:* hard-code the entries in TypeScript. Rejected: entries are data, change often, and should be reviewable without reading code.

### D2. Entry shape
```jsonc
{
  "id": "canva",
  "displayName": "Canva",
  "vendor": "Canva",
  "tier": "official-service",          // official-platform | official-service | aggregator
  "capabilities": {                     // our capability key → server tool name (bare) or null
    "design.import": "import-design-from-url",
    "design.upload": "create-upload-url",
    "design.export": "export-design",
    "brand.kits": "list-brand-kits"
  },
  "platforms": [],                      // aggregators/social only: x, linkedin, instagram, …
  "server": { "transport": "http", "url": "https://mcp.canva.com/mcp", "suggestedName": "canva" },
  "auth": { "kind": "oauth-dcr" },      // oauth-dcr | api-key-header{envVar,header,docsUrl} | own-oauth-client{docsUrl} | admin-enabled{docsUrl} | claude-ai-only
  "claudeAiConnector": "Canva",         // directory name if one exists → mcp__claude_ai_Canva__*
  "caveats": ["…plan/admin/client-allowlist notes…"],
  "installable": true,                  // false → manual steps only (e.g. X's self-hosted xmcp)
  "manualSetup": null,                  // markdown steps when installable is false or auth needs them
  "docsUrl": "https://canva.dev/docs/mcp/",
  "verifiedAt": "2026-10-10",
  "toolsVerified": true                 // tool names checked against a live server
}
```

**Capability keys** come from a small closed vocabulary in core: `design.import`, `design.upload`, `design.export`, `design.read`, `design.write`, `brand.kits`, `docs.write`, `storage.read`, `storage.upload`, `team.share`, `social.post`, `social.schedule`. The validator rejects unknown keys, so prompts and entries can't drift apart.

**Tool names.** A capability maps to `null` when its tool name hasn't been checked against a live server. The tool then tells the model to match by tool description ("Notion's tool that creates a page"), and the guard warns, but does not fail, on `toolsVerified: false`.

### D3. Priority resolution
`resolveIntegrations({ capability?, integration?, platform? })` returns matching entries ordered as follows:

1. **Tier:** official-platform > official-service > aggregator. So for `social.post` on X, xmcp comes before Buffer (backlog D1).
2. **Within a tier,** registry order, which is curated.

When several aggregators match, the result says so explicitly ("ask the user which service they use"). That's the minimal form of letting the user pick a provider (backlog D2). Remembering the choice is a non-goal.

### D4. Per-agent template rendering
`renderInstall(entry, agent)` produces `{ steps, command?, config?, signIn, reload, verify }` for `claude-code | codex | vscode | cursor | generic`.

| Agent | Install | Secret reference | Sign-in |
|---|---|---|---|
| claude-code | If `claudeAiConnector` is set: "connect it at claude.ai/customize/connectors" first (works on every Claude surface, avoids duplicates). Else `claude mcp add --transport http --scope user <name> <url>` | `--header 'Authorization: Bearer ${ENV}'` (single-quoted so the shell doesn't expand it; expansion at load time to be verified, else `headersHelper`) | `/mcp` → authenticate |
| codex | `codex mcp add <name> --url <url>` | `bearer_token_env_var = "ENV"` in `~/.codex/config.toml` | `codex mcp login <name>` |
| vscode | `code --add-mcp '{"name":…,"type":"http","url":…}'`, or the "MCP: Add Server" command as fallback | an `inputs` entry with `password: true`, referenced as `${input:…}` (stored by VS Code, never in the file) | VS Code's own auth prompt on first use |
| cursor | Edit `~/.cursor/mcp.json` | `${env:ENV}` in `headers` | Cursor's MCP settings → connect |
| generic | The config JSON for the common `mcpServers` shape | env var reference | Per client |

**`claude-ai-only` entries** render only the claude.ai instruction, plus "not available in this agent" for the others.

**`installable: false` entries** render `manualSetup` only.

**Every template ends with verify:** "list your tools and confirm one matching `<pattern>` is present". Patterns are derived per agent from `suggestedName`, `claudeAiConnector` and the tool names, following the verified naming rules. They're presented as hints, not authority.

*Alternative:* our tool executes the install. Rejected: it bypasses the agent's own approval UI, differs per host, and contradicts the instructions-only architecture.

### D5. `list_open_design_integrations` tool, both hosts
Input: `{ capability?, integration?, platform?, agent? }`. With no filters, it returns a compact catalog: ids, display names, tiers, capabilities.

**Agent inference:** the VS Code host always answers `vscode`. The MCP server infers the agent from the client name the client sent during the MCP `initialize` handshake, using a small mapping table, falling back to `generic`. An explicit `agent` overrides it.

**Output** is markdown like other compose tools:
- the providers in priority order, each with caveats, tool-name hints and the install template for the agent;
- the consent rules (D7), repeated so they apply even when the overview instructions aren't loaded.

The tool is read-only: no files, no network.

### D6. One shared instruction block, in the overview instructions
The block goes into the two hand-authored overview sources, `packages/vscode/instructions/open-design.instructions.md` and `packages/claude-plugin/skills/open-design/SKILL.md`. Codex and CLI copies are regenerated from the latter. It is not stamped into every prompt.

Text, in essence:
> When a step would hand work to another service (Canva, Figma, Notion, Google Drive, Slack, a social network), call `list_open_design_integrations` for that capability. Check your own tools, including deferred or on-demand ones you can search for, for a match. If one is present, use it, by its server-defined name. If none is, offer to set up the first provider using the returned steps, and wait for an explicit yes. Never install silently. Then guide sign-in and any reload, and confirm by listing tools. If the user declines, or setup fails, continue with the manual path the workflow already describes.

Later flow changes (Canva, Figma, social) only add a one-line pointer ("this step can use the `design.import` integration").

*Alternative:* each prompt carries the full block. Rejected: duplication across 9 local prompts × 3 hosts.

### D7. Consent and safety rules (enforced by text, checked by tests on the text)
- Install only after an explicit yes in the current conversation, at user scope, and never into a committed project file (`.mcp.json`, `.vscode/mcp.json`, `.codex/config.toml` in the repo).
- API keys: the user sets the env var or VS Code input themselves. The agent never asks for a key in chat and never writes one into a file.
- Never pre-approve third-party tools. No `allowed-tools` entries for them, so each call keeps the agent's normal per-action approval, which is the user's consent to act on their account.
- Community servers are never offered from a template.
- Anything that publishes, sends or posts still asks first. That's the existing workflow rule, restated in the block.

### D8. Content guard
`check-content-sync` validates `integrations.json`:
- the schema;
- `https://` URLs;
- known `tier` and `auth.kind`;
- capability keys in the vocabulary;
- an `envVar` for `api-key-header`;
- no header or config value that looks like a literal credential (token-like patterns);
- a `verifiedAt` date, with entries older than 180 days reported as warnings;
- unique ids.

### D9. Initial entries

| id | tier | auth | Notes |
|---|---|---|---|
| canva | official-service | oauth-dcr | Tool names verified live |
| figma | official-service | oauth-dcr | Client allowlist covers all four agents. Tool names to inventory. |
| notion | official-service | oauth-dcr | `mcp.notion.com/mcp` |
| google-drive | official-service | own-oauth-client | `drivemcp.googleapis.com/mcp/v1`; also a claude.ai connector |
| slack | official-service | oauth-dcr | `mcp.slack.com/mcp`; client allowlist |
| buffer | aggregator | api-key-header (`BUFFER_API_KEY`) | Tool names from Buffer docs (`create_post`, …); text-only on X/Mastodon/Threads/Bluesky |
| metricool | aggregator | oauth-dcr | `ai.metricool.com/mcp`; claude.ai connector |
| x | official-platform | — | `installable: false`; manual setup for self-hosted `xdevplatform/xmcp` (needs the user's X developer app) |

## Risks / Trade-offs

- **[Registry goes stale: endpoints move, tools get renamed]** → `verifiedAt` plus an age warning in the guard. Tool names can be `null`, falling back to matching by description. The verify step catches a wrong pattern at runtime.
- **[Agent inference from the MCP client name is wrong or unknown]** → falls back to `generic`, and the model can pass `agent` explicitly. Unit tests cover the known names once captured.
- **[Secret expansion behaves differently from what the table assumes]** → a task verifies each agent's env-var or input expansion before shipping. An agent that can't reference a secret safely gets manual steps only for `api-key-header` entries.
- **[`code --add-mcp` unavailable (no `code` on PATH, remote/WSL)]** → the template includes the "MCP: Add Server" command fallback.
- **[Models over-suggest installs]** → the block says to offer once per conversation and only when a workflow step actually needs the capability. The tool output repeats it.
- **[Recommending third-party services]** → the registry lists only official vendor servers and well-known aggregators. Caveats state plan and pricing facts without endorsement.

## Spike Results (2026-10-10)

- **MCP client names** (captured from the `initialize` handshake):
  - Claude Code: `claude-code`, title "Claude Code".
  - Codex: `codex-mcp-client`, title "Codex".
  - VS Code: the product's long name ("Visual Studio Code", or "… - Insiders"), read from the workbench source.
  - Cursor, a VS Code fork: its product name ("Cursor") is the assumption, with the mapping matching `/cursor/i`.
- **Secret references:**
  - Claude Code stores a single-quoted `${VAR}` header literally and expands it on connect (tested in an isolated `CLAUDE_CONFIG_DIR`).
  - Codex `--bearer-token-env-var VAR` writes `bearer_token_env_var` and sends the env value (tested in an isolated `CODEX_HOME`).
  - VS Code uses `inputs` with `password: true` and a `${input:id}` header (docs). `--add-mcp` only takes the server JSON, so `api-key-header` entries on VS Code are added by the user through "MCP: Open User Configuration" with the rendered snippet.
  - Cursor: `${env:VAR}` in `headers` (docs, not tested).
- **Tool names:**
  - Canva: live (40 tools).
  - Figma, Notion, Google Drive, Buffer: from vendor docs.
  - Slack, Metricool: not found, so `null` and `toolsVerified: false`.

- **[The block only applies inside design workflows]** It lives in the `open-design` overview skill, which loads for design requests. Seen in the manual check: a bare "save this to Notion" request didn't load it and the agent didn't call the tool. The same request framed as the last step of a design workflow called it, offered setup and waited for a yes. This is intended scope: integrations accelerate our workflows, not general agent use. Later flow changes add their own pointer at the step.

## Open Questions

- Cursor's exact client name (not installed here); matched by `/cursor/i` until confirmed.
