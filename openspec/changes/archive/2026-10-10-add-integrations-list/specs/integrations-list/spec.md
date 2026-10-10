## ADDED Requirements

### Requirement: Three Integration Statuses
Every listed integration SHALL have exactly one status:
- `connected`: its tools are available;
- `installed`: configured but its tools aren't available;
- `not-installed`.

Statuses SHALL be shown as a coloured dot: green for connected, yellow for installed, grey for not installed. In VS Code, the status word SHALL also be shown in text. An integration that can't be installed on the current agent SHALL show as `not-installed`, with its manual setup as the next step.

#### Scenario: Tools present
- **WHEN** the agent's tools include ones matching Canva's hints
- **THEN** Canva SHALL be `connected`

#### Scenario: Configured without tools
- **WHEN** Notion is configured (in `claude mcp list`, `codex mcp list` or a VS Code MCP config file) but none of its tools are available
- **THEN** Notion SHALL be `installed`

### Requirement: Integrations Chat Command
An `open-design-integrations` prompt SHALL ship on every host: a skill in Claude Code and Codex, and a prompt file in VS Code. It SHALL direct the agent to:
1. call `list_open_design_integrations` with no filters;
2. check its own tools, including deferred ones;
3. when it has a shell, run `claude mcp list` or `codex mcp list` read-only to find installed-but-not-connected entries;
4. reply with the integrations grouped by purpose, each with its dot, what it does in Open Design and its next step, plus a legend.

It SHALL offer setup only for an integration the user names, following the integration consent rules. It SHALL NOT install anything from the list itself.

#### Scenario: Command available everywhere
- **WHEN** the Claude Code, Codex and CLI skills and the VS Code prompt files are generated
- **THEN** each SHALL include `open-design-integrations`

#### Scenario: No silent setup
- **WHEN** the command's instructions are read
- **THEN** they SHALL state that setup is offered only for an integration the user picks, after their yes

### Requirement: VS Code Integrations Panel
The VS Code extension SHALL contribute an "Integrations" view in the Open Design sidebar, listing the registry's integrations grouped by purpose, each with its status dot. Status SHALL be derived as follows:
- `connected` from `vscode.lm.tools` matching the entry's VS Code hints;
- `installed` from a server in the user's or workspace's MCP configuration matching the entry's URL or name, without matching tools.

The view SHALL refresh when shown, when the window regains focus, and from a Refresh action.

#### Scenario: Status from the tool list
- **WHEN** `vscode.lm.tools` contains `mcp_figma_get_design_context`
- **THEN** the Figma item SHALL show the connected dot

#### Scenario: Status from configuration
- **WHEN** the user's `mcp.json` has a server with URL `https://mcp.notion.com/mcp` and no Notion tools are listed
- **THEN** the Notion item SHALL show the installed dot

### Requirement: Integration Setup View
Selecting an integration in the panel SHALL open a view showing:
- its status, purpose, sign-in type, caveats and docs link;
- for installable entries, a button opening VS Code's native install page through a `vscode:mcp/install` link, and the equivalent `mcp.json` snippet with Copy and Open User MCP Configuration actions;
- its manual fallback.

For an API-key integration, both the link and the snippet SHALL use a password input reference, never a literal key. A connected integration SHALL also offer to use it in chat.

#### Scenario: API-key integration
- **WHEN** the Buffer setup view is opened
- **THEN** its install link and snippet SHALL contain an `inputs` entry with `password: true` and a `${input:…}` header, and no key value

#### Scenario: Manual-only integration
- **WHEN** the X setup view is opened
- **THEN** it SHALL show the manual setup steps and no install button
