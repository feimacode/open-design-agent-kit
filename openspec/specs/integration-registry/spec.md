# integration-registry Specification

## Purpose
Let Open Design workflows use trusted third-party MCP servers (design tools, storage, docs, team chat, social posting) instead of manual handoffs: a validated registry of official servers and posting services, a read-only lookup tool on every host with per-agent setup steps, and a consent-first rule set. Nothing is installed without the user's yes, no secret is ever written, and every workflow keeps its manual path.
## Requirements
### Requirement: Trusted Integration Registry
The system SHALL ship a content-level registry (`packages/content/local/integrations.json`) of trusted third-party MCP servers. Each entry SHALL declare:
- an id and display name;
- a tier (`official-platform`, `official-service` or `aggregator`);
- capability keys from a closed vocabulary, each mapped to the server's bare tool name or `null`;
- the server transport and URL;
- an auth kind (`oauth-dcr`, `api-key-header`, `own-oauth-client`, `admin-enabled` or `claude-ai-only`);
- caveats, an optional claude.ai connector name, an `installable` flag with manual setup steps, a docs URL, a `verifiedAt` date and a `toolsVerified` flag.

The registry SHALL contain no community-maintained servers.

#### Scenario: Initial entries present
- **WHEN** the registry is loaded
- **THEN** it SHALL contain entries for Canva, Figma, Notion, Google Drive, Slack, Buffer, Metricool and X, with X marked `official-platform` and `installable: false`

#### Scenario: Unknown capability key rejected
- **WHEN** an entry maps a capability key that is not in the vocabulary
- **THEN** loading or validating the registry SHALL fail and name the entry and key

### Requirement: Registry Content Guard
The content check SHALL validate the registry and fail when any of these hold:
- the schema doesn't match, or ids are duplicated;
- a server URL isn't `https://`;
- a tier or auth kind is unknown;
- an `api-key-header` entry has no env var name;
- a header or config value looks like a literal credential.

It SHALL warn, without failing, when an entry's `verifiedAt` is older than 180 days or its `toolsVerified` is false.

#### Scenario: Literal credential rejected
- **WHEN** an entry contains a header value that looks like an API token instead of an env var reference
- **THEN** the content check SHALL fail and name the entry

#### Scenario: Stale entry warned
- **WHEN** an entry's `verifiedAt` is more than 180 days old
- **THEN** the content check SHALL pass with a warning naming the entry

### Requirement: Provider Priority Resolution
Resolving integrations for a capability, an integration id and/or a platform SHALL return the matching entries ordered by tier: `official-platform` first, then `official-service`, then `aggregator`. Within a tier, entries keep registry order. When more than one aggregator matches, the result SHALL state that the user should be asked which service they use.

#### Scenario: Official platform server first for X
- **WHEN** integrations are resolved for capability `social.post` and platform `x`
- **THEN** the X entry SHALL come before every aggregator that lists `x`

#### Scenario: Several aggregators match
- **WHEN** integrations are resolved for `social.post` on a platform both Buffer and Metricool support
- **THEN** both SHALL be returned and the result SHALL say to ask the user which one they use

### Requirement: Per-Agent Install Templates
For each installable entry, the system SHALL render install steps for `claude-code`, `codex`, `vscode`, `cursor` and `generic`. Each template SHALL include:
- the command or config snippet;
- the sign-in step;
- any reload step;
- a verify step naming the tool-name patterns to look for.

Templates SHALL:
- target user-level configuration, never a project file that is committed to the repository;
- reference secrets only through an env var or the agent's secret-input mechanism, never as a literal value.

For `claude-code`, an entry with a claude.ai connector SHALL list connecting it on claude.ai before the local command. A `claude-ai-only` entry SHALL render only the claude.ai step and state that other agents are unsupported. An entry with `installable: false` SHALL render only its manual setup steps.

#### Scenario: API-key provider on Codex
- **WHEN** the Buffer template is rendered for `codex`
- **THEN** it SHALL configure the bearer token through `bearer_token_env_var = "BUFFER_API_KEY"` and SHALL NOT contain any literal key

#### Scenario: Connector-first on Claude Code
- **WHEN** the Canva template is rendered for `claude-code`
- **THEN** its first step SHALL be connecting Canva at claude.ai's connectors page, followed by the `claude mcp add --transport http --scope user` alternative

#### Scenario: Self-hosted official server
- **WHEN** the X template is rendered for any agent
- **THEN** it SHALL contain only the manual setup steps, with no install command

### Requirement: Integration Lookup Tool on Every Host
The VS Code extension and the MCP server SHALL both expose `list_open_design_integrations` with the same inputs (`capability`, `integration`, `platform`, `agent`, all optional) and the same output shape.

With no filters, the tool SHALL return a compact catalog of entries. With filters, it SHALL return:
- the resolved providers in priority order;
- each provider's caveats and tool-name hints;
- the install template for the agent;
- the consent rules.

The VS Code host SHALL treat the agent as `vscode`. The MCP server SHALL infer the agent from the client name sent during the MCP handshake, falling back to `generic`. An explicit `agent` input SHALL override the inferred value.

The tool SHALL NOT write files, run commands or contact any third-party service.

#### Scenario: Same answer on both hosts
- **WHEN** the tool is called with `integration: "canva"` and `agent: "cursor"` on the VS Code extension and on the MCP server
- **THEN** both SHALL return the same providers, hints and Cursor install template

#### Scenario: Agent inferred from the MCP client
- **WHEN** the MCP server's client identified itself as Codex during the handshake and the tool is called without `agent`
- **THEN** the returned install template SHALL be the Codex template

#### Scenario: Unknown client
- **WHEN** the MCP client's name is not recognized and no `agent` is given
- **THEN** the tool SHALL return the generic template

### Requirement: Shared Integration Instruction Block
The overview instructions on every host SHALL include one shared block. Before handing a step to another service, the agent SHALL:
1. call `list_open_design_integrations` for that capability;
2. check its own tools, including deferred or on-demand tools it can search for, for a match;
3. if one is present, use it, referring to third-party tools by their server-defined names;
4. otherwise, offer to set up the first provider at most once per conversation, and only when a workflow step needs it;
5. wait for an explicit yes, then guide sign-in and any reload, and confirm by listing tools;
6. if the user declines or setup fails, continue with the workflow's existing manual path.

This applies to the VS Code chat instructions, the Claude Code overview skill, and the Codex and CLI copies generated from it.

#### Scenario: Block present on every host
- **WHEN** the generated Claude Code, Codex and CLI overview skills and the VS Code instructions are built
- **THEN** each SHALL contain the integration block

#### Scenario: Missing integration falls back
- **WHEN** a workflow step needs `design.import`, no matching tool is installed, and the user declines setup
- **THEN** the instructions SHALL direct the agent to continue with the manual path rather than stop

### Requirement: Consent-First Installation
The instructions and the tool output SHALL require that:
- a server is installed only after the user's explicit yes in the current conversation, at user scope;
- the agent never asks for an API key in chat, never writes a key into any file, and asks the user to set the env var or secret input themselves;
- third-party tools are never pre-approved, so no generated skill lists them in `allowed-tools`;
- actions that publish, send or post on the user's account still ask first.

#### Scenario: No silent install
- **WHEN** the tool output and the overview block are inspected
- **THEN** both SHALL state that installation needs an explicit yes and SHALL NOT instruct the agent to install without it

#### Scenario: No pre-approval of third-party tools
- **WHEN** the Claude Code skills are generated
- **THEN** no `allowed-tools` frontmatter SHALL name a tool from a registry entry

### Requirement: Integrations Stay Optional
Every existing tool and workflow SHALL work with no third-party server installed. Our code SHALL make no network calls to registry servers.

#### Scenario: No integrations installed
- **WHEN** a user with no third-party MCP servers runs any existing workflow
- **THEN** it SHALL complete through its existing path, with at most one offer to set up an integration

