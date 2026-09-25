## Why

The project now spans four hosts (VS Code, Claude Code, Codex, CLI) and a growing feature set: generation, design systems, remix, preview and editing, Figma, promote-to-app, social posts, video, and image and deck export. Its documentation is five package READMEs (~570 lines) plus one `docs/codex.md`. The READMEs mix landing-page pitch with how-to and reference material, so facts are duplicated and already drifting (tool arguments, settings, CLI flags). Troubleshooting, a tool reference, the content overlay and the internal social pipeline aren't documented anywhere. Users need task-oriented help they can find from inside each product, and contributors need the architecture and content-sync story written down.

## What Changes

- **A structured `docs/` tree** of plain Markdown, English only, rendered on GitHub and laid out so a static-site generator can adopt it later without moving files:
  - `docs/README.md`: index by audience.
  - `getting-started/`: `vscode`, `claude-code`, `codex` (the existing `docs/codex.md` moves here, with a stub left at the old path), `cli`.
  - `guides/`: `generate-a-design`, `design-systems`, `remix-and-gallery`, `social-posts`, `youtube-video`, `export-images`, `export-decks`, `preview-comments-edit`, `figma`, `promote-to-app-code`.
  - `reference/`: `tools`, `prompts-and-commands`, `cli`, `settings-and-env`, `artifact-manifest`.
  - `troubleshooting.md`, `automation/social-pipeline.md`.
  - `contributing/`: `architecture`, `content-sync`, `adding-a-skill-or-prompt`, `upstream-ports`, `releasing`.
- **One source of truth.** The root and package READMEs shrink to landing pages (pitch, install, quick start, screenshots) and link into `docs/`. Tool arguments, settings, env vars and CLI flags are documented only in `reference/`. READMEs published to the Marketplace or npm use absolute GitHub URLs.
- **Host-neutral guides.** One page per task, with short per-host callouts ("In VS Code", "In Claude Code / Codex", "From the CLI") instead of one copy per host.
- **Docs drift check (`scripts/check-docs.mjs`, wired into `npm run lint`):**
  - every tool in `packages/vscode/package.json` `languageModelTools` (and every MCP tool) appears in `reference/tools.md`, with each of its input properties;
  - every `openDesign.*` setting and every `OPEN_DESIGN_*` env var read by the code appears in `reference/settings-and-env.md`;
  - every CLI command and option appears in `reference/cli.md`;
  - every VS Code command appears in `reference/prompts-and-commands.md`;
  - every relative link and heading anchor in `docs/**` and the READMEs resolves.
- **In-product help entry points:**
  - **VS Code:** a "Get started with Open Design" walkthrough (`contributes.walkthroughs`) whose steps open the relevant guides, plus an "Open Design: Open Docs" command.
  - **Claude Code and Codex:** the overview `open-design` skill ends with links to the guides and troubleshooting.
  - **CLI:** `--help` output ends with the docs URL.
- Out of scope: a docs site or hosting, translations, versioned docs, and API docs generated from TypeScript.

## Capabilities

### New Capabilities
- `documentation`: the `docs/` structure and audiences, the single-source-of-truth rule between READMEs and docs, the drift check, and the in-product help entry points (VS Code walkthrough and command, skill links, CLI help).

### Modified Capabilities
<!-- None: the entry points are additive, and no existing requirement changes. -->

## Impact

- **New:** `docs/**` (~30 pages), `scripts/check-docs.mjs`.
- **Changed:**
  - `README.md` and `packages/{vscode,mcp-server,cli,content}/README.md` slim down;
  - `docs/codex.md` becomes a stub pointing to `docs/getting-started/codex.md`;
  - root `package.json` `lint` runs the docs check.
- **packages/vscode:**
  - `contributes.walkthroughs` plus step media (`media/walkthrough/*.md`);
  - the `openDesign.openDocs` command;
  - a small command handler.
- **packages/claude-plugin:** the overview skill gains a "Help" section, regenerated into Codex and the CLI assets by the existing generators.
- **packages/cli:** the help epilogue.
- **CI:** no new job; the existing `npm run lint` step covers the docs check.
