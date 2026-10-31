# CLI

`@feimacode/open-design-agent-kit` is a small command-line tool: set up a project for Claude Code and/or Codex, install the ChatGPT desktop plugin, export artifacts, check how artifacts render, and render HyperFrames videos. Run it with `npx`; there's nothing to install:

```bash
npx @feimacode/open-design-agent-kit <command> [options]
```

Requires Node.js 18 or later. `npx @feimacode/open-design-agent-kit --help` lists the commands, and `<command> --help` lists a command's options.

## Commands

### init

Writes Open Design's skills into a project in each agent's native format, and registers the MCP server.

```bash
npx @feimacode/open-design-agent-kit init [path] [--tools <list>]
```

| Argument / option | Meaning |
|---|---|
| `path` | Project to set up. Default: the current directory. |
| `--tools <list>` | `claude`, `codex`, `claude,codex` or `all`. Omit it to be asked interactively. Required when not running in a terminal (CI). |

What it writes:

- **Claude Code:**
  - `.claude/skills/open-design/` (the overview skill);
  - the workflow skills: `open-design-new`, `open-design-social-post`, `open-design-poster`, `open-design-campaign`, `open-design-docs`, `open-design-explore`, `open-design-publish`, `open-design-deck-from-source`, `open-design-integrations` and `open-design-recurring` (see [Prompts and commands](prompts-and-commands.md#claude-code));
  - one explicit-only skill per curated entry;
  - an `open-design` entry merged into `.mcp.json` (other servers in the file are kept);
  - an `open-design-preview` configuration merged into `.claude/launch.json`, which runs `preview --no-open --root-latest --port <port>` so Claude Desktop's Code tab can open the preview in its Browser pane (see [Claude Desktop](../getting-started/claude-desktop.md#the-live-preview-in-the-browser-pane)). The port is the project's own, 5317–5416 from its path, and the entry runs the `npx` beside the Node that ran `init` when there is one. Other configurations are kept; a re-run updates the `open-design-preview` entry and leaves the file alone when nothing changed.
- **Codex:**
  - the same skills in `.agents/skills/`, with curated entries marked explicit-only by `agents/openai.yaml`;
  - `.codex/config.toml` with the MCP server, created only if that file doesn't exist. Otherwise the snippet to add is printed.

The MCP server in `.mcp.json` and `.codex/config.toml`, and the CLI in `.claude/launch.json`, are pinned to the version of the CLI that ran `init` (for example `@feimacode/open-design-agent-kit-mcp@0.3.0`), so the server always matches the skills written beside it. To upgrade, run `npx @feimacode/open-design-agent-kit@latest init` again: it rewrites the skills and the pins together.

Safe to re-run: generated skills are refreshed, stale generated ones are removed, and skills you wrote yourself are never touched.

### install

Installs Open Design into a desktop app, outside any project. The only app so far is `chatgpt`: the [ChatGPT desktop plugin](../getting-started/chatgpt-desktop.md).

```bash
npx @feimacode/open-design-agent-kit install chatgpt [--from <file.zip>]
```

| Argument / option | Meaning |
|---|---|
| `app` | `chatgpt`. |
| `--from <file.zip>` | Use this plugin zip instead of downloading the release that matches the CLI's version. |

Unlike `init`, this writes in your home folder, and it prints every path it touches:

- downloads `open-design-chatgpt-plugin-<version>.zip` from the GitHub release with the CLI's own version and checks it against the release's `.sha256` file (skipped with `--from`);
- replaces `~/.codex/plugins/open-design/` with the zip's contents (unpacked beside it first, so a failed unpack never leaves half a plugin);
- adds or updates one `open-design` entry in `~/.agents/plugins/marketplace.json`, the personal marketplace the ChatGPT desktop app reads, creating the file if needed. Other plugins and fields in it are kept; a file that isn't valid JSON is left unchanged and the entry to add is printed.

Re-running the same version changes nothing. To upgrade, run `npx @feimacode/open-design-agent-kit@latest install chatgpt`. Then restart the ChatGPT desktop app.

### uninstall

```bash
npx @feimacode/open-design-agent-kit uninstall chatgpt
```

Removes `~/.codex/plugins/open-design/` and the `open-design` entry in `~/.agents/plugins/marketplace.json`, and nothing else. Your designs are kept.

### export

Exports a registered artifact under its `exports/` folder: images (PNG/JPEG), a deck as PowerPoint or PDF, or a page as PDF, using an installed Chrome, Edge or Chromium (nothing is downloaded). It can also package the artifact as one self-contained HTML file or a deploy-ready site folder, which needs no browser. It calls the same code as the [`export_open_design_artifact`](tools.md#export_open_design_artifact) tool.

```bash
npx @feimacode/open-design-agent-kit export <entryPath> [options]
```

| Option | Meaning |
|---|---|
| `--format <png\|jpeg\|pdf\|pptx\|standalone\|site\|email\|paste\|mp4\|webm\|gif>` | Output format. Default `png`. `pptx` is for decks; `pdf` works for decks and pages. `standalone` is one self-contained `.html`; `site` is a deploy-ready folder; `email` is an [inbox-ready HTML email](../guides/html-email.md); `paste` is HTML to [paste into another editor](../guides/paste-html.md) (with `--target`). `jpg` is accepted for `jpeg`. `mp4`, `webm` and `gif` are [animations](../guides/export-animations.md). |
| `--width <px>` | Width in CSS pixels, given with `--height`. Overrides the source skill's size, the measured slide size, or the page-PDF size. |
| `--height <px>` | Height in CSS pixels, given with `--width`. |
| `--scale <n>` | Device scale factor, 1–3. Default 2 for deck `pdf`/`pptx`, else 1. |
| `--quality <1-100>` | JPEG quality. Default 90. |
| `--selector <css>` | Export each matching element as its own image, e.g. `"[data-od-card]"`. |
| `--max-bytes <n>` | Per-file byte budget. Oversized images are re-encoded as JPEG; documents only get a warning. |
| `--deck` | Treat the artifact as a slide deck. Decks registered as kind `deck`, or made from an `od:deck:*` skill, are detected without it. |
| `--slides <list>` | Decks only: 1-based slide numbers, e.g. `1,3`. |
| `--preset <format>` | A [canvas format](tools.md#canvas-formats): screen formats set the size, card selector and byte budget; print formats make a [print-ready PDF](../guides/posters.md#print-ready-pdfs). |
| `--bleed <mm>` | Print PDFs: bleed in mm on every side. Default: the format's. |
| `--crop-marks` | Print PDFs: add crop marks in a slug around the page. |
| `--dpi <150-600>` | Print images (`--format png` or `jpeg` of a print format): the resolution, default 300, written into the file. |
| `--print-house <id>` | Write each card face at a print house's exact upload size, e.g. `boardgamesmaker` ([the profiles](../guides/posters.md#send-cards-to-a-print-house)). |
| `--check` | Run [preflight](../guides/posters.md#preflight-checks) only; write no files. |
| `--data <file>` | A CSV, XLSX or JSON-array file (relative to the current directory): [one output per row](../guides/posters.md#one-per-row-from-a-spreadsheet). |
| `--sheet <name>` | XLSX data: the sheet to read. Default: the first. |
| `--name-field <column>` | The data column that names each row's file. Default: row numbers. |
| `--split` | PDF data exports: one PDF per row instead of one multi-page PDF. |
| `--presets <list>` | Fluid designs: several shapes in one export, comma-separated, e.g. `a3,ig-portrait,story`. |
| `--fps <n>` | `mp4`/`webm`/`gif`: frames per second, 1–60. Default 30 (15 for GIF). |
| `--duration <seconds>` | `mp4`/`webm`/`gif`: length, 0.5–60. Default: from the page. |
| `--loop`, `--no-loop` | `gif`: loop forever (the default) or play once. |
| `--transparent` | `png`: capture without the page background, for cut-outs such as a [3D product shot](../guides/3d-objects.md). |
| `--ffmpeg <path>` | ffmpeg executable. Default: [`OPEN_DESIGN_FFMPEG_PATH`](settings-and-env.md#open_design_ffmpeg_path), then auto-detect. |
| `--campaign-sheet` | Fluid designs: also write `campaign-sheet.png`, every shape plus the other pieces in the master's collection. See [Run a campaign](../guides/campaigns.md). |
| `--shape-sheet` | Fluid designs: also write `<name>-shapes.png`, the design at every shape (all formats unless `--presets`). |
| `--target <wechat\|notion\|newsletter\|generic>` | `--format paste` only: where it will be pasted. See [Paste into WeChat, Notion and newsletters](../guides/paste-html.md). |
| `--base-url <https-url>` | `site`, `email` and `paste`: where the files will be hosted, so image and link URLs become absolute. |
| `--embed-assets` | `standalone` only: download the remote 3D assets the page declares (HDRIs, textures, models) and embed them, so the file works offline and as a Claude artifact. Above 16 MB the export fails. |
| `--max-resolution <1k\|2k\|4k>` | With `--embed-assets`: the highest Poly Haven texture and HDRI resolution to fetch. Default `1k`. |
| `--badge`, `--no-badge` | `standalone`/`site` only: add or leave out the "Made with Open Design" footer badge. Default: on for `site`, off for `standalone`, unless [`OPEN_DESIGN_SHARE_BADGE`](settings-and-env.md#open_design_share_badge) says otherwise. |
| `--browser <path>` | Browser executable. Default: [`OPEN_DESIGN_BROWSER_PATH`](settings-and-env.md#open_design_browser_path), then auto-detect. |
| `--workspace <dir>` | Workspace root. Default: the nearest folder above the entry file that contains `.open-design/`, else the current directory. |

Output: each written file's absolute path on **stdout**, one per line (for `site`, the bundle folder), and a summary with any warnings on **stderr**. Exit code `0` on success, `1` on failure (the error is printed to stderr).

Examples:

```bash
# An X card, kept under X's 5 MB limit
npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --selector "[data-od-card]" --max-bytes 5000000

# Every card of a carousel
npx @feimacode/open-design-agent-kit export .open-design/tips/tips.html --selector "[data-od-card]"

# A deck as PowerPoint, and slides 1 and 3 as PNG
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format png --slides 1,3

# An A3 poster for the printer, with crop marks; then one name card per row of a spreadsheet
npx @feimacode/open-design-agent-kit export .open-design/hack-night/hack-night.html --preset a3 --crop-marks
npx @feimacode/open-design-agent-kit export .open-design/badge/badge.html --preset a4 --data attendees.csv --name-field name

# One HTML file to email, and a folder to upload to any static host
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format standalone
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format site --no-badge

# A report page as a vector PDF
npx @feimacode/open-design-agent-kit export .open-design/report/report.html --format pdf
```

See [Export images](../guides/export-images.md), [Export decks and PDFs](../guides/export-decks.md) and [Share and publish](../guides/share-and-publish.md).

### check

Renders a registered artifact with an installed Chrome, Edge or Chromium and prints its [preflight](../guides/posters.md#preflight-checks) findings: a page at desktop and mobile widths, a card design at its format size, a deck slide by slide. It saves the run's findings under `.open-design/.checks/` (see [Saved check runs](tools.md#saved-check-runs)) and writes screenshots only when you ask for them. It calls the same code as the [`check_open_design_artifact`](tools.md#check_open_design_artifact) tool.

```bash
npx @feimacode/open-design-agent-kit check <entryPath> [options]
```

| Option | Meaning |
|---|---|
| `--viewport <name:WxH>` | Pages: a viewport to check instead of desktop `1440x900` and mobile `390x844`, e.g. `tablet:768x1024`. Repeat for several (at most 4). |
| `--slides <list>` | Decks only: 1-based slide numbers, e.g. `1,3`. |
| `--screenshots <dir>` | Write the screenshots as JPEG files named after their labels (`desktop.jpg`, `mobile.jpg`, `slides-1-12.jpg`) to this folder. Without it, no screenshots are rendered. |
| `--at <seconds>` | Animations: also capture these moments, comma-separated (e.g. `0,1.5,3`). Write them with `--screenshots`. |
| `--max-images <n>` | With `--screenshots`: how many, 0–6. Default 3. |
| `--views <list\|none>` | 3D scenes exposing their `odScene` handles: the review views on the sheet, comma-separated from `overview,closeup,low,wireframe` (default all), or `none`. The sheet is written as `3d-views-<views>.jpg`. See [the check tool](tools.md#check_open_design_artifact). |
| `--no-states` | Pages: skip the hover and focus, tap-target, 320 px reflow and reduced-motion checks, for a faster run. See [the check tool](tools.md#check_open_design_artifact). |
| `--fail-on <error\|warning>` | Exit `1` when a finding at or above this severity exists, to gate CI. |
| `--json` | Print the result as one JSON object instead of text: `findings`, `mode`, `savedRun`, `warnings`, and `images` as label, size and written file. On failure, `{ "ok": false, "code", "error" }` on stdout. Used by the [evals](../../evals/README.md) scorer. |
| `--browser <path>` | Browser executable. Default: [`OPEN_DESIGN_BROWSER_PATH`](settings-and-env.md#open_design_browser_path), then auto-detect. |
| `--workspace <dir>` | Workspace root. Default: the nearest folder above the entry file that contains `.open-design/`, else the current directory. |

Output: the findings on **stdout**, then each written screenshot's absolute path. Exit code `0` when the check ran (findings don't fail it unless `--fail-on` says so), `1` when it couldn't run (no browser, not registered…; the error is printed to stderr).

```bash
# Fail a CI job when a page scrolls sideways on phones or has clipped text
npx @feimacode/open-design-agent-kit check .open-design/landing/landing.html --fail-on error

# Save what the agent sees
npx @feimacode/open-design-agent-kit check .open-design/pitch/pitch.html --screenshots ./check-shots
```

### preview

Shows a registered artifact in the [browser preview](../guides/browser-preview.md), the same one the [`open_open_design_preview`](tools.md#open_open_design_preview) tool opens: a live page that reloads when the design changes, where you can click elements to comment and compare check screenshots. It runs in the foreground until you press Ctrl-C. Without an entry path it shows the list of the workspace's designs.

```bash
npx @feimacode/open-design-agent-kit preview [entryPath] [options]
```

| Option | Meaning |
|---|---|
| `--no-open` | Print the URL without opening a browser, e.g. over SSH (forward the port, then open the URL locally). |
| `--port <n>` | The port to listen on, on `127.0.0.1`. Default: a free one. |
| `--browser <path>` | Browser executable. Default: [`OPEN_DESIGN_BROWSER_PATH`](settings-and-env.md#open_design_browser_path), then auto-detect. |
| `--root-redirect` | Also answer the port's bare `/` with a redirect to the preview, for hosts that can only open a port, such as Claude Desktop's `.claude/launch.json`. |
| `--root-latest` | Like `--root-redirect`, but `/` opens the most recently registered design (the list when there is none). What the Browser pane entry uses. |
| `--workspace <dir>` | Workspace root. Default: the nearest folder above the entry file (or the current directory) that contains `.open-design/`, else the current directory. |

Output: the preview URL on **stdout**, then how it was opened on stderr. Exit code `0` after Ctrl-C, `1` when the preview couldn't start.

```bash
npx @feimacode/open-design-agent-kit preview .open-design/landing/landing.html
```

### render-video

Renders a HyperFrames composition to MP4 by running `npx hyperframes render`. It prints the exact command before running it.

```bash
npx @feimacode/open-design-agent-kit render-video <compositionDir> --output <file.mp4> [--quality <q>]
```

| Argument / option | Meaning |
|---|---|
| `compositionDir` | The composition folder (the artifact's folder, containing `index.html` and `hyperframes.json`). |
| `--output <file.mp4>` | Required. Output path. Missing parent folders are created. |
| `--quality <draft\|standard\|high>` | HyperFrames render quality. Default `high`. |

Needs Node and [FFmpeg](https://ffmpeg.org/). The exit code is the HyperFrames CLI's. See [YouTube videos](../guides/youtube-video.md).
