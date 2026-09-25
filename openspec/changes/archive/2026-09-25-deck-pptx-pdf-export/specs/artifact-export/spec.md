## ADDED Requirements

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
