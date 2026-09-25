## 1. Docs check (built first, so every later page is checked as it lands)

- [x] 1.1 Write `scripts/check-docs.mjs` (no dependencies): collect tools and their input properties (VS Code `languageModelTools`, plus MCP tool names from `packages/mcp-server/src/index.ts`), `openDesign.*` settings, VS Code command ids, `OPEN_DESIGN_*` string literals in `packages/*/src` (non-test), and CLI commands and options from `packages/cli/src/index.ts`
- [x] 1.2 Implement the reference assertions (tools/properties, settings/env, commands, CLI commands/options) and the link checks (relative files, `#fragment` against GitHub heading slugs, absolute `blob/main/` repo links), reporting every problem at once
- [x] 1.3 Unit tests (`node --test`) for the slugger, section extraction and link parsing against fixtures; wire `check-docs` into root `npm run lint` (links-only mode until group 3 lands, then full)

## 2. Skeleton and index

- [x] 2.1 Create the tree: `docs/README.md` (index by audience) and section READMEs for `getting-started/`, `guides/`, `reference/` and `contributing/`
- [x] 2.2 Move `docs/codex.md` → `docs/getting-started/codex.md` (updated for the current skills, including the social-post skill) and leave a stub at the old path

## 3. Reference (written from code)

- [x] 3.1 `reference/tools.md`: one `### <tool>` section per tool (all 12 VS Code tools; note MCP availability and that `share_open_design_artifact_to_community` is VS Code-only if so), each with an argument table, results, error codes and an example
- [x] 3.2 `reference/settings-and-env.md`: every `openDesign.*` setting and `OPEN_DESIGN_*` env var (defaults from code), grouped by host
- [x] 3.3 `reference/cli.md`: `init`, `export` and `render-video`, with every option, exit codes and examples (run each example once to confirm the output)
- [x] 3.4 `reference/prompts-and-commands.md`: VS Code commands; prompt files (generate, list-skills, custom design system, social post, the 27 curated `/od-…` commands); Claude Code skills; Codex skills; MCP prompts; and which are model-invocable versus explicit-only
- [x] 3.5 `reference/artifact-manifest.md`: `.artifact.json` fields, kinds, renderers, the `exports` list per kind, `metadata.exports`, and the `exports/` folder layout
- [x] 3.6 Switch `check-docs` to full mode and fix everything it reports

## 4. Getting started

- [x] 4.1 `getting-started/vscode.md`: install, first generation, where files land, the preview, and a "Next" link
- [x] 4.2 `getting-started/claude-code.md`: plugin marketplace or `init --tools claude`, MCP registration, first prompt, skills
- [x] 4.3 `getting-started/codex.md` (from 2.2) and `getting-started/cli.md` (`init`, and `export`/`render-video` for scripts)

## 5. Guides

- [x] 5.1 `generate-a-design.md` (the skills catalog, `od:<mode>:<name>` ids, brief → author → register, collections) and `design-systems.md` (browse, the active one, custom from a brief, import)
- [x] 5.2 `remix-and-gallery.md` (gallery tree and grid, community designs, remix) and `preview-comments-edit.md` (view, comment and edit modes, comments → chat)
- [x] 5.3 `figma.md` (token, pull frame, the capture plugin) and `promote-to-app-code.md`
- [x] 5.4 `social-posts.md` (platform table, carousels and `data-od-card`, `maxBytes`, the emoji/SVG rule, the explicit and implicit entry points per host) and `youtube-video.md` (HyperFrames override, FFmpeg, sandbox hangs, `render-video`)
- [x] 5.5 `export-images.md` (sizing rules, selector, scale, byte budget) and `export-decks.md` (PPTX/PDF, deck detection, `slides`, page PDF, limits)

## 6. Troubleshooting, automation, contributing

- [x] 6.1 `troubleshooting.md`: one `##` per symptom (no browser found, emoji boxes, fonts missing, not-a-deck, no-slides, blank slide, over budget, FFmpeg missing, render hangs, MCP server not connecting, skill not found, Figma token)
- [x] 6.2 `automation/social-pipeline.md`: the internal X and YouTube recipe (agent creates → CLI export/render → files for posting) and CI setup (headless browser via `@puppeteer/browsers`, FFmpeg, `OPEN_DESIGN_BROWSER_PATH`)
- [x] 6.3 `contributing/architecture.md` (packages and data flow, with Mermaid diagrams) and `contributing/content-sync.md` (upstream pin, sync, local overlay, curation, mirrors, generated prompts and skills, drift checks)
- [x] 6.4 `contributing/adding-a-skill-or-prompt.md`, `contributing/upstream-ports.md` (summarize and link `vendored/SOURCE.md`) and `contributing/releasing.md` (version bump, release workflow, npm/Marketplace, a docs line on the PR checklist)

## 7. READMEs become landing pages

- [x] 7.1 Root `README.md`: keep the pitch, ways to use it, screenshots and provenance; replace "Core workflow", development and release detail with a Documentation link list
- [x] 7.2 `packages/vscode/README.md`, `packages/mcp-server/README.md`, `packages/cli/README.md`, `packages/content/README.md`: install, short quick start and tool names; move tables into `reference/`; absolute GitHub docs links

## 8. In-product entry points

- [x] 8.1 VS Code: `contributes.walkthroughs` "Get started with Open Design" (5 steps, with bundled `media/walkthrough/*.md` using absolute docs links) and the `openDesign.openDocs` command (`vscode.env.openExternal`); list the command in `reference/prompts-and-commands.md`
- [x] 8.2 Overview skill: add a Help section with absolute docs links; regenerate Codex and CLI copies (`generate-codex-skills`, `copy-skill-content`)
- [x] 8.3 CLI: `addHelpText('after', …)` with the CLI reference URL, plus the troubleshooting URL on export failures; unit-test the help text

## 9. Verify

- [x] 9.1 Run `npm run lint` (including the docs check), typecheck and unit tests across the workspace; build the VS Code bundle
- [x] 9.2 Read-through pass: from `docs/README.md`, reach every page within two clicks, and spot-check that each guide's commands and tool calls match current behavior (run the CLI examples)
