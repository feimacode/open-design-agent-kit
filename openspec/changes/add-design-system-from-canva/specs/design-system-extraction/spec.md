## ADDED Requirements

### Requirement: Canva Link Extraction

When `extract_open_design_design_system` is given a Canva design, template or short link as `url`, it SHALL NOT contact Canva. It SHALL return `status: "needs-canva-export"` with instructions to check the Canva connector through `list_open_design_integrations`, resolve a short link, check the design's export formats, export it as PPTX and as PNG for at most 4 pages, and call the tool again with those exports as `template` and `screenshot` sources.

#### Scenario: Design link
- **WHEN** the tool is called with `https://www.canva.com/design/DAF1234abcd/view`
- **THEN** it returns `needs-canva-export` with design id `DAF1234abcd` and the export steps, and fetches nothing

#### Scenario: Canva not connected
- **WHEN** the agent finds no Canva tools
- **THEN** the instructions offer Canva setup once and otherwise ask the person to export PPTX and PNG from Canva and attach them

### Requirement: Canva Export URLs as Sources

A `template` or `screenshot` source SHALL accept `fileUrl` only when its host, before and after redirects, is in the Canva export host allowlist in `integrations.json`. The server SHALL download it without credentials, within 20 MB and 30 seconds, on both the local server and the hosted gateway, and SHALL refuse any other host with a message naming it.

#### Scenario: Export link on the hosted gateway
- **WHEN** the hosted gateway receives a `template` source whose `fileUrl` is a Canva export download link
- **THEN** it downloads the PPTX and drafts from it

#### Scenario: Other host refused
- **WHEN** a source's `fileUrl` points at any other host
- **THEN** the call is refused and nothing is fetched

### Requirement: Canva Export Template Reading

For a PPTX exported from Canva, the template reader SHALL take fonts from the text runs on the slides, ranked by characters set, with the largest sizes as display and the most-used as body. A stock Office theme SHALL become candidates instead of roles. An image placed on most pages SHALL become a mark in the evidence bundle.

#### Scenario: Branded slides on a stock theme
- **WHEN** a Canva export has the default Office theme but every slide sets headings in "Playfair Display" and body in "Lato"
- **THEN** the draft has `--font-display` Playfair Display and `--font-body` Lato as `declared`, and the theme's colours are candidates, so the sampled slide colours fill the colour roles

### Requirement: Canva Brand Kit Guidance

When the person names a Canva Brand Kit, the instructions SHALL say that Canva's connector does not expose kit colours, fonts or logos. They SHALL ask once for a design or brand template made with the kit, and SHALL accept a brand guide or pasted values instead. The tool SHALL NOT sample the kit's thumbnail.

#### Scenario: Only a kit name
- **WHEN** the person says "use my Canva brand kit" and gives no design
- **THEN** the agent asks for one design or template made with it, explaining why

### Requirement: Canva Source Recorded

A draft built from Canva exports SHALL record `source: "canva"` with the design link, the export date and the exported page numbers, and the saved design system SHALL keep that record.

#### Scenario: Review shows the source
- **WHEN** the person opens the review page for a Canva-drafted system
- **THEN** it names the Canva design and the pages sampled
