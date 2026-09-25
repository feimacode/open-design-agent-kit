# CLI

`@feimacode/open-design-agent-kit` is a small command-line tool with three commands: set up a project for Claude Code and/or Codex, export artifacts, and render HyperFrames videos. Run it with `npx`; there's nothing to install:

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
  - `.claude/skills/open-design-social-post/`;
  - one explicit-only skill per curated entry;
  - an `open-design` entry merged into `.mcp.json`. Other servers in the file are kept.
- **Codex:**
  - the same skills in `.agents/skills/`, with curated entries marked explicit-only by `agents/openai.yaml`;
  - `.codex/config.toml` with the MCP server, created only if that file doesn't exist. Otherwise the snippet to add is printed.

Safe to re-run: generated skills are refreshed, stale generated ones are removed, and skills you wrote yourself are never touched.

### export

Exports a registered artifact under its `exports/` folder: images (PNG/JPEG), a deck as PowerPoint or PDF, or a page as PDF. Uses an installed Chrome, Edge or Chromium; nothing is downloaded. It calls the same code as the [`export_open_design_artifact`](tools.md#export_open_design_artifact) tool.

```bash
npx @feimacode/open-design-agent-kit export <entryPath> [options]
```

| Option | Meaning |
|---|---|
| `--format <png\|jpeg\|pdf\|pptx>` | Output format. Default `png`. `pptx` is for decks; `pdf` works for decks and pages. `jpg` is accepted for `jpeg`. |
| `--width <px>` | Width in CSS pixels, given with `--height`. Overrides the source skill's size, the measured slide size, or the page-PDF size. |
| `--height <px>` | Height in CSS pixels, given with `--width`. |
| `--scale <n>` | Device scale factor, 1–3. Default 2 for deck `pdf`/`pptx`, else 1. |
| `--quality <1-100>` | JPEG quality. Default 90. |
| `--selector <css>` | Export each matching element as its own image, e.g. `"[data-od-card]"`. |
| `--max-bytes <n>` | Per-file byte budget. Oversized images are re-encoded as JPEG; documents only get a warning. |
| `--deck` | Treat the artifact as a slide deck. Decks registered as kind `deck`, or made from an `od:deck:*` skill, are detected without it. |
| `--slides <list>` | Decks only: 1-based slide numbers, e.g. `1,3`. |
| `--browser <path>` | Browser executable. Default: [`OPEN_DESIGN_BROWSER_PATH`](settings-and-env.md#open_design_browser_path), then auto-detect. |
| `--workspace <dir>` | Workspace root. Default: the nearest folder above the entry file that contains `.open-design/`, else the current directory. |

Output: each written file's absolute path on **stdout**, one per line, and a summary with any warnings on **stderr**. Exit code `0` on success, `1` on failure (the error is printed to stderr).

Examples:

```bash
# An X card, kept under X's 5 MB limit
npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --selector "[data-od-card]" --max-bytes 5000000

# Every card of a carousel
npx @feimacode/open-design-agent-kit export .open-design/tips/tips.html --selector "[data-od-card]"

# A deck as PowerPoint, and slides 1 and 3 as PNG
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format png --slides 1,3

# A report page as a vector PDF
npx @feimacode/open-design-agent-kit export .open-design/report/report.html --format pdf
```

See [Export images](../guides/export-images.md) and [Export decks and PDFs](../guides/export-decks.md).

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
