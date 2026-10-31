## 1. Probe

- [x] 1.1 `scripts/probe-mcp-apps-host.mjs`: stdio server with a UI tool, an app-only tool and a sized-payload tool; logs capabilities, `clientInfo`, tool calls and view messages to a file
- [x] 1.2 Package it as a local ChatGPT plugin (`scripts/probe-mcp-apps-host/build.mjs --install`); a README with the steps for Iven; checked end to end in ext-apps' reference host
- [ ] 1.3 Iven runs it in ChatGPT desktop (Work and Codex tabs); record the results in design.md
- [ ] 1.4 Decide the scope: stop here if views don't render for local plugins

## 2. Detection and tools

- [ ] 2.1 `clientSupportsMcpApps`: accept the `chatgpt-plugin` launcher when the capability is missing (only if 1.3 shows views render); unit tests
- [x] 2.2 App-only tools already carry `_meta.ui.visibility: ["app"]` (appOnlyToolMeta); if 1.3 shows ChatGPT still offers them to the model, add "called by the preview" to their descriptions
- [x] 2.3 `openai/toolInvocation/invoking` and `invoked` text on render tools; unit test of the `_meta`
- [ ] 2.4 Payload limit for ChatGPT from 1.3 in the preview state fallback

## 3. Views

- [x] 3.1 Fullscreen button when the host lists a fullscreen display mode (spec) or `window.openai.requestDisplayMode` exists; hidden otherwise
- [ ] 3.2 Keep the selected page or slide with `setWidgetState` where it exists (the preview keeps no such selection today; revisit if 1.3 shows re-renders lose state)
- [ ] 3.3 Claude Desktop regression run of the preview, questions and pickers

## 4. Docs and verification

- [x] 4.1 "In-chat previews" note in `docs/getting-started/chatgpt-desktop.md` (what's known; update after 1.3)
- [ ] 4.2 ChatGPT desktop run: pick an example, answer questions, see the preview update after an edit
