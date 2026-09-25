## Context

The extension vendors Open Design's skills, design templates and design systems at build time (`packages/content/assets/open-design`, pinned to v0.22.2), and exposes them through a small, daemon-free tool surface: list, prepare brief, register, get, remix, port. The calling model writes artifact files itself; core is fs-only and DOM-free.

Upstream's social skills (`card-twitter`, `social-x-post-card`, `social-carousel`, `card-xiaohongshu`, `poster-hero`, …) produce fixed-size HTML canvases that are meant to be screenshotted. Upstream's `design-templates/hyperframes` produces a HyperFrames composition and then renders it through the OD daemon (`"$OD_NODE_BIN" "$OD_BIN" media …`). This extension ships neither a screenshot step nor the daemon.

Two audiences need the same pipeline: extension users designing posts, and our own internal use (X post images, YouTube HyperFrames videos). The internal use runs through Claude Code or Codex via the MCP server as well as VS Code, so every piece must work in hosts that have no webview.

## Goals / Non-Goals

**Goals:**
- Turn a registered HTML artifact into upload-ready PNG or JPEG file(s) with one tool call, in every host (VS Code, MCP).
- Make HyperFrames video skills end in an MP4 without the daemon.
- Give users one obvious "make a social post" entry point that picks the right size and skill per platform.
- Ship a YouTube thumbnail skill, and let the extension own content that survives re-syncs.

**Non-Goals:**
- Posting to X, YouTube or other platforms, or any platform API or credential handling.
- Image or video *generation-model* pipelines (`image-poster`, `video-shortform`, `prompt-templates/`).
- Downloading or bundling a browser or FFmpeg.
- Animated GIF or MP4 export of non-HyperFrames HTML.

## Decisions

### D1. Raster export uses `puppeteer-core` driving an already-installed Chromium-family browser
Export lives in `packages/core/src/export/` so both the VS Code and MCP hosts share it. It launches headless Chrome, Edge or Chromium, loads the entry file over `file://` (supporting files resolve relatively), sets the viewport to the target size, waits for `document.fonts.ready` plus network idle, and screenshots.

- *Browser discovery*: an explicit setting or env var (`OPEN_DESIGN_BROWSER_PATH`) wins. Otherwise check well-known install paths per OS (Chrome stable, Edge, Chromium, and on Linux the `which` results), then the Playwright and Puppeteer browser caches (`~/.cache/ms-playwright/chromium_headless_shell-*`, `~/.cache/puppeteer/chrome-headless-shell/*`), which are common on developer and CI machines. If nothing is found, return a structured error naming what was searched and how to fix it; never throw an opaque launch error.
- *Alternatives considered*:
  - **Full `puppeteer` or Playwright with a bundled browser**: rejected because it adds about 150 MB and a postinstall download to a VS Code extension and an npm package.
  - **Capture inside the VS Code webview** (DOM → canvas, like the existing figma capture walk): rejected as the primary path because the MCP host has no webview, and DOM-to-canvas libraries render fonts, filters and backdrop effects wrongly, which matters for posts where the pixels are the product.
  - **Tell the model to run `npx playwright screenshot`**: rejected because it's non-deterministic, has no sizing contract, and downloads a browser on first run.
- `puppeteer-core` is dynamically imported, so hosts that never export pay nothing at activation.

### D2. Sizing resolution order
1. Explicit `width`/`height` arguments.
2. The artifact manifest's `sourceSkillId` → that catalog entry's `aspect_hint`, parsed for the first `\d+\s*[×x]\s*\d+` (covers `"1600×900 (16:9)"`, `"1080×1440 (3:4)"`, and `"1280×720 或 1080×1080"`, which takes the first).
3. With `selector` and no size: each element's own bounding box.
4. Fallback 1080×1080.

`scale` (device scale factor, default 1, max 3) is independent. The tool result reports the size used and where it came from, so the model can correct it.

### D3. Multi-card export via `selector`
Carousels and Xiaohongshu cards put several fixed-size cards in one HTML page. When `selector` is given, each matching element is screenshotted separately into `…-01.png`, `…-02.png`, and so on, in document order. A single match keeps the plain `….png` name, so single-image posts that mark their card get a clean file name. The social-post prompt tells the model to mark each card with `data-od-card`, and defaults `selector` to `[data-od-card]` for multi-card formats. With no selector, the result is a single viewport-sized screenshot of the page.

### D4. Output location and bookkeeping
Exports go in `<artifact-dir>/exports/<entry-basename>[-NN].<ext>`, next to the artifact and version-controllable like the rest of `.open-design/`. Existing export files are overwritten, since re-exporting after an edit is the normal loop. The manifest's `metadata.exports` records `{ path, width, height, scale, exportedAt }`. The tool returns the paths and does not open them.

### D5. HyperFrames: daemon step overridden at brief-composition time, not by editing vendored text
`composeInstructions` gains a `hostOverrides` input: a map from skill id to a markdown block appended after the skill body under a heading "Host override — this takes precedence over the skill text above". For `hyperframes` the block says:
- Scaffold with `npx hyperframes init` in the artifact folder, or author the files by hand following the skill.
- Validate with `npx hyperframes lint` (or `check`).
- Render with `npx hyperframes render --output <artifact-dir>/exports/<name>.mp4` from the model's own terminal tool.
- Ignore every `$OD_BIN` / `od media` / daemon instruction.
- YouTube default: 1920×1080 at 30 fps.

The override text lives in core, next to the other instruction builders, and is unit-tested.

A generic guard complements it. If a skill body mentions `$OD_BIN`, `OD daemon` or `od media` and has no override, compose appends a notice that the daemon-backed step isn't available in this host and the model should tell the user rather than improvise.

- *Alternative considered*: patching the vendored SKILL.md during sync. Rejected because it breaks `check-content-sync`'s byte-for-byte upstream parity, and it gets silently lost when the upstream wording changes. The override survives upstream edits, and the generic guard catches new daemon references.
- *Alternative considered*: a dedicated `render_open_design_video` tool that shells out itself. Rejected for v1 because rendering takes minutes and wants streamed progress, which the model's own terminal already provides. This matches the "native mechanisms" preference. It can be revisited if internal automation needs a single deterministic call.

### D6. Extension-owned content via an overlay directory
`packages/content/local/` mirrors the assets layout (`local/skills/social-youtube-thumbnail/SKILL.md`, plus an example). A standalone `apply-local-overlay.mjs` script copies the overlay into `assets/open-design/`: skills go to `skills/`, and `local/prompts/*` goes to `assets/open-design/prompts/`, so every runtime consumer (the VS Code mirror, the MCP server, the CLI) finds it in the one assets tree. The sync script calls it after the upstream copy, and it can run alone without cloning upstream. An overlay id that collides with an upstream id fails the sync loudly, so an overlay never shadows upstream. `MANIFEST.json` gets a `localOverlay` count. `check-content-sync` (today a pinned-ref drift check) additionally verifies that every overlay file is present in the assets tree and identical to its source.

The thumbnail skill follows the upstream `card-twitter` frontmatter shape: `aspect_hint: "1280×720 (16:9)"`, `od.mode: prototype`, `featured` set so it's curated automatically, and an `example_prompt`. Its body covers YouTube's constraints: text legible at 168×94, a bottom-right safe area kept clear of the timestamp overlay, 2 MB upload limit, and high-contrast face or subject framing.

### D7. Local curation list
`packages/content/local/curated.json` is a plain array of entry ids: `["card-twitter", "poster-hero", "social-carousel"]`. `curatedEntries.mjs` treats an entry as curated if it has an upstream flag *or* is in this list, so every host's generator picks it up with no per-host change. An unknown id in the list fails the generator, to catch typos and upstream renames.

### D8. The social-post prompt is hand-written, one source rendered per host
Content lives once at `packages/content/local/prompts/social-post.md` (frontmatter `name`/`description` + body), reaches `assets/open-design/prompts/` via the overlay step, and is rendered into VS Code's `prompts/open-design-social-post.prompt.md`, the MCP server's prompt list and the Claude plugin's commands by the existing per-host generators. It contains the platform table:

| Platform / format | Size | Skill |
|---|---|---|
| X single image | 1600×900 | `od:prototype:card-twitter` |
| X post mock (for a video overlay) | element | `social-x-post-card` |
| Instagram / LinkedIn square carousel | 1080×1080 ×N | `social-carousel` |
| Instagram portrait | 1080×1350 | `poster-hero` |
| Story / Reels / TikTok cover | 1080×1920 | `poster-hero` |
| Xiaohongshu | 1080×1440 ×N | `card-xiaohongshu` |
| YouTube thumbnail | 1280×720 | `social-youtube-thumbnail` |
| YouTube video | 1920×1080 MP4 | `hyperframes` |

The flow: ask for the platform and format if they aren't given → generate (brief → author → register) → export (PNG via tool, MP4 via override) → report paths.

**Discoverability.** On Claude Code and Codex the rendered skill is model-invocable, unlike the per-entry curated skills, which stay explicit-only. Its description lists social-post requests as its trigger, so the host's own skill discovery loads the full workflow from a plain request, and the overview `open-design` skill points to it by name. VS Code prompt files can only be started by the user, so there the chat instructions tell the agent to ask for the platform and to suggest `/open-design-social-post`.

## Risks / Trade-offs

- [No Chromium-family browser installed, especially in CI or containers used internally] → Structured error with install hint and `OPEN_DESIGN_BROWSER_PATH`; document `npx @puppeteer/browsers install chrome-headless-shell` as a one-liner for headless environments.
- [Remote fonts and images not loaded when the screenshot is taken] → Wait for `document.fonts.ready` and network idle with a 15 s cap. The result includes a `warnings` list for requests that failed.
- [`file://` blocks some fetches (ES modules, fetch of local JSON)] → Fall back to a throwaway localhost static server rooted at the artifact directory when the entry uses `type="module"`. Loopback only, closed after capture.
- [HyperFrames CLI flags change upstream] → The override references only `init`, `lint`/`check` and `render --output`, and tells the model to run `npx hyperframes --help` if a flag is rejected. The override text is pinned alongside the content version.
- [`npx hyperframes render` needs FFmpeg and takes minutes] → The override tells the model to check `ffmpeg -version` first and to run the render as a long or background terminal command.
- [Screenshotting untrusted artifact HTML runs its JS in a headless browser] → Same trust level as the existing preview editor (the artifact is workspace content). Launched with no extra flags beyond the defaults and a fresh temporary profile, and closed after each call.
- [Overlay content drifts from upstream conventions] → The overlay skill goes through the same `contentIndex` parsing and unit tests as vendored entries.

### D9. Byte-budget auto-fit (resolved open question)
The export tool accepts `maxBytes`. If a capture exceeds it, the export is re-captured as JPEG (a PNG is converted, since PNG has no quality knob) at quality 90, 80, 70, 60, 50, 40, stopping at the first attempt that fits. If quality 40 still doesn't fit, the smallest attempt is kept and a warning is returned. Re-capturing through the browser's own encoder avoids adding an image library. The social-post prompt passes each platform's limit: X 5 MB, YouTube thumbnail 2 MB, Instagram 8 MB.

### D10. Non-interactive CLI export (resolved open question)
`packages/cli` gains `open-design-agent-kit export <entryPath> [--width --height --scale --format --quality --selector --max-bytes --browser]`, calling the same core function, for internal automation (CI and scripts that produce X images without an agent loop). It resolves `sourceSkillId` hints against the content package's assets, like the MCP server does. The CLI also gains `render-video <compositionDir> --output <mp4>`, a thin passthrough to `npx hyperframes render` that exists only so the automation has one entry point. It prints the exact command it runs.

- The CLI resolves the workspace root as the nearest ancestor of `entryPath` containing `.open-design/`, or the current directory, overridable with `--workspace`.
