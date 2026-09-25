## 1. Content overlay and local curation

- [x] 1.1 Create `packages/content/local/` with `skills/`, `curated.json` (`["card-twitter","poster-hero","social-carousel"]`) and `prompts/`
- [x] 1.2 Add `apply-local-overlay.mjs` (copies `local/skills/*` → `assets/open-design/skills/` and `local/prompts/*` → `assets/open-design/prompts/`, fails on id collisions with upstream skills or templates) and call it from the end of `sync-open-design-content.mjs`, and record a `localOverlay` count in `MANIFEST.json`
- [x] 1.3 Extend `check-content-sync.mjs` to verify every overlay file is present in the assets tree and identical to its source
- [x] 1.4 Update `curatedEntries.mjs` to also treat ids in `local/curated.json` as curated, and fail on unknown ids
- [x] 1.5 Unit-test the overlay merge (collision error) and the curation union (unknown-id error)

## 2. YouTube thumbnail skill

- [x] 2.1 Author `local/skills/social-youtube-thumbnail/SKILL.md` in the upstream frontmatter shape (`aspect_hint: "1280×720 (16:9)"`, `od.mode: prototype`, `featured`, `example_prompt`, tags) with a body covering legibility at small sizes, keeping the timestamp area clear, and the 2 MB limit
- [x] 2.2 Add an example artifact for it, if the examples pipeline supports overlay examples; otherwise note this as a follow-up — **follow-up**: the overlay only carries `skills/` and `prompts/` (examples come from upstream `plugins/_official/examples/`), so no remixable example ships for now
- [x] 2.3 Verify `list_open_design_skills` returns `od:prototype:social-youtube-thumbnail` for the query "youtube thumbnail" (contentIndex test)

## 3. Daemon-reference overrides in brief composition

- [x] 3.1 Add a `hostOverrides` input to `composeInstructions`, appended after the skill body under a heading saying it takes precedence
- [x] 3.2 Write the `hyperframes` override (init/lint or check/render via `npx hyperframes`, check `ffmpeg -version` first, output to `<artifact-dir>/exports/<name>.mp4`, 1920×1080 at 30 fps default, ignore `$OD_BIN`/daemon steps, `--help` fallback if a flag is rejected)
- [x] 3.3 Add the generic daemon-reference detector (`$OD_BIN`, `OD daemon`, `od media`) that appends the "unavailable in this host" notice when a skill has no override
- [x] 3.4 Wire the overrides through `prepare_open_design_brief` in both the VS Code and MCP hosts
- [x] 3.5 Unit tests: override present for `hyperframes`; notice present for `image-poster`; neither for `card-twitter`; vendored text unchanged

## 4. Raster export core module

- [x] 4.1 Add `puppeteer-core` to `packages/core` as a dynamically imported dependency and confirm it is excluded from activation-time bundles
- [x] 4.2 Implement browser discovery (`OPEN_DESIGN_BROWSER_PATH` / explicit path → per-OS well-known Chrome, Edge and Chromium paths → Playwright and Puppeteer caches → structured not-found error listing the searched paths)
- [x] 4.3 Implement the `aspect_hint` parser (first `W×H`/`WxH` pair) and the size-resolution order (explicit → source skill hint → element box → 1080×1080), reporting the source used
- [x] 4.4 Implement capture: fresh temporary profile, viewport + `deviceScaleFactor`, load over `file://` (loopback static server when the entry uses ES modules), wait for fonts and network idle with a 15 s cap, collect failed-request warnings, full-viewport or per-selector screenshots, PNG/JPEG + quality
- [x] 4.5 Write outputs to `<artifact-dir>/exports/<basename>[-NN].<ext>` (overwrite), and update the manifest's `metadata.exports` (replace by path)
- [x] 4.6 Implement `maxBytes` auto-fit (JPEG quality 90 → 40, keep smallest, warning if unmet)
- [x] 4.7 Unit tests for the hint parser, size resolution, output naming and manifest update; an integration test that exports a fixture artifact when a browser is available (skipped otherwise)

## 5. Export tool in each host

- [x] 5.1 Add `exportArtifactTool.ts` in `packages/vscode/src/tools`, register it in `registerTools.ts`, and declare it in `package.json` `languageModelTools` with an input schema (`entryPath`, `format`, `quality`, `width`, `height`, `scale`, `selector`)
- [x] 5.2 Add a `openDesign.export.browserPath` setting that feeds browser discovery
- [x] 5.3 Add the `export_open_design_artifact` MCP tool in `packages/mcp-server/src/tools.ts`, and update the MCP tool-count test
- [x] 5.4 Mention the export step in the generated `open-design` agent skill text (claude-plugin / codex generators): after registering a social or poster artifact, export it

## 6. Social post prompt

- [x] 6.1 Write `packages/content/local/prompts/social-post.md` with the platform/format → size → skill table, the ask-if-unstated rule, the `data-od-card` marker rule for multi-card formats, and the generate → register → export → report flow
- [x] 6.2 Render it to `packages/vscode/prompts/local/open-design-social-post.prompt.md` and add it to `chatPromptFiles` (generated from the single source by `generate-featured-prompts.mjs` under a `./prompts/local/` prefix, not hand-maintained)
- [x] 6.3 Expose it as an MCP prompt and a Claude plugin command via the existing generators

## 7. CLI

- [x] 7.1 Add the `export <entryPath>` command to `packages/cli` (the options from the spec, workspace-root resolution, content-assets lookup for skill hints, non-zero exit on failure)
- [x] 7.2 Add the `render-video <compositionDir> --output <mp4>` passthrough to `npx hyperframes render` (prints the command, propagates the exit code)
- [x] 7.3 Unit-test argument parsing and workspace-root resolution

## 8. Sync, verify, document

- [x] 8.1 Run `npm run sync-content`; confirm curated prompts now exist for `card-twitter`, `poster-hero`, `social-carousel` and `social-youtube-thumbnail`, and that the parity check passes
- [x] 8.2 Run typecheck, lint and unit tests across the workspace
- [ ] 8.3 Manual check in VS Code: X single image (1600×900 PNG), Xiaohongshu 3-card (three 1080×1440 PNGs), YouTube thumbnail (1280×720 PNG under 2 MB) — the same three flows passed end to end through the MCP server (prompt → brief → register → export, same core code); a click-through in the VS Code UI is still to do
- [x] 8.4 Manual check via Claude Code/MCP: HyperFrames YouTube video renders to MP4 in `exports/` with no daemon
- [x] 8.5 Update the README(s) with the social post workflow, browser and FFmpeg prerequisites, and `OPEN_DESIGN_BROWSER_PATH`

## 9. Discoverability follow-up

- [x] 9.1 Make the Claude Code / Codex `open-design-social-post` skill model-invocable (no `disable-model-invocation`, no explicit-only `agents/openai.yaml`, trigger-oriented description); drift checks enforce it
- [x] 9.2 Replace the unreachable "follow the open-design-social-post flow" pointer: the overview skill names the skill to load; the VS Code instructions say to ask for the platform and mention the slash command
