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

### A 3D scene is blank (webgl)

The check or export reports `webgl`:

- **Error: three.js didn't load.** The page's script tags point at a three.js file that doesn't exist. `build/three.min.js` was removed in three.js r160 and `examples/js/…` in r148, so pages written from memory often use them, and then nothing renders. Ask the agent to load three.js the way the 3D object skill does: an import map for `three@0.160.0`'s `three.module.js`, imported from a module script.
- **Error: no WebGL context.** The canvas marked `data-od-webgl` couldn't get WebGL. Exports already turn on software WebGL for these pages, so this usually means the page's script failed before it created the renderer: look for `Page script error` in the warnings. A canvas made by a script without `data-od-webgl`, in a page that doesn't import three.js, doesn't get software WebGL; add the attribute.
- **Warning: the canvas is one flat color.** The scene drew nothing. Most often the model didn't load: a `broken-asset` finding names the file (check the path is relative to the design, for example `assets/bottle.glb`). Otherwise the camera may sit inside the object or face away from it, or the scene's `window.odScene.ready` resolved before the first frame was drawn.

A transparent export that warns *no pixel is transparent* means the page or the scene still paints a background: set the scene's `TRANSPARENT` switch (no `scene.background`, renderer `alpha: true`) and keep `html` and `body` transparent. See [3D objects](guides/3d-objects.md).

## Video

### FFmpeg is missing

HyperFrames renders need FFmpeg. Install it (`brew install ffmpeg`, `sudo apt install ffmpeg`, or [ffmpeg.org](https://ffmpeg.org/)) so that `ffmpeg -version` works in the same terminal, then render again.

### Export failed (no-ffmpeg)

Exporting an animation as MP4, WebM or GIF needs ffmpeg, which is never downloaded for you. Install it (`brew install ffmpeg`, `sudo apt install ffmpeg`, `winget install ffmpeg`, or [ffmpeg.org](https://ffmpeg.org/)), or point [`OPEN_DESIGN_FFMPEG_PATH`](reference/settings-and-env.md#open_design_ffmpeg_path) (VS Code: `openDesign.export.ffmpegPath`) at one. The error lists where it looked.

### Export failed (ffmpeg-missing-encoder)

An ffmpeg was found, but it can't make the format you asked for. The message says what it can make. The usual case is Playwright's bundled ffmpeg, which only encodes WebM (VP8): MP4 needs H.264 and GIF needs the palette filters. Install a full ffmpeg build, or export as `webm`.

### An animation looks wrong in the video

Exports run the page on a virtual clock, so CSS animations, `requestAnimationFrame` and timers all advance frame by frame. Two things don't: Web Workers (they keep real time) and `<video>` elements (they show their current frame). The export warns about both. To see a moment before exporting, check with `at`, for example `[0, 1.5, 3]`.

### The HyperFrames render hangs

A render stalls partway through capturing frames. Some agent sandboxes (for example, sandboxed shell tools on macOS) stop headless Chrome from finishing. Run the same `npx hyperframes render …` command outside the sandbox: allow it in your agent, or run it yourself, or use [`render-video`](reference/cli.md#render-video). Renders take minutes; run them as a background or long-running command.
