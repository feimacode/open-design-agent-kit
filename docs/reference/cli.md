# CLI

`@feimacode/open-design-agent-kit` is a small command-line tool with four commands: set up a project for Claude Code and/or Codex, export artifacts, check how artifacts render, and render HyperFrames videos. Run it with `npx`; there's nothing to install:

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

Exports a registered artifact under its `exports/` folder: images (PNG/JPEG), a deck as PowerPoint or PDF, or a page as PDF, using an installed Chrome, Edge or Chromium (nothing is downloaded). It can also package the artifact as one self-contained HTML file or a deploy-ready site folder, which needs no browser. It calls the same code as the [`export_open_design_artifact`](tools.md#export_open_design_artifact) tool.

```bash
npx @feimacode/open-design-agent-kit export <entryPath> [options]
```

| Option | Meaning |
|---|---|
| `--format <png\|jpeg\|pdf\|pptx\|standalone\|site>` | Output format. Default `png`. `pptx` is for decks; `pdf` works for decks and pages. `standalone` is one self-contained `.html`; `site` is a deploy-ready folder. `jpg` is accepted for `jpeg`. |
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
| `--check` | Run [preflight](../guides/posters.md#preflight-checks) only; write no files. |
| `--data <file>` | A CSV, XLSX or JSON-array file (relative to the current directory): [one output per row](../guides/posters.md#one-per-row-from-a-spreadsheet). |
| `--sheet <name>` | XLSX data: the sheet to read. Default: the first. |
| `--name-field <column>` | The data column that names each row's file. Default: row numbers. |
| `--split` | PDF data exports: one PDF per row instead of one multi-page PDF. |
| `--presets <list>` | Fluid designs: several shapes in one export, comma-separated, e.g. `a3,ig-portrait,story`. |
| `--shape-sheet` | Fluid designs: also write `<name>-shapes.png`, the design at every shape (all formats unless `--presets`). |
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

Renders a registered artifact with an installed Chrome, Edge or Chromium and prints its [preflight](../guides/posters.md#preflight-checks) findings: a page at desktop and mobile widths, a card design at its format size, a deck slide by slide. It writes nothing unless you ask for the screenshots. It calls the same code as the [`check_open_design_artifact`](tools.md#check_open_design_artifact) tool.

```bash
npx @feimacode/open-design-agent-kit check <entryPath> [options]
```

| Option | Meaning |
|---|---|
| `--viewport <name:WxH>` | Pages: a viewport to check instead of desktop `1440x900` and mobile `390x844`, e.g. `tablet:768x1024`. Repeat for several (at most 4). |
| `--slides <list>` | Decks only: 1-based slide numbers, e.g. `1,3`. |
| `--screenshots <dir>` | Write the screenshots as JPEG files named after their labels (`desktop.jpg`, `mobile.jpg`, `slides-1-12.jpg`) to this folder. Without it, no screenshots are rendered. |
| `--max-images <n>` | With `--screenshots`: how many, 0–6. Default 3. |
| `--fail-on <error\|warning>` | Exit `1` when a finding at or above this severity exists, to gate CI. |
| `--browser <path>` | Browser executable. Default: [`OPEN_DESIGN_BROWSER_PATH`](settings-and-env.md#open_design_browser_path), then auto-detect. |
| `--workspace <dir>` | Workspace root. Default: the nearest folder above the entry file that contains `.open-design/`, else the current directory. |

Output: the findings on **stdout**, then each written screenshot's absolute path. Exit code `0` when the check ran (findings don't fail it unless `--fail-on` says so), `1` when it couldn't run (no browser, not registered…; the error is printed to stderr).

```bash
# Fail a CI job when a page scrolls sideways on phones or has clipped text
npx @feimacode/open-design-agent-kit check .open-design/landing/landing.html --fail-on error

# Save what the agent sees
npx @feimacode/open-design-agent-kit check .open-design/pitch/pitch.html --screenshots ./check-shots
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
