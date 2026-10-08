# Settings and environment variables

Nothing needs configuring for a first run. These change the defaults.

## VS Code settings

Set them in VS Code's Settings (search "Open Design") or in `settings.json`.

### openDesign.outputDirectory

Default: `.open-design`. The workspace-relative folder new artifacts are suggested under, e.g. `.open-design/<slug>/<slug>.html`. Custom design systems go in its `design-systems/` subfolder.

### openDesign.activeDesignSystemId

Default: empty (none). The workspace's active design system, applied by `prepare_open_design_brief` whenever no `designSystemId` is given. Usually set for you by **Open Design: Browse Design Systems**, the status bar item, [`set_active_design_system`](tools.md#set_active_design_system), or by generating with an explicit design system. See [Design systems](../guides/design-systems.md).

### openDesign.communityContentEnabled

Default: `true`. Show community-contributed designs from [awesome-open-design](https://github.com/feimacode/awesome-open-design) next to the built-in gallery. This content isn't reviewed by the extension's authors. It's fetched once on first activation, then again whenever you run **Open Design: Sync Community Designs**. See [Community designs](../guides/community-designs.md).

### openDesign.communityContentRef

Default: `v0.1.0`. The awesome-open-design tag to fetch. Change it, then run **Open Design: Sync Community Designs**.

### openDesign.export.browserPath

Default: empty (auto-detect). The Chrome, Edge or Chromium executable used by [`export_open_design_artifact`](tools.md#export_open_design_artifact). It takes precedence over [`OPEN_DESIGN_BROWSER_PATH`](#open_design_browser_path).

### openDesign.export.ffmpegPath

Default: empty (auto-detect). The `ffmpeg` executable used to [export animations](../guides/export-animations.md) as MP4, WebM or GIF. It takes precedence over [`OPEN_DESIGN_FFMPEG_PATH`](#open_design_ffmpeg_path).

### openDesign.share.badge

Default: `true`. Adds a small, closeable "Made with Open Design · Remix this" badge to pages you publish ([`publish_open_design_artifact`](tools.md#publish_open_design_artifact), export format `site`). It loads nothing from the internet and doesn't track viewers. Turn it off to never add it; one publish can still leave it out with `badge: false`. Standalone HTML files never get it unless asked. See [the badge](../guides/share-and-publish.md#the-made-with-open-design-badge).

## Environment variables

For the MCP server and the CLI, set these in the environment of the process that launches them, e.g. the `env` block of your agent's MCP config:

```json
{
  "mcpServers": {
    "open-design": {
      "command": "npx",
      "args": ["-y", "@feimacode/open-design-agent-kit-mcp"],
      "env": { "OPEN_DESIGN_FIGMA_TOKEN": "figd_…" }
    }
  }
}
```

### OPEN_DESIGN_WORKSPACE_ROOT

MCP server. Default: the server process's working directory, which Claude Code and Codex set to your project. It's the workspace artifacts are written to, and where `.open-design/config.json` (the active design system) is kept.

### OPEN_DESIGN_OUTPUT_DIR

MCP server. Default: `.open-design`. The MCP equivalent of [`openDesign.outputDirectory`](#opendesignoutputdirectory).

### OPEN_DESIGN_FIGMA_TOKEN

MCP server. A Figma personal access token (Figma → Settings → Personal access tokens), needed by [`pull_open_design_figma_frame`](tools.md#pull_open_design_figma_frame). In VS Code, use **Open Design: Set Figma Access Token** instead; it stores the token encrypted.

### OPEN_DESIGN_SHARE_BADGE

All hosts. `1`/`true` or `0`/`false`. Overrides the default for the footer badge on `standalone` and `site` exports and on publish bundles; a call's own `badge` argument (or the CLI's `--badge`/`--no-badge`) still wins. In VS Code it also overrides [`openDesign.share.badge`](#opendesignsharebadge).

### OPEN_DESIGN_FFMPEG_PATH

All hosts. The `ffmpeg` executable used to [export animations](../guides/export-animations.md). When unset, the exporter tries `ffmpeg` on `PATH`, then the usual install locations (Homebrew, `/usr/bin`, `/usr/local/bin`, `~/.local/bin`, WinGet), then Playwright's cache. Playwright's bundled ffmpeg only makes WebM (VP8), so a full build is needed for MP4 and GIF. Each one found is checked for the encoder the format needs, and the first that has it is used. ffmpeg is never downloaded.

### OPEN_DESIGN_BROWSER_PATH

All hosts. The Chrome, Edge or Chromium executable used for export. When unset, the exporter searches in this order:

1. System installs: Google Chrome, Chromium and Microsoft Edge in their standard locations for Windows, macOS and Linux.
2. The Playwright browser cache (`~/.cache/ms-playwright`, or `PLAYWRIGHT_BROWSERS_PATH`).
3. The Puppeteer browser cache (`~/.cache/puppeteer`, or `PUPPETEER_CACHE_DIR`).
4. Snap-packaged Chromium, last, because it can't read hidden folders like `.open-design/`.

Nothing is ever downloaded. See [Troubleshooting](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found).

## Contributor-only variables

Read by the content sync script (`packages/content/scripts/sync-open-design-content.mjs`), not by any shipped package. See [Content sync](../contributing/content-sync.md).

| Variable | Meaning |
|---|---|
| `OPEN_DESIGN_SRC` | Sync from a local open-design checkout instead of cloning. |
| `OPEN_DESIGN_REPO` | Clone from a different repository URL. |
| `OPEN_DESIGN_REF` | Clone a different tag or branch than the pinned release. |
