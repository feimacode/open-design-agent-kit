## 1. Shared capture

- [x] 1.1 Move `captureFigmaIr` and its types to `packages/core/src/figma/captureIr.ts` as one self-contained, DOM-only function (all helpers nested, plain ES2020, no imports). The webview imports it by deep path; delete the webview copy. Confirm the preview capture is unchanged.
- [x] 1.2 `captureArtifactForFigma({ workspaceRoot, entryPath, executablePath })` in core: open the page with `openArtifactPage` at the artifact's format viewport or 1440×900, evaluate `(${captureFigmaIr.toString()})(document, meta)`, resolve assets, write the sidecar. Add a headless test on a fixture page (skipped when no browser is found, like the other browser tests).

## 2. Push parts

- [x] 2.1 Connector builder code string in core, derived from the plugin's logic, plus markers, parent lookup by marker, an image placeholder for `IMAGE_REF`, and returned ids. Add a parity test against the plugin code with a fake `figma` object.
- [x] 2.2 `buildFigmaPushParts(capture, { runId, maxChars })`: extract images, split by subtree under 30k characters, add the clean-up part, and syntax-check each part. Tests: small capture (one part plus clean-up), forced split, images mapped, every part within the limit.
- [x] 2.3 `prepareFigmaPush({ workspaceRoot, entryPath, refresh })`: capture or reuse the sidecar, write `exports/figma/` (parts, images, manifest), and compose push instructions (D4). Tests on the instructions: target choice before writes, verbatim rule, upload steps, plugin fallback, the more-than-8-parts warning.

## 3. Pull

- [x] 3.1 Extend `parseFigmaUrl` (make, board and branch links) and make `composePullFigmaInstructions` connector-first, with the summary optional. Tests: no-token instructions, node-id conversion, a link without a node.
- [x] 3.2 Both hosts' pull tools: no error without a token; the token summary is included when one is configured.

## 4. Hosts

- [x] 4.1 VS Code: register `push_open_design_artifact_to_figma` (`package.json` schema plus tool class). Add the "Push with Figma connection" choice to the preview notification.
- [x] 4.2 MCP server: the push tool plus tests. Update the pull tool's description.

## 5. Registry and docs

- [x] 5.1 Figma caveats in `integrations.json` (tested push, required guidance, 50k limit, no `generate_figma_design`). Add an optional `docs` object to entries, validated by the content guard. Re-apply the overlay and VS Code mirror, then run the checks.
- [x] 5.2 `scripts/generate-integrations-docs.mjs` with markers in `docs/guides/integrations.md` and `README.md`. Add a drift check in `check-docs.mjs` with a test.
- [x] 5.3 Update `docs/guides/figma.md` (connector first, token and plugin as fallbacks) and the `docs/reference/tools.md` entries. Run the docs check.

## 6. Verification

- [x] 6.1 Full typecheck, lint and unit tests.
- [x] 6.2 Manual, Claude Code (Figma connected): push a real artifact into the test file (user-approved target) and compare the screenshot; pull a frame without a token. (Done 2026-10-10. Push of the A3 poster with an image: 2 parts, image placed, screenshot checked. The first run found two issues, both fixed and re-verified: missing fonts fell back to Inter Regular (now Inter in the same style), and card designs were captured at page width (now at card size). Token-free pull of the pushed frame: pull tool → integration lookup → figma-design-to-code → get_design_context/get_variable_defs/get_screenshot → artifact registered.)
- [ ] 6.3 Manual, VS Code Copilot: "Export → Figma", then "Push with Figma connection".
