## Why

The agent that writes an artifact never sees it. Every tool result today is text: preflight findings come back as words, and even `shapeSheet: true` writes a PNG the agent can't look at unless its host happens to read image files (Copilot's agent doesn't). So composition problems that aren't measurable — a cramped hero, a lopsided grid, a chart that reads wrong, a slide that looks empty — ship unless the user spots them. Both hosts now accept images in tool results (VS Code `LanguageModelDataPart.image`, MCP `ImageContent`), and the export pipeline already renders the artifact in a headless browser, so letting the agent see its render is mostly wiring. This is also the base for the next backlog items (codebase diagrams, inbox-safe email, campaign kits), which all need the agent to check its own output.

Three gaps sit next to that. Preflight is only reachable through `export_open_design_artifact` with `checkOnly: true`, which is framed as a poster step, so agents only run it for posters. Decks are excluded from preflight entirely. And web pages are checked at a single viewport, so a layout that scrolls sideways on a phone passes.

## What Changes

- New tool `check_open_design_artifact` on every surface (VS Code tool, MCP server, Claude Code and Codex skills): loads a registered artifact in the export browser and returns **screenshots as image content** plus the existing preflight findings. It writes no files and doesn't change the manifest.
  - **Pages** (`html`, `mini-app`, `svg`): with a `data-od-card`, the card at its format size; otherwise the page at a desktop and a phone viewport (overridable), with findings tagged by viewport.
  - **Decks**: preflight per slide, findings tagged by slide number, and slides returned as one contact-sheet image.
  - Images are size-capped (long edge, count) so one check costs a bounded number of tokens.
- New check `horizontal-scroll`: a page wider than its viewport, reported with the widest element that causes it. It runs only in viewport checks, not in poster or card exports.
- Agent instructions on every surface: after creating or substantially editing an artifact, run the check, fix errors, and look at the screenshot before telling the user it's done, with at most two fix rounds. If no browser is available, skip the check and say so.
- CLI: `open-design-agent-kit check <entryPath>` prints the findings and, with `--screenshots <dir>`, writes the images (for CI and scripts).
- `export_open_design_artifact`'s `checkOnly` stays as is. The new tool reuses the same loading and preflight code.

## Capabilities

### New Capabilities
- `artifact-visual-check`: rendering an artifact for the agent to look at: the check tool, viewport and per-slide checks, the `horizontal-scroll` check, image size limits, how each host returns images, the CLI command, and the check-before-done instruction.

### Modified Capabilities
<!-- None. export-preflight and artifact-export requirements are unchanged; the new tool reuses their checks. -->

## Impact

- `packages/core`: new `export/checkArtifact.ts`, which reuses `exportArtifact`'s browser launch, page loading, `runPreflight`, and `captureDeck` slide navigation. It also reuses `composeShapeSheet`'s render-HTML-then-screenshot approach for contact sheets and downscaling. A new `horizontal-scroll` check goes in `poster/pageScripts.ts`. No new dependencies.
- `packages/vscode`: new `CheckArtifactTool` returning `LanguageModelDataPart.image` parts, a `languageModelTools` entry in `package.json`, and an instructions update.
- `packages/mcp-server`: tool handlers may return image content as well as text (today they return only a string). Adds the new tool definition and updates the tool-count test.
- `packages/claude-plugin`, `packages/cli` assets (Claude/Codex skills): instructions updated. `packages/cli`: new `check` command.
- `packages/vscode/instructions/open-design.instructions.md`, `packages/claude-plugin/skills/open-design/SKILL.md`: check-before-done loop.
- Token cost: about 2k tokens per image at the default cap and three images at most per call by default.
