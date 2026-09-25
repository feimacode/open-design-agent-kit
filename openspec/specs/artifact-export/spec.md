# artifact-export Specification

## Purpose
Turn a registered Open Design artifact into files ready to upload or share (PNG/JPEG images, deck PPTX/PDF, page PDF, and daemon-free HyperFrames MP4 renders). The same export runs in the VS Code tool, the MCP tool and the CLI, uses an already-installed Chromium-family browser, and writes next to the artifact under `exports/`.
## Requirements
### Requirement: Raster Export of Registered Artifacts
The system SHALL provide an `export_open_design_artifact` tool, in both the VS Code language-model tool surface and the MCP server, that renders a registered HTML artifact's entry file in a headless Chromium-family browser and writes it as PNG (default) or JPEG. The tool SHALL NOT write or modify the artifact's own source files.

#### Scenario: Export a single-image artifact
- **WHEN** `export_open_design_artifact` is invoked with the `entryPath` of a registered HTML artifact and no other arguments
- **THEN** exactly one PNG SHALL be written under `<artifact-dir>/exports/`, and the result SHALL list its workspace-relative path, pixel width and height, and the size source used

#### Scenario: Unregistered or missing entry
- **WHEN** the tool is invoked with an `entryPath` that doesn't exist or has no manifest sidecar
- **THEN** it SHALL return a clear "not found / not registered" result without launching a browser

#### Scenario: JPEG output
- **WHEN** the tool is invoked with `format: "jpeg"` and a `quality` between 1 and 100
- **THEN** the output file SHALL be a JPEG with the `.jpg` extension, encoded at that quality

### Requirement: Export Size Resolution
The system SHALL determine the capture size in this order: (1) explicit `width` and `height`; (2) the first `W×H` pair parsed from the `aspect_hint` of the catalog entry named by the manifest's `sourceSkillId`; (3) when `selector` is given, each matched element's bounding box; (4) 1080×1080. A `scale` argument (1–3, default 1) SHALL multiply output pixels without changing layout size. The result SHALL report which rule applied.

#### Scenario: Size taken from the source skill
- **WHEN** an artifact registered with `sourceSkillId` `od:prototype:card-twitter` (aspect_hint `"1600×900 (16:9)"`) is exported with no size arguments
- **THEN** the PNG SHALL be 1600×900 pixels and the result SHALL report the size source as the skill's aspect hint

#### Scenario: Explicit size wins
- **WHEN** the same artifact is exported with `width: 1080, height: 1350`
- **THEN** the PNG SHALL be 1080×1350 pixels

#### Scenario: Unparseable hint falls back
- **WHEN** the source skill's `aspect_hint` has no `W×H` pair (e.g. `"A4 / 长页面"`) and no size or selector is given
- **THEN** the export SHALL use 1080×1080 and the result SHALL say so

#### Scenario: High-DPI export
- **WHEN** an artifact is exported at 1280×720 with `scale: 2`
- **THEN** the PNG SHALL be 2560×1440 pixels

### Requirement: Per-Element Multi-Image Export
When a `selector` is supplied, the system SHALL write one image per matching element, in document order. When more than one element matches, files SHALL be named `<entry-basename>-NN.<ext>` with a two-digit, 1-based index; a single match SHALL use the plain `<entry-basename>.<ext>`. When the selector matches nothing, the tool SHALL return an error and write no files.

#### Scenario: Carousel with three cards
- **WHEN** an artifact containing three elements marked `data-od-card` is exported with `selector: "[data-od-card]"`
- **THEN** three files ending `-01.png`, `-02.png` and `-03.png` SHALL be written, each cropped to its card

#### Scenario: Single-card post
- **WHEN** an artifact with exactly one `data-od-card` element is exported with `selector: "[data-od-card]"`
- **THEN** one file named `<entry-basename>.png` (no index suffix) SHALL be written, cropped to that element

#### Scenario: Selector matches nothing
- **WHEN** the selector matches zero elements
- **THEN** the tool SHALL return an error naming the selector and SHALL NOT write any file

### Requirement: Render Readiness Before Capture
The system SHALL wait for web fonts (`document.fonts.ready`) and network idle before capturing, with an upper bound of 15 seconds, and SHALL report any failed subresource requests as warnings in the result, not fail silently.

#### Scenario: A remote image fails to load
- **WHEN** the artifact references an image URL that returns 404
- **THEN** the export SHALL still complete and the result's `warnings` SHALL name the failed URL

### Requirement: Use an Installed Browser, Never Download One
The system SHALL use an explicitly configured browser path (VS Code setting or `OPEN_DESIGN_BROWSER_PATH`) if set. Otherwise it SHALL discover an installed Chrome, Edge or Chromium at well-known per-OS locations. The system SHALL NOT download or bundle a browser. When none is found, the tool SHALL return a structured error listing the locations checked and how to configure or install one.

#### Scenario: No browser available
- **WHEN** no configured path is set and no Chromium-family browser is installed
- **THEN** the tool SHALL return an error that lists the searched paths and names the `OPEN_DESIGN_BROWSER_PATH` override, and SHALL NOT throw an unstructured launch exception

#### Scenario: Configured path wins
- **WHEN** `OPEN_DESIGN_BROWSER_PATH` points to a valid browser executable
- **THEN** that executable SHALL be used even if others are installed

### Requirement: Export Bookkeeping
The system SHALL overwrite previous export files that have the same name, and SHALL record each export in the artifact manifest's `metadata.exports` as `{ path, width, height, scale, format, exportedAt }`, replacing earlier records for the same path.

#### Scenario: Re-export after editing
- **WHEN** an artifact is exported, edited, then exported again with the same arguments
- **THEN** the export file SHALL be replaced and `metadata.exports` SHALL contain one record for that path with the newer `exportedAt`

### Requirement: Daemon-Free Video Render for HyperFrames Artifacts
For the `hyperframes` design template, the brief returned by `prepare_open_design_brief` SHALL instruct the model to render the composition to MP4 using the HyperFrames CLI (`npx hyperframes render --output <artifact-dir>/exports/<name>.mp4`) from its own terminal, after validating it with the CLI's lint/check command and confirming FFmpeg is available, and SHALL tell it to ignore every instruction that dispatches through the Open Design daemon.

#### Scenario: YouTube video brief
- **WHEN** `prepare_open_design_brief` is called with the HyperFrames template's skill id
- **THEN** the returned instructions SHALL contain a host-override section, after the skill text, that names `npx hyperframes render`, an `exports/` MP4 output path and a 1920×1080 default, and that explicitly supersedes the daemon render step

#### Scenario: Missing FFmpeg
- **WHEN** the model follows the override and `ffmpeg -version` fails
- **THEN** the override's instructions SHALL direct the model to stop and tell the user to install FFmpeg rather than attempt another render path

### Requirement: Fit Within a Byte Budget
When a `maxBytes` argument is given and an export exceeds it, the system SHALL re-capture that image as JPEG at successively lower quality (90, 80, 70, 60, 50, 40) and keep the first result that fits. If none fits, it SHALL keep the smallest result and return a warning stating the final size and the budget.

#### Scenario: PNG over budget becomes a fitting JPEG
- **WHEN** a photo-heavy artifact whose PNG export is 3.1 MB is exported with `maxBytes: 2000000`
- **THEN** the written file SHALL be a `.jpg` of at most 2,000,000 bytes, and the result SHALL report the quality used

#### Scenario: Budget cannot be met
- **WHEN** even quality 40 exceeds `maxBytes`
- **THEN** the quality-40 file SHALL be kept and the result's `warnings` SHALL state its size and the budget

### Requirement: Non-Interactive CLI Export
The `open-design-agent-kit` CLI SHALL provide an `export <entryPath>` command that accepts the same options as the export tool (`--width`, `--height`, `--scale`, `--format`, `--quality`, `--selector`, `--max-bytes`, `--browser`, `--workspace`) and prints the written file paths, exiting non-zero on failure. It SHALL also provide `render-video <compositionDir> --output <file.mp4>`, which runs the HyperFrames CLI render and prints the exact command it runs.

#### Scenario: Scripted X image export
- **WHEN** `npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --max-bytes 5000000` is run in a workspace
- **THEN** the PNG (or fitted JPEG) SHALL be written under `.open-design/launch/exports/`, its path printed to stdout, and the process SHALL exit 0

#### Scenario: Missing browser in CI
- **WHEN** the export command runs with no discoverable browser
- **THEN** it SHALL print the structured not-found message to stderr and exit non-zero

### Requirement: Document Export Formats
`export_open_design_artifact` (VS Code tool, MCP tool) and the CLI `export` command SHALL accept `format` values `png`, `jpeg`, `pdf` and `pptx`, and the arguments `deck` (boolean) and `slides` (1-based slide numbers). `pdf` and `pptx` SHALL be routed to deck or page export per the deck-detection rules. `maxBytes` SHALL apply only to image formats; for `pdf`/`pptx`, an output over `maxBytes` SHALL produce a warning, not re-encoding. `scale` SHALL default to 2 for `pdf`/`pptx` deck exports and to 1 otherwise.

#### Scenario: CLI deck to PPTX
- **WHEN** `open-design-agent-kit export .open-design/pitch/pitch.html --format pptx` is run for a registered deck
- **THEN** `.open-design/pitch/exports/pitch.pptx` SHALL be written, its path printed to stdout, and the process SHALL exit 0

#### Scenario: Result reports slides
- **WHEN** a deck is exported as PPTX or PDF through any host
- **THEN** the result SHALL report the output path, the slide count, the stage size and scale used, and any warnings

### Requirement: Accurate Export Formats in Manifests
Artifacts registered or remixed SHALL record in their manifest's `exports` only the formats this system can produce for that kind: `html`/`mini-app` → `html, png, jpeg, pdf`; `deck` → `html, png, jpeg, pdf, pptx`; `svg`/`diagram` → `svg, png, jpeg`; `markdown-document` → `md`; `react-component` → `jsx`; `code-snippet` → `txt`; `design-system` → `md`. The manifest validator SHALL accept `png`, `jpeg` and `pptx`. Export requests for a format outside the artifact kind's list SHALL fail with a message listing the supported formats, except that an explicit `deck: true` SHALL make the `deck` list apply (for artifacts registered as `html` that really are decks). Existing manifests SHALL NOT be rewritten.

#### Scenario: New deck registration
- **WHEN** an artifact is registered with kind `deck`
- **THEN** its manifest `exports` SHALL be `["html", "png", "jpeg", "pdf", "pptx"]`, with no `zip`

#### Scenario: html-registered deck with explicit flag
- **WHEN** an artifact of kind `html` that contains slides is exported with `format: "pptx"` and `deck: true`
- **THEN** it SHALL be exported as a deck PPTX

#### Scenario: Unsupported format for kind
- **WHEN** an artifact of kind `html` is exported with `format: "pptx"` and no `deck: true`
- **THEN** the export SHALL fail, stating that PPTX applies to decks and listing the kind's supported formats

