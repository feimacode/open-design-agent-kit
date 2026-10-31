## 1. Format check

- [x] 1.1 Confirm the `~/.agents/plugins/marketplace.json` entry fields (OpenAI's Codex plugin build docs, 2026-10-31); written into design.md decision 4
- [x] 1.2 Confirm the `extensions.com.openai.interface` fields (displayName, shortDescription, longDescription, developerName, category, capabilities, websiteURL, defaultPrompt, brandColor, composerIcon, logo)

## 2. Package

- [x] 2.1 Move the server bundling step out of `packages/desktop-extension/scripts/build-mcpb.ts` into a shared script; the `.mcpb` build still passes `scripts/test-mcpb.mjs`
- [x] 2.2 `packages/chatgpt-plugin/scripts/build-chatgpt-plugin.ts`: `plugin.json` from a template plus the server version, `skills/` from the Codex generator's output, `mcp.json` (stdio, `node ${PLUGIN_ROOT}/server/out/index.js`, `OPEN_DESIGN_LAUNCHER=chatgpt-plugin`), `server/`, icon; write `open-design-chatgpt-plugin-<version>.zip`
- [x] 2.3 Drift check: the smoke test compares the zip's `skills/` with `.agents/skills/` byte for byte; `npm run lint` checks the templates (`check-plugin-template.mjs`)
- [x] 2.4 Smoke test script: unzip into a temp folder outside the checkout, start the server from `mcp.json` with `${PLUGIN_ROOT}` replaced, complete an MCP handshake and `tools/list`

## 3. Server

- [x] 3.1 `env.ts`: accept `chatgpt-plugin`; `launcherHost()`; unit tests
- [x] 3.2 The folderless managed workspace and first-run welcome apply under `chatgpt-plugin`; unit tests
- [x] 3.3 Claude-only handoffs are already gated on a Claude client name (`isClaudeClient`), which ChatGPT's and Codex's clients don't match; unit test pins that

## 4. CLI

- [x] 4.1 `install chatgpt [--from <zip>]`: download the release zip that matches the CLI version (or use `--from`), verify its checksum, unpack it into `~/.codex/plugins/open-design/`, merge the marketplace entry, print the paths and next steps
- [x] 4.2 Upgrade: replace the folder's contents (unpack beside it, swap); re-running the same version changes nothing
- [x] 4.3 Malformed `marketplace.json`: refuse, print the entry; other entries are always kept
- [x] 4.4 `uninstall chatgpt`: remove our entry and folders only
- [x] 4.5 Unit tests for 4.1–4.4 with a temp home folder

## 5. Release and docs

- [x] 5.1 `release.yml`: build, smoke-test, checksum, attach the zip
- [x] 5.2 `docs/getting-started/chatgpt-desktop.md`; README install table; `docs/reference/cli.md`

## 6. Verification (needs Iven's ChatGPT account)

- [ ] 6.1 macOS: `install chatgpt`, restart, turn on in Plugins → Personal, ask in Work for a poster; the design lands in `~/Documents/Open Design`
- [ ] 6.2 Whether the local marketplace needs `.codex-plugin/plugin.json` too
- [ ] 6.3 Windows: the same flow
- [ ] 6.4 Whether the ChatGPT desktop app gives plugins a Node of its own; if so, use it and drop the Node requirement from the guide
- [ ] 6.5 Codex tab in the same app picks up the plugin
- [ ] 6.6 Record which plan was used (Free, Go, Plus) and whether Work was available
