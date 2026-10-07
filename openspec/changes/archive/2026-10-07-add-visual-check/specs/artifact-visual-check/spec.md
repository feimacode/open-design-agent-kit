## ADDED Requirements

### Requirement: Visual Check Tool
The system SHALL provide a `check_open_design_artifact` tool, taking `entryPath` (required) and optional `viewports`, `slides` and `maxImages`, that loads a registered HTML-based artifact (`html`, `deck-html`, `mini-app`, `svg`) in the export browser and returns screenshots as image content together with preflight findings. It SHALL NOT write files under the artifact directory or change the artifact manifest. It SHALL wait for render readiness the same way export does.

#### Scenario: Check after generating a landing page
- **WHEN** the agent calls `check_open_design_artifact` on a registered landing page
- **THEN** the result SHALL contain the formatted findings as text and at least one screenshot as image content, and no file SHALL be created or modified

#### Scenario: Unsupported renderer
- **WHEN** the artifact's renderer is `markdown` or `react-component`
- **THEN** the tool SHALL return an `unsupported-kind` error naming the supported renderers

#### Scenario: No browser
- **WHEN** no Chromium-family browser is configured or installed
- **THEN** the tool SHALL return the same structured `no-browser` error as export and SHALL NOT download a browser

### Requirement: Page Checks Across Viewports
For page artifacts with no `[data-od-card]` element, the tool SHALL check each viewport in `viewports`, defaulting to desktop 1440×900 and mobile 390×844. It SHALL run the preflight checks and the `horizontal-scroll` check at each viewport, tag each finding with the viewport name, and return at least one screenshot per viewport within the image limit. For artifacts with `[data-od-card]` elements, it SHALL check each card at its own size, as export does, and ignore `viewports`.

#### Scenario: Default viewports
- **WHEN** a page with no card is checked without `viewports`
- **THEN** findings SHALL be tagged `desktop` or `mobile`, and the images SHALL include one labelled `desktop` and one labelled `mobile`

#### Scenario: Card artifact
- **WHEN** an Instagram-portrait poster with one `data-od-card` is checked
- **THEN** one image of the card at 1080×1350 (downscaled per the image limit) SHALL be returned and no viewport tags SHALL appear

### Requirement: Horizontal Scroll Check
In viewport checks, the system SHALL report `horizontal-scroll` when the document is wider than the viewport by more than 1 px, naming the element that extends furthest past the right edge. It SHALL ignore elements inside containers whose `overflow-x` is `auto` or `scroll`, and fixed-position elements moved off-screen with a transform. Severity SHALL be `error` for viewports up to 480 px wide and `warning` otherwise. Card and poster exports SHALL NOT run this check.

#### Scenario: Fixed-width table on a phone
- **WHEN** a page contains a 900 px-wide table and is checked at the mobile viewport
- **THEN** a `horizontal-scroll` error tagged `mobile` SHALL name the table

#### Scenario: Intentional carousel
- **WHEN** the only content wider than the viewport sits inside an `overflow-x: auto` container
- **THEN** no `horizontal-scroll` finding SHALL be reported

### Requirement: Per-Slide Deck Checks
For `deck-html` artifacts, the tool SHALL step through the slides with the deck capture navigation, run preflight on each slide, tag findings with their 1-based slide number, and return the slides as a contact-sheet image of at most 12 slides. `slides` SHALL select which slides to check, validated like export's slide numbers. When the slide count can't be determined, it SHALL check the page as a single view and add a warning saying so.

#### Scenario: Text overflow on slide 4
- **WHEN** slide 4 of a 10-slide deck has a clipped paragraph
- **THEN** an `overflow` finding tagged slide 4 SHALL be returned, along with one contact-sheet image of slides 1–10

#### Scenario: Large deck
- **WHEN** a 30-slide deck is checked without `slides`
- **THEN** all 30 slides SHALL be preflighted, the contact sheet SHALL show slides 1–12, and the text SHALL say how to pass `slides` to see the others

### Requirement: Bounded Image Cost
Each returned image SHALL have a long edge of at most 1568 px and SHALL be JPEG encoded. A call SHALL return at most `maxImages` images (default 3, maximum 6); `maxImages: 0` SHALL return findings only. When images are dropped to meet the limit, the text SHALL list what was omitted.

#### Scenario: Tall page, default limit
- **WHEN** a 6000 px-tall page is checked at the two default viewports
- **THEN** at most 3 images SHALL be returned, each with a long edge of at most 1568 px, and the text SHALL note the parts that were not included

#### Scenario: Findings only
- **WHEN** the tool is called with `maxImages: 0`
- **THEN** no image content SHALL be returned and the findings SHALL be complete

### Requirement: Images Delivered Natively per Host
The VS Code tool SHALL return the findings text as a `LanguageModelTextPart` followed by one `LanguageModelDataPart.image` per screenshot. The MCP server SHALL return a `text` content item followed by one `image` content item (base64 data with its MIME type) per screenshot. The text part SHALL always contain the complete findings, so a client that ignores images still gets the full check.

#### Scenario: MCP client
- **WHEN** an MCP client calls `check_open_design_artifact`
- **THEN** the response content SHALL start with a `text` item and contain one `image` item per screenshot, with `mimeType: "image/jpeg"`

#### Scenario: Other MCP tools unchanged
- **WHEN** any other tool is called on the MCP server
- **THEN** its response SHALL be the same single `text` content item as before

### Requirement: CLI Check Command
The `open-design-agent-kit` CLI SHALL provide `check <entryPath>`, accepting `--viewport <name:WxH>` (repeatable), `--slides`, `--max-images`, `--screenshots <dir>`, `--browser`, `--workspace` and `--fail-on <error|warning>`. It SHALL print the formatted findings, write images to `--screenshots` when given, and exit non-zero only on a load or browser failure, or when `--fail-on` is set and a finding at or above that severity exists.

#### Scenario: CI gate
- **WHEN** `check page.html --fail-on error` runs and a `horizontal-scroll` error is found
- **THEN** the findings SHALL be printed and the process SHALL exit non-zero

#### Scenario: Warnings only
- **WHEN** `check page.html` runs without `--fail-on` and finds warnings
- **THEN** the process SHALL exit 0

### Requirement: Check-Before-Done Guidance
The instructions shipped to every host (VS Code chat instructions, the Claude Code and Codex `open-design` skills) SHALL tell the agent to call `check_open_design_artifact` after creating or substantially editing an artifact and before reporting it as done; to fix every `error`; to review the images for composition problems the checks can't measure; to stop after at most two fix rounds and tell the user about any remaining findings; and, when the result is `no-browser`, to skip the check and tell the user once that visual checking needs Chrome, Edge or Chromium.

#### Scenario: Instruction sources stay in sync
- **WHEN** the instruction files are generated or checked for drift
- **THEN** each host's instructions SHALL contain the check-before-done guidance naming `check_open_design_artifact`
