## Why

Since 9 July 2026, ChatGPT has plugins. A plugin bundles `skills/<name>/SKILL.md` with an MCP server and is shared between ChatGPT and Codex. A plugin whose server runs over stdio is "Desktop only": it installs and runs in the ChatGPT desktop app (macOS and Windows), in the Work tab and the Codex tab. Anyone can install one from a local marketplace file, `~/.agents/plugins/marketplace.json`. Listing it in the public directory is limited to partners OpenAI has approved.

The kit already ships nearly everything such a plugin needs. `packages/codex` generates 41 skills in `.agents/skills/`. `packages/desktop-extension` bundles the server and its content into one folder that runs on a plain `node`. ChatGPT reaches far more of our maker personas than Claude does. Research: `/mnt/project-files/chatgpt-research/chatgpt-support.md` (2026-10-31).

## What Changes

- **A ChatGPT plugin package.** A new `packages/chatgpt-plugin` builds `open-design-chatgpt-plugin-<version>.zip`, containing:
  - a root `plugin.json` in the portable format (`name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`), with `extensions.com.openai.interface` for the directory card and `extensions.com.openai.onboardingSkill` pointing at the overview skill;
  - `skills/`, generated from the same curated entries and overview skill as `.agents/skills/` (including the `agents/openai.yaml` sidecars);
  - `mcp.json` with one stdio server, `node ${PLUGIN_ROOT}/server/out/index.js`, and the env `OPEN_DESIGN_LAUNCHER=chatgpt-plugin`;
  - `server/`, the bundled server and content from the desktop-extension build, so nothing is downloaded at first start (OpenAI asks plugins to package the server and its dependencies).
- **An install command.** `npx @feimacode/open-design-agent-kit install chatgpt` unpacks the plugin into `~/.codex/plugins/open-design/` (OpenAI's personal pattern; a marketplace entry's `source.path` must stay inside the home folder), merges an `open-design` entry into `~/.agents/plugins/marketplace.json` (creating the file if needed and keeping every other entry), and tells the user to restart ChatGPT and turn on the plugin in Plugins → Personal. `uninstall chatgpt` removes our entry and the folder. This is its own command, not `init --tools chatgpt`, because `init` must never write outside the target path.
- **The server knows it runs in ChatGPT.** `OPEN_DESIGN_LAUNCHER=chatgpt-plugin` turns on the same folderless behaviour as the Claude plugin: the managed `~/Documents/Open Design` folder when no workspace or roots are given, plus the first-run welcome. Plain-language replies and confirmation wording don't assume Claude. For example, "Claude Design" handoffs are offered only to Claude hosts.
- **Release.** `release.yml` builds the zip, smoke-tests it (unzip outside the checkout, run the MCP handshake from `mcp.json`), and attaches it with a checksum, next to the `.mcpb`.
- **Docs.** A new `docs/getting-started/chatgpt-desktop.md` covers the install command, turning the plugin on, a first prompt, the Node requirement and plan notes. README and `docs/reference/cli.md` are updated.

Not in this change:
- In-chat preview views in ChatGPT (`chatgpt-mcp-apps-compat`).
- ChatGPT web, which needs a hosted server (`add-remote-mcp-server`).
- Public directory submission. That needs OpenAI partner approval and is a manual step once a partner contact exists.

## Capabilities

### New Capabilities
- `chatgpt-plugin`: the ChatGPT desktop plugin package, how it's installed and released, and how the server behaves when ChatGPT launches it.

### Modified Capabilities
None. `init` and the Codex setup are unchanged.

## Impact

- New `packages/chatgpt-plugin` (build script, manifest template, drift check).
- `packages/desktop-extension`: its server bundling step is shared, not copied.
- `packages/cli`: `install chatgpt` and `uninstall chatgpt`, with unit tests.
- `packages/mcp-server/src/env.ts`: the `chatgpt-plugin` launcher value; the folderless and welcome checks accept it; host-specific handoff text is gated.
- `.github/workflows/release.yml`: build, smoke-test and attach the zip.
- Docs: new ChatGPT desktop guide, README, CLI reference.
