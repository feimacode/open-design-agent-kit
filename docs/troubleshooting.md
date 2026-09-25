# Troubleshooting

One section per symptom, phrased the way you'll see it. Error messages from the tools use the same words, so search this page for the message you got.

## Setup and generation

### The agent doesn't use Open Design

The agent answers with generic code instead of calling Open Design's tools.

- **VS Code:**
  - use Copilot Chat in **agent** mode (tools aren't available in ask mode);
  - check the tools are enabled in the chat's tool picker;
  - to force it, run `/open-design-generate` or reference a tool, e.g. `#od-skills`.
- **Claude Code / Codex:**
  - check the MCP server is connected (see [below](#the-mcp-server-doesnt-connect));
  - check the skills are installed: the plugin, or `.claude/skills/open-design/` or `.agents/skills/open-design/`;
  - to force it, say "use Open Design", or run a [curated command](reference/prompts-and-commands.md#curated-entries).

### The MCP server doesn't connect

- Run `npx -y @feimacode/open-design-agent-kit-mcp` in a terminal. It should start and wait silently for input (stop it with Ctrl+C). An error here, such as an old Node version, is the problem. It needs Node.js 18 or later.
- **Claude Code:** `claude mcp list`. **Codex:** `codex mcp list`.
- Behind a proxy or offline, the first `npx` download fails. Install once with network access, or install the package globally and point the MCP config at it.

### Unknown skillId

The tool returns `Unknown skillId "…"` with a few valid ids. Skill ids are full `od:<mode>:<name>` strings from [`list_open_design_skills`](reference/tools.md#list_open_design_skills). Bare names such as `guizang-ppt` also work when unambiguous. An example that shares a name with a skill has a `:example` suffix, e.g. `od:deck:deck-guizang-editorial:example`.

### Figma: no access token

`pull_open_design_figma_frame` says no Figma token is configured.

- **VS Code:** run **Open Design: Set Figma Access Token**.
- **MCP:** set [`OPEN_DESIGN_FIGMA_TOKEN`](reference/settings-and-env.md#open_design_figma_token) in the server's `env` and restart the agent.

Also use a frame link from **Copy link to selection** (it contains `node-id`), not a file link.

## Export

### No Chrome, Edge, or Chromium browser was found

`Export failed (no-browser)`. Export renders in a real browser and never downloads one. Fix it in one of these ways:

- Install Google Chrome, Microsoft Edge or Chromium.
- Point to an existing one with [`openDesign.export.browserPath`](reference/settings-and-env.md#opendesignexportbrowserpath) (VS Code), [`OPEN_DESIGN_BROWSER_PATH`](reference/settings-and-env.md#open_design_browser_path) (any host), or `--browser` (CLI).
- On a headless server or in CI, install a headless shell once:

  ```bash
  npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer
  ```

The error lists every location that was searched. Snap-packaged Chromium (Ubuntu's default) is tried last because it can't read hidden folders like `.open-design/`.

### Export failed (not-registered)

The file exists but has no `<entry>.artifact.json` manifest. Ask the agent to register it ([`register_open_design_artifact`](reference/tools.md#register_open_design_artifact)), or remix or generate through Open Design so registration happens automatically.

### Emoji show as empty boxes

Emoji are drawn from the exporting machine's fonts, and many Linux and CI machines have no emoji font. Either:

- use inline SVG for icons and key visuals (the social-post recipes already ask for this), or
- install an emoji font, e.g. `sudo apt install fonts-noto-color-emoji`.

### Fonts look wrong in exports

Text came out in a fallback font.

- Web fonts must load from a reachable URL (Google Fonts works) or a file in the workspace. Check the export's warnings for `Failed to load:` lines.
- Export waits up to 5 s for fonts. On a slow network, run it again.
- For Chinese, Japanese or Korean text without a web font, install a CJK font on the exporting machine (e.g. `fonts-noto-cjk`).

### File is over the byte budget

The warning says a file `is still over the … budget at the lowest quality tried`. Even JPEG quality 40 didn't fit. Simplify the design (fewer photos, gradients or noise textures), lower `scale`, or raise `maxBytes` if the platform allows it. PDFs and PowerPoint files are never re-encoded; for large decks try `scale: 1`.

### Export failed (not-a-deck)

PowerPoint (or `slides`) was requested for an artifact that isn't recognized as a deck. If it really is one, pass `deck: true` (`--deck` on the CLI). See [how decks are detected](guides/export-decks.md#how-decks-are-detected).

### Export failed (no-slides)

Deck export found no slide elements. Slides must match `.slide`, `[data-screen-label]`, `.deck-slide` or `.ppt-slide`. Ask the agent to add one of those classes to each slide, or export it as a page (`format: "pdf"` with `deck: false`).

### A slide looks blank

The warning `Slide N looks blank` means the capture came out as one flat color. The deck probably reveals slides in a way the exporter doesn't recognize, such as a custom JavaScript router. Check that the deck works with an `active` class on the current slide, and that nothing hides slides with `display: none` from a script after load. Then [open an issue](https://github.com/feimacode/open-design-agent-kit/issues) with the deck.

## Video

### FFmpeg is missing

HyperFrames renders need FFmpeg. Install it (`brew install ffmpeg`, `sudo apt install ffmpeg`, or [ffmpeg.org](https://ffmpeg.org/)) so that `ffmpeg -version` works in the same terminal, then render again.

### The HyperFrames render hangs

A render stalls partway through capturing frames. Some agent sandboxes (for example, sandboxed shell tools on macOS) stop headless Chrome from finishing. Run the same `npx hyperframes render …` command outside the sandbox: allow it in your agent, or run it yourself, or use [`render-video`](reference/cli.md#render-video). Renders take minutes; run them as a background or long-running command.
