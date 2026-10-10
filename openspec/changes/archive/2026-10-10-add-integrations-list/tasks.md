## 1. Registry

- [x] 1.1 Add `manualFallback` to every entry in `integrations.json` (D7). Make it required in the content guard and core parser, with tests. Re-apply the overlay and VS Code mirror.
- [x] 1.2 Core `integrations/status.ts`: `integrationGroup`, `matchesIntegrationTools`, `matchesConfiguredServer`, `integrationStatus`, `vscodeInstallLink`. Tests: look-alike tool names don't match, URL host/path matching, API-key link uses inputs with no literal key, manual and claude.ai-only entries give no link.
- [x] 1.3 Catalog mode: grouped entries with hints, installability for the agent, and the fallback. Lookups get a "Manual path" line. Update tests.

## 2. Chat command

- [x] 2.1 `packages/content/local/prompts/integrations.md` (`open-design-integrations`, model trigger for "what integrations/connectors do I have"), following D5.
- [x] 2.2 Regenerate the Claude, Codex and CLI skills and the VS Code prompt files. Run the skills and content checks. Add a test that the command exists on every host.

## 3. VS Code panel

- [x] 3.1 `package.json`: the `openDesign.integrationsView` view, the refresh and show commands, and title and item menus.
- [x] 3.2 `IntegrationsTreeProvider`: groups and items with dots and status words; status from `vscode.lm.tools` and the MCP config files (user, profiles, workspace, legacy setting; lenient JSONC). Refresh on visibility, focus and command.
- [x] 3.3 `IntegrationSetupPanel` webview (D6): install button (`vscode.env.openExternal` of the core link), snippet with Copy and Open User MCP Configuration, fallback, docs, Use in chat. Reuse the existing theme and nonce helpers.
- [x] 3.4 Unit tests for the config-file reader (JSONC, every location) with temp folders.

## 4. Docs and verification

- [x] 4.1 Docs: an "See what's connected" section in `docs/guides/integrations.md` (chat command, VS Code panel, the three dots) and the new command in `docs/reference/prompts-and-commands.md`. Run the docs check.
- [x] 4.2 Full typecheck, lint and unit tests.
- [x] 4.3 Manual, Claude Code: run `/open-design:open-design-integrations`; Canva and Figma 🟢, the others ⚪.
- [ ] 4.4 Manual, VS Code: the panel shows the dots; Notion's setup view install button opens VS Code's install page; the snippet copies.
