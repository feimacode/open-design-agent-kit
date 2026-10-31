## ADDED Requirements

### Requirement: ChatGPT Plugin Package
Each release SHALL build `open-design-chatgpt-plugin-<version>.zip` with a root `plugin.json` in OpenAI's portable format (`name` `open-design`, `version` equal to the MCP server's), `skills/`, `mcp.json` and a bundled `server/`.

#### Scenario: Manifest version
- **WHEN** release 0.4.0 is built
- **THEN** the zip's `plugin.json` SHALL have `name` `open-design` and `version` `0.4.0`

### Requirement: Bundled Stdio Server
The zip's `mcp.json` SHALL declare one stdio server started as `node ${PLUGIN_ROOT}/server/out/index.js` with `OPEN_DESIGN_LAUNCHER=chatgpt-plugin`, and `server/` SHALL start without network access or installing packages.

#### Scenario: Server starts from the unpacked zip
- **WHEN** the zip is unpacked outside the repository and the `mcp.json` command is run with `${PLUGIN_ROOT}` set to that folder
- **THEN** the server SHALL complete an MCP handshake and list its tools without downloading anything

### Requirement: Plugin Skills Match Codex
Every file under the zip's `skills/` SHALL equal the file at the same path under the repo's generated `.agents/skills/`, and the release smoke test SHALL fail when they differ.

#### Scenario: Skills match Codex
- **WHEN** the release is built
- **THEN** the zip's `skills/` tree SHALL equal `.agents/skills/`

### Requirement: ChatGPT Install Command
The CLI SHALL provide `install chatgpt`, which unpacks the plugin zip for its own version into `~/.codex/plugins/open-design/`, points an `open-design` entry in `~/.agents/plugins/marketplace.json` at it (`source.path` `./.codex/plugins/open-design`), and prints every path it wrote plus the next steps (restart ChatGPT, turn on the plugin).

#### Scenario: First install
- **WHEN** a user with no `~/.agents/plugins/marketplace.json` runs `install chatgpt`
- **THEN** the file SHALL be created with one `open-design` entry, and the plugin folder SHALL exist

#### Scenario: Upgrade
- **WHEN** version 0.4.0 is installed and the user runs the 0.5.0 CLI's `install chatgpt`
- **THEN** `~/.codex/plugins/open-design/plugin.json` SHALL say 0.5.0, files only 0.4.0 had SHALL be gone, and the entry SHALL be unchanged

### Requirement: Safe Marketplace Merge
`install chatgpt` SHALL keep every other entry in the marketplace file, leave it unchanged when nothing would change, and refuse a malformed file without changing it, printing the entry to add instead. `uninstall chatgpt` SHALL remove only our entry and folders.

#### Scenario: Other plugins kept
- **WHEN** the marketplace file already lists another plugin
- **THEN** after `install chatgpt` that entry SHALL be unchanged

#### Scenario: Malformed file
- **WHEN** the marketplace file isn't valid JSON
- **THEN** the command SHALL leave it unchanged and print the `open-design` entry

### Requirement: ChatGPT Launcher Behaviour
When `OPEN_DESIGN_LAUNCHER` is `chatgpt-plugin`, the server SHALL treat itself as plugin-launched, so it uses the managed designs folder when no workspace or roots are given and shows the first-run welcome. It SHALL leave Claude-only handoffs (Claude Design systems, Claude artifacts, Cowork) out of tool replies.

#### Scenario: No folder given
- **WHEN** ChatGPT starts the plugin's server with no workspace and no roots, and the agent registers a design
- **THEN** the design SHALL be saved under the managed `Open Design` folder

#### Scenario: No Claude handoff
- **WHEN** a tool reply under `chatgpt-plugin` would offer a Claude Design system handoff under `claude-plugin`
- **THEN** the reply SHALL leave that offer out
