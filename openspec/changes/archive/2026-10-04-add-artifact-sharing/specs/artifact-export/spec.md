## ADDED Requirements

### Requirement: Standalone HTML Export
`export_open_design_artifact` (VS Code tool, MCP tool) and the CLI `export` command SHALL accept `format: "standalone"` for artifacts of kind `html`, `mini-app` and `deck`. It SHALL write one self-contained file, `<artifact-dir>/exports/<entry-basename>.html`. In that file, every workspace-local stylesheet, `@import`, CSS `url()`, classic and module script, image (including `srcset`), font and worker referenced by the entry SHALL be inlined. Remote (`http:`/`https:`) references SHALL be left unchanged and listed in the result's `warnings`. The source files SHALL NOT be modified.

#### Scenario: Artifact with sibling stylesheet and image
- **WHEN** an artifact whose entry links `./styles.css` (which uses `url(./bg.png)`) and contains `<img src="assets/logo.svg">` is exported with `format: "standalone"`
- **THEN** `exports/<name>.html` SHALL contain the stylesheet inline and both images as `data:` URLs, and opening it from any folder SHALL render without requests to workspace paths

#### Scenario: Remote font left in place
- **WHEN** the entry links a Google Fonts stylesheet
- **THEN** the link SHALL be preserved and the result's `warnings` SHALL name that URL as an external dependency

#### Scenario: Missing local dependency
- **WHEN** the entry references `./missing.js`, which does not exist
- **THEN** the export SHALL fail with a structured error naming `missing.js` and its reference chain, and SHALL write no file

#### Scenario: Reference escaping the workspace
- **WHEN** the entry references `../../../etc/passwd`
- **THEN** the export SHALL fail with a path-outside-workspace error and SHALL NOT read that file

### Requirement: Site Bundle Export
`export_open_design_artifact` and the CLI `export` command SHALL accept `format: "site"` for artifacts of kind `html`, `mini-app` and `deck`. It SHALL replace `<artifact-dir>/exports/site/` with a folder containing:
- the entry, rewritten to `index.html`, with its relative references adjusted
- every workspace file reachable from the entry's HTML references, inline CSS references, linked CSS (recursively), relative `import`/`export from`/`import()` specifiers of local and inline scripts (recursively; bare specifiers are left alone), and the manifest's `supportingFiles`, at paths relative to the entry's folder

The result SHALL list each file with its size, the total bytes, and preflight warnings. When any reference is missing or outside the workspace, the export SHALL fail with code `missing-references` listing them, and SHALL leave no partial bundle.

#### Scenario: Bundle layout
- **WHEN** `.open-design/pitch/pitch.html` referencing `assets/hero.jpg` is exported with `format: "site"`
- **THEN** `.open-design/pitch/exports/site/index.html` and `.open-design/pitch/exports/site/assets/hero.jpg` SHALL exist, and `index.html`'s reference SHALL resolve to the copied image

#### Scenario: Module imports are bundled
- **WHEN** the entry loads `<script type="module" src="app.js">` and `app.js` imports `./lib/dep.js` and `react`
- **THEN** the bundle SHALL contain `app.js` and `lib/dep.js`, and SHALL NOT fail over the bare `react` specifier

#### Scenario: Re-export replaces the bundle
- **WHEN** the artifact drops an image and is exported as `site` again
- **THEN** the dropped image SHALL no longer be present in `exports/site/`

### Requirement: Packaging Formats Need No Browser
The `standalone` and `site` formats SHALL complete without discovering or launching a browser, and SHALL succeed on a machine with no Chromium-family browser installed.

#### Scenario: Export on a machine with no browser
- **WHEN** no browser is configured or installed and an artifact is exported with `format: "site"`
- **THEN** the export SHALL succeed and SHALL NOT return the `no-browser` error

## MODIFIED Requirements

### Requirement: Document Export Formats
`export_open_design_artifact` (VS Code tool, MCP tool) and the CLI `export` command SHALL accept `format` values `png`, `jpeg`, `pdf`, `pptx`, `standalone` and `site`, the arguments `deck` (boolean) and `slides` (1-based slide numbers), and the argument `badge` (boolean; CLI `--badge`/`--no-badge`), which applies only to `standalone` and `site`. `pdf` and `pptx` SHALL be routed to deck or page export per the deck-detection rules. `maxBytes` SHALL apply only to image formats; for `pdf`/`pptx`, an output over `maxBytes` SHALL produce a warning, not re-encoding. `scale` SHALL default to 2 for `pdf`/`pptx` deck exports and to 1 otherwise.

#### Scenario: CLI deck to PPTX
- **WHEN** `open-design-agent-kit export .open-design/pitch/pitch.html --format pptx` is run for a registered deck
- **THEN** `.open-design/pitch/exports/pitch.pptx` SHALL be written, its path printed to stdout, and the process SHALL exit 0

#### Scenario: Result reports slides
- **WHEN** a deck is exported as PPTX or PDF through any host
- **THEN** the result SHALL report the output path, the slide count, the stage size and scale used, and any warnings

#### Scenario: CLI standalone export
- **WHEN** `open-design-agent-kit export .open-design/pitch/pitch.html --format standalone` is run
- **THEN** `.open-design/pitch/exports/pitch.html` SHALL be written, its path printed to stdout, and the process SHALL exit 0

### Requirement: Accurate Export Formats in Manifests
Artifacts registered or remixed SHALL record in their manifest's `exports` only the formats this system can produce for that kind:
- `html`/`mini-app` → `html, standalone, site, png, jpeg, pdf`
- `deck` → `html, standalone, site, png, jpeg, pdf, pptx`
- `svg`/`diagram` → `svg, png, jpeg`
- `markdown-document` → `md`
- `react-component` → `jsx`
- `code-snippet` → `txt`
- `design-system` → `md`

The manifest validator SHALL accept `png`, `jpeg`, `pptx`, `standalone` and `site`. Export requests for a format outside the artifact kind's list SHALL fail with a message listing the supported formats, with two exceptions: an explicit `deck: true` SHALL make the `deck` list apply (for artifacts registered as `html` that really are decks), and `standalone`/`site` SHALL be accepted for `html`, `mini-app` and `deck` kinds even when an older manifest's stored `exports` omits them. Existing manifests SHALL NOT be rewritten.

#### Scenario: New deck registration
- **WHEN** an artifact is registered with kind `deck`
- **THEN** its manifest `exports` SHALL be `["html", "standalone", "site", "png", "jpeg", "pdf", "pptx"]`, with no `zip`

#### Scenario: html-registered deck with explicit flag
- **WHEN** an artifact of kind `html` that contains slides is exported with `format: "pptx"` and `deck: true`
- **THEN** it SHALL be exported as a deck PPTX

#### Scenario: Unsupported format for kind
- **WHEN** an artifact of kind `html` is exported with `format: "pptx"` and no `deck: true`
- **THEN** the export SHALL fail, stating that PPTX applies to decks and listing the kind's supported formats

#### Scenario: Older manifest without packaging formats
- **WHEN** an artifact registered before this change (manifest `exports` of `["html", "png", "jpeg", "pdf"]`) is exported with `format: "standalone"`
- **THEN** the export SHALL succeed and the manifest's `exports` SHALL NOT be rewritten

#### Scenario: Packaging format on an SVG artifact
- **WHEN** an artifact of kind `svg` is exported with `format: "site"`
- **THEN** the export SHALL fail with `unsupported-format` listing `svg, png, jpeg`
