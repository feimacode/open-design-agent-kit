## Why

Both Figma directions are still manual. Pulling a frame into code needs a Figma personal access token pasted into settings. Pushing a design into Figma ("Export → Figma") needs the user to install a developer plugin in Figma desktop, copy a JSON capture and paste it into the plugin. That push path also only exists in VS Code.

Figma's official MCP server, now in the integration registry, removes both. The server was connected and tested on 2026-10-10:
- **Push:** our existing "OD Figma Import" builder ran unmodified through `use_figma`. Fonts, frames, text, corners, shadows and image fills all built correctly, and node ids came back. `upload_assets` placed an uploaded PNG on a target layer.
- **Pull:** `get_design_context` returns reference code, asset URLs and a screenshot, which is richer than our token-based structural summary.

## What Changes

- **Connector-first pull.** `pull_open_design_figma_frame` no longer requires a token. Its instructions:
  - look up Figma with `list_open_design_integrations`;
  - when Figma is connected, load Figma's `figma-design-to-code` guidance, then use `get_design_context`, `get_variable_defs` and `get_screenshot` (fileKey and nodeId parsed from the link);
  - otherwise, use the token path as today (the summary is included when a token is configured);
  - otherwise, offer Figma setup once, or explain the token option.
- **New `push_open_design_artifact_to_figma` tool, on both hosts.** It renders the artifact in the headless browser and captures its layers with the same capture code the preview uses. Then it:
  - extracts images into files;
  - splits the capture into ready-to-run `use_figma` code parts (each well under the 50,000-character limit, later parts finding their parent by a marker name);
  - writes everything under `exports/figma/`;
  - returns instructions: look up Figma; ask whether to add to an existing file (a link) or create a new one (`whoami` → `create_new_file`); load `figma-use`; run each part verbatim; upload images with `upload_assets` to the returned node ids; run the clean-up part; verify with `get_screenshot`; share the link.
  
  The plugin path stays as the fallback when Figma isn't connected.
- **"Export → Figma" in VS Code** keeps capturing from the live preview. Its notification gains a first choice that hands off to the agent with the new tool, ahead of "Copy JSON" and "Show Import Plugin".
- **Shared capture code.** The DOM capture moves from the webview into core as one self-contained, DOM-only function. It's imported by the webview and injected into the headless browser, so both produce the same IR.
- **Connector builder.** A core copy of the plugin's builder logic, extended with marker names, parent lookup across parts, image placeholders and returned node ids. The vendored plugin stays unchanged for the manual path.
- **C5 remainder: generated integrations docs.** The integration tables in `docs/guides/integrations.md` and a new README section are generated from the registry and drift-checked by the docs check.
- **Registry:** the Figma caveats record the tested behaviour, the required guidance (`figma-use`, `figma-design-to-code`), the 50k code limit and the absence of `generate_figma_design`.

## Capabilities

### New Capabilities
- `figma-integration`: connector-first pull, connector push (capture, images, parts, the target-file choice, verification), the plugin and token fallbacks, and the shared capture code.

### Modified Capabilities
- `integration-registry`: integration docs tables generated from the registry and drift-checked.

## Impact

- `packages/core`:
  - new `figma/` modules: the capture function (moved from the webview), the connector builder and part splitter, and push and pull instructions;
  - `figmaPull.ts` instructions become connector-aware;
  - tests.
- `packages/vscode`:
  - the webview imports the capture from core;
  - the push notification gains the agent hand-off;
  - a new tool registration and `package.json` schema;
  - the pull tool works without a token.
- `packages/mcp-server`: the new push tool; the pull tool works without a token.
- `packages/content/local/integrations.json`: the Figma caveats.
- Docs and scripts: a generator and drift check for the integration tables; `docs/guides/figma.md`, `docs/reference/tools.md`, `docs/guides/integrations.md` and `README.md`.
- No new dependencies. Our code never calls Figma's servers itself. The headless browser is the one export already uses.
