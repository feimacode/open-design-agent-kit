## ADDED Requirements

### Requirement: Extraction Sources

`extract_open_design_design_system` SHALL accept `sources`, up to 6 entries of kind `screenshot` (a workspace image path, or image data up to 4 MB), `css` (a workspace file or text: CSS, a Tailwind config or a W3C design tokens file), `html` (page source text up to 2 MB), `brandGuide` (a workspace document path) or `template` (a `.pptx` or `.potx` path, or file data up to 20 MB), with or without `url`, and SHALL return the same draft shape as a URL extraction.

#### Scenario: Screenshot only
- **WHEN** the tool is called with only a screenshot of a landing page
- **THEN** it returns a draft with `--bg`, `--fg` and `--accent`, each sourced as `sampled` with a crop, and a note that fonts need confirming

#### Scenario: Blocked page then CSS
- **WHEN** a URL extraction returned `blocked` and the person pastes the site's CSS
- **THEN** a call with that `css` source returns a draft whose roles come from the declarations

### Requirement: Source Confidence

Each drafted token SHALL record how it was found: `measured`, `declared`, `stated` or `sampled`; when sources give different values for a token, the draft SHALL take the value in that order of preference and SHALL list the others under `conflicts` with their source.

#### Scenario: Guide and site disagree
- **WHEN** the brand guide states Primary `#0052cc` and the rendered site's primary button measures `#0747a6`
- **THEN** the draft `--accent` is `#0747a6` (measured) and `conflicts` lists `#0052cc` from the brand guide

### Requirement: Roles From Names Only

For `css`, `html` and token-file sources, the tool SHALL assign a contract role only when a selector (`body`, `a`, `button`, a primary button class) or a token name (`primary`, `background`, `foreground`, `muted`, `border`, `success`, `danger`, `warning`) says what it is, and SHALL return other values as candidates without a role.

#### Scenario: Unnamed colour stays a candidate
- **WHEN** a stylesheet declares `--blue-600: #2563eb` and nothing uses a role name for it
- **THEN** `#2563eb` is a candidate and no role is drafted from it

### Requirement: Brand Guide Reading

For a `brandGuide` source, the tool SHALL read colour codes (hex, RGB, CMYK converted to sRGB and labelled as converted, Pantone names as given) and font names with their nearby labels, map "Primary", "Secondary", "Background" and "Text" labels to roles, and return the rest as candidates.

#### Scenario: Guide with a CMYK primary
- **WHEN** a guide lists "Primary — CMYK 100 80 0 30" with no hex value
- **THEN** `--accent` is drafted from the converted value and its source says it was converted from CMYK

### Requirement: PowerPoint Template Reading

For a `template` source, the tool SHALL read the theme's colour scheme and fonts without a browser or network, map light 1, dark 1, light 2, dark 2 and accent 1 to `--bg`, `--fg`, `--surface`, `--fg-2` and `--accent`, record accents 1 to 6 as the chart palette, map the major and minor fonts to `--font-display` and `--font-body`, take title and body sizes from the slide master as a type scale, and save images placed on the master as marks; all its values SHALL be sourced as `declared`.

#### Scenario: Branded template
- **WHEN** a `.potx` has accent 1 `#E4002B`, light 1 white, dark 1 `#1A1A1A`, heading font "Montserrat" and body font "Open Sans", and a logo on its master
- **THEN** the draft has `--accent: #e4002b`, `--bg: #ffffff`, `--fg: #1a1a1a`, the two font stacks, and the logo in the evidence bundle's marks

#### Scenario: Stock Office theme
- **WHEN** the template uses the default Office theme colours and fonts
- **THEN** the tool reports that the template has no brand theme and drafts no colour or font tokens from it

#### Scenario: Legacy binary file
- **WHEN** the `template` path ends in `.ppt`
- **THEN** the tool refuses it and asks for the file saved as `.pptx`

### Requirement: Sources-Only Mode on the Hosted Gateway

The hosted gateway SHALL offer `extract_open_design_design_system` with `sources` and SHALL refuse `url` with a message telling the agent to fetch the page and stylesheets itself and pass them as `html` and `css`; the gateway SHALL NOT fetch any address while handling the call.

#### Scenario: ChatGPT with the hosted connector
- **WHEN** the agent on the hosted gateway calls the tool with `url`
- **THEN** the call is refused with that message, and a call with the fetched `html` and `css` returns a draft
