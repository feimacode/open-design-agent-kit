# design-system-extraction Specification

## Purpose
Draft design systems from Figma files and frames, using connector-provided variables or token-based published styles while preserving role mapping, mode provenance, source metadata, and export follow-up.

## Requirements
### Requirement: Figma Link Extraction

When `extract_open_design_design_system` is given a Figma file or frame link as `url`, it SHALL NOT contact Figma. It SHALL return `status: "needs-figma-read"` with instructions to check the Figma connector, load Figma's required guidance, find token frames, logo frames and the primary button with `get_metadata`, call `get_variable_defs` on each, call `search_design_system` for variable names, collections, scopes and descriptions, and call the tool again with the results as a `figma` source.

#### Scenario: File link
- **WHEN** the tool is called with `https://www.figma.com/design/AbC123/Brand`
- **THEN** it returns `needs-figma-read` with file key `AbC123` and the steps, and fetches nothing

#### Scenario: Figma not connected and no token
- **WHEN** the agent finds no Figma tools and no Figma token is configured
- **THEN** the instructions offer Figma setup once and otherwise suggest a screenshot of the foundations page as a `screenshot` source

### Requirement: Figma Source

A `figma` source SHALL take a file link, frames with node id, name and a variable map, and optional design-system items. Its values SHALL be `declared`. Names SHALL be normalised by stripping `var(--…)` and turning `/` into `-`, keeping the original Figma name for the review. Keys that aren't names SHALL be skipped and listed.

#### Scenario: Variable map
- **WHEN** a frame's map has `{"color/bg/default": "#FFFFFF", "color/text/primary": "#111111"}`
- **THEN** the draft has `--bg` `#ffffff` and `--fg` `#111111`, both `declared`, with their Figma names

### Requirement: Roles From Figma Scopes

The tool SHALL assign roles from Figma variable names and scopes: fill scopes with background names to `--bg` or `--surface`, text fill scope to text tiers, stroke scope to `--border`, corner radius scope to radius steps, gap and size scopes to spacing, and font variables to the type scale. The primary button's fill and text variables SHALL give `--accent` and its foreground when no name says primary. Other values SHALL stay candidates.

#### Scenario: Accent from the button
- **WHEN** no variable is named primary or accent, and the button's fill variable is `brand/500` `#5B3DF5`
- **THEN** `--accent` is `#5b3df5` with a note that it came from the button

### Requirement: One Mode Reported

The draft SHALL use the resolved values of the mode the frames show. It SHALL list the file's other collections and modes, when the design-system search names them, as not read, and SHALL note that aliases arrive as resolved values.

#### Scenario: Light and dark modes in the file
- **WHEN** the design-system search shows a "Theme" collection with Light and Dark modes
- **THEN** the draft has one theme and lists Dark as not read

### Requirement: Figma Styles Fallback

When Figma isn't connected and a Figma token is configured on the local server, the tool SHALL read the file's published fill, text and effect styles through Figma's REST API and draft from them as `declared`. It SHALL NOT call the variables REST API.

#### Scenario: Token only
- **WHEN** a token is configured and the file publishes `Primary/500` as a fill style
- **THEN** the draft takes it as an accent candidate named from the style

### Requirement: Figma Source Recorded and Claude Export Offered

A draft built from Figma SHALL record `source: "figma"` with the file link, frame links and date. After saving, the skill SHALL offer `export_open_design_design_system` to make the same system in Claude Design's format.

#### Scenario: Saved from Figma
- **WHEN** the person saves a Figma-drafted system
- **THEN** the agent offers once to export it for Claude Design
