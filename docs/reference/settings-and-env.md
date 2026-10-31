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

### openDesign.experimental.servedPreview

Default: `false`. Experimental. In the preview's View mode, load the design from a local server (bound to `127.0.0.1`, behind a random path that changes with each preview) instead of embedding its text. The design then behaves exactly as it would in a browser: tab switches and other inline click handlers, relative stylesheets, images, scripts and `fetch()` all work. Comment, Edit and Tweaks still show the embedded copy. In a remote window (WSL, SSH, Codespaces) VS Code forwards the port.

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

MCP server. Default: the first workspace folder the client reports through MCP roots (VS Code does), otherwise the server process's working directory, which Claude Code and Codex set to your project. Setting it overrides both. The agent can still pick a folder for one session with [`set_open_design_workspace`](tools.md#set_open_design_workspace), which Claude Desktop needs because it starts the server in your home folder. It's the workspace artifacts are written to, and where `.open-design/config.json` (the active design system) is kept.

### OPEN_DESIGN_DEFAULT_WORKSPACE

MCP server. A folder to use when nothing else names one: below a folder the agent sets, `OPEN_DESIGN_WORKSPACE_ROOT` and MCP roots, and in place of the working directory. It must exist. Unlike `OPEN_DESIGN_WORKSPACE_ROOT`, it doesn't switch off the home-folder check: tools wait until the agent calls [`set_open_design_workspace`](tools.md#set_open_design_workspace), so a chat with a different connected folder never writes into it by accident. The [desktop extension](../getting-started/claude-desktop.md#install-the-desktop-extension) sets it from its **Default design folder** setting, and chats with no folder keep their designs under it (see [`OPEN_DESIGN_MANAGED_ROOT`](#open_design_managed_root)). A value that isn't an absolute path to an existing folder is ignored; the server says why in its startup line on stderr (in Claude Desktop, `mcp-server-Open Design.log`) and in the tools' folder message.

### OPEN_DESIGN_MANAGED_ROOT

MCP server. Where [`use_open_design_managed_workspace`](tools.md#use_open_design_managed_workspace) keeps designs for chats with no folder: this folder is the workspace and each design gets a subfolder in it. Default: `OPEN_DESIGN_DEFAULT_WORKSPACE` when set, else `~/Documents/Open Design`, or `~/Open Design` when there is no Documents folder. Per-design folders an earlier release made under `~/Open Design` are still reopened by name.

### OPEN_DESIGN_OUTPUT_DIR

MCP server. Default: `.open-design`. The MCP equivalent of [`openDesign.outputDirectory`](#opendesignoutputdirectory).

In Claude Desktop, when this is unset, designs go in a visible folder instead: `Open Design/` inside a connected folder, or straight into the design's folder under [`OPEN_DESIGN_MANAGED_ROOT`](#open_design_managed_root). There, PNG, JPEG, PDF and PowerPoint exports are saved next to the design with plain names (`seed-swap-flyer-A4.pdf`, `seed-swap-flyer-instagram-portrait.png`, `-2` added instead of overwriting a file you made), and other exports go in `exports/`. A folder whose `.open-design/` already holds designs keeps the classic layout. Setting this variable always uses the classic layout, with the folder named here.

### OPEN_DESIGN_FIGMA_TOKEN

MCP server. A Figma personal access token (Figma → Settings → Personal access tokens), needed by [`pull_open_design_figma_frame`](tools.md#pull_open_design_figma_frame) when Figma isn't connected. When it's unset, the server reads the token from the file `~/.config/open-design/figma-token` (under `$XDG_CONFIG_HOME` when that's set), so a token saved there works in the Claude Code plugin and Claude Desktop without editing any config. The [desktop extension](../getting-started/claude-desktop.md#install-the-desktop-extension) sets it from its **Figma access token** setting; an empty setting falls back to the file. In VS Code, use **Open Design: Set Figma Access Token** instead; it stores the token encrypted.

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

Nothing is ever downloaded. See [Troubleshooting](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found). The [browser preview](../guides/browser-preview.md) uses the same browser for its window and comment screenshots.

### OPEN_DESIGN_HOST

MCP server. Set to `claude-desktop-extension` by the desktop extension's manifest. The server then holds the lock file `~/.config/open-design/desktop-extension.lock` (under `$XDG_CONFIG_HOME` when set) while it runs, and treats its working directory as no folder of its own. You don't set it yourself.

### OPEN_DESIGN_LAUNCHER

MCP server. Set to `claude-plugin` by the Claude plugin's launcher. While a desktop extension holds its lock, a server started this way lists no tools to clients other than Claude Code, so Claude Desktop shows one set of Open Design tools. Set to `chatgpt-plugin` by the [ChatGPT desktop plugin](../getting-started/chatgpt-desktop.md)'s `mcp.json`: the server then follows the folder rules of a chat with no folder. You don't set it yourself.

### OPEN_DESIGN_PREVIEW

MCP server. When the [browser preview](../guides/browser-preview.md) opens:

- `manual` (default): when the agent calls [`open_open_design_preview`](tools.md#open_open_design_preview), which the `open-design` skill asks it to do once after the first design in a session.
- `auto`: also by itself the first time an artifact is registered in a session.
- `off`: never; the tool says the preview is off.

### OPEN_DESIGN_PREVIEW_BROWSER

MCP server and CLI. Set to `default` to open the [browser preview](../guides/browser-preview.md) in your default browser (with your own extensions and sign-ins) instead of an app window of Chrome, Edge or Chromium. Comment screenshots are then re-rendered headless rather than taken from the window, so they may not show a state you clicked into, such as an open tab.

### OPEN_DESIGN_PROFILE

MCP server. Set to `remote` to run as the [hosted server](remote-server.md): one folder per MCP session, tools that need your own computer hidden, limits and download links. Starting the server with `--http` sets it. You don't set it for a local server.

### OPEN_DESIGN_REMOTE_TOKEN

Hosted server, required. The shared secret clients present as `Authorization: Bearer <token>` or in the URL (`/mcp/<token>`). At least 16 characters. See [Hosted server](remote-server.md).

### OPEN_DESIGN_REMOTE_SECRET

Hosted server. Signs download links. Defaults to `OPEN_DESIGN_REMOTE_TOKEN`; set it separately so a rotated token doesn't break links already handed out.

### OPEN_DESIGN_REMOTE_DATA_DIR

Hosted server. Where session folders live (`<dir>/sessions/<id>`). Defaults to a folder in the system temp directory; the container image sets `/data`.

### OPEN_DESIGN_PUBLIC_URL

Hosted server. The server's public `https://` origin, used in download links. Defaults to the origin of the request (honouring `X-Forwarded-Proto` and `X-Forwarded-Host`).

### OPEN_DESIGN_REMOTE_MAX_FILES

Hosted server. Files a session may hold before tools that write are refused. Default `500`.

### OPEN_DESIGN_REMOTE_MAX_MB

Hosted server. Megabytes a session may hold before tools that write are refused. Default `200`.

### OPEN_DESIGN_REMOTE_MAX_EXPORTS

Hosted server. Exports a session may make. Default `50`.

### OPEN_DESIGN_REMOTE_CALLS_PER_MINUTE

Hosted server. Tool calls a session may make in a minute. Default `120`.

### OPEN_DESIGN_REMOTE_SESSION_DAYS

Hosted server. Days a session's folder is kept after its last request. Default `7`.

### OPEN_DESIGN_REMOTE_LINK_HOURS

Hosted server. Hours a download link stays valid. Default `24`.

## Contributor-only variables

Read by the content sync script (`packages/content/scripts/sync-open-design-content.mjs`), not by any shipped package. See [Content sync](../contributing/content-sync.md).

| Variable | Meaning |
|---|---|
| `OPEN_DESIGN_SRC` | Sync from a local open-design checkout instead of cloning. |
| `OPEN_DESIGN_REPO` | Clone from a different repository URL. |
| `OPEN_DESIGN_REF` | Clone a different tag or branch than the pinned release. |
