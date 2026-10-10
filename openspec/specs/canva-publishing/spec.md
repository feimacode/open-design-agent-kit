# canva-publishing Specification

## Purpose
Get a finished artifact into Canva through the user's Canva MCP connector when it's connected: an editable import via a briefly hosted export, or a private upload, chosen by the user each time. Keep Canva's manual import as the fallback. Our code never talks to Canva itself.
## Requirements
### Requirement: Connector-Aware Canva Instructions
`publish_open_design_artifact_to_canva` SHALL be available on both the VS Code extension and the MCP server with the input `entryPath`, and SHALL compose instructions without writing files or contacting Canva. After deriving metadata and exporting (`pptx` for a deck, `pdf` otherwise), the instructions SHALL:
1. direct the agent to call `list_open_design_integrations` with `integration: "canva"`;
2. have it check its own tools, including deferred ones, for Canva's tools.

When Canva is connected, the instructions SHALL:
- describe route A (editable import through a temporary public link) and route B (private upload into Canva's Uploads);
- recommend A;
- require the user's choice before continuing.

When Canva isn't connected, they SHALL offer setup once per the integration rules. If the user declines, or setup fails, they SHALL continue with the manual import steps (route C).

#### Scenario: Canva tool available on the MCP server
- **WHEN** an MCP client calls `publish_open_design_artifact_to_canva` with a registered artifact's `entryPath`
- **THEN** it SHALL return the same instructions the VS Code tool returns for that artifact

#### Scenario: Route choice required
- **WHEN** the instructions are composed for any registered artifact
- **THEN** they SHALL describe routes A and B, recommend A, and tell the agent to wait for the user's choice before hosting or uploading anything

#### Scenario: Manual fallback kept
- **WHEN** Canva isn't connected and the user declines setup
- **THEN** the instructions SHALL direct the agent to hand over the exported file with Canva's own Import a file steps

### Requirement: Editable Import Route
Route A SHALL host the exported file by calling `publish_open_design_artifact` with `includeFiles` set to the export, following that tool's own confirmation stage. It SHALL use `cloudflare-temporary` or one of the user's own hosts, and SHALL NOT use `netlify-temporary`, whose links Canva can't fetch.

It SHALL then:
- call Canva's `import-design-from-url` with the file's public URL, the derived name and, when one maps, `intended_design_type`;
- verify the result with `read-design` (metadata and thumbnails);
- share the design's edit link.

A Brand Template SHALL be published with `publish-brand-template` only after an explicit yes. The instructions SHALL tell the agent to ask the user to reconnect the Canva connector when Canva reports missing scopes.

#### Scenario: Never the password-protected host
- **WHEN** route A instructions are composed
- **THEN** they SHALL name `cloudflare-temporary` or the user's own host and SHALL state that `netlify-temporary` can't be used

#### Scenario: Brand Template gated
- **WHEN** route A succeeds
- **THEN** the instructions SHALL offer a Brand Template, explain that it needs a Canva plan with brand templates, and call `publish-brand-template` only after the user agrees

### Requirement: Private Upload Route
Route B SHALL:
1. call Canva's `create-upload-url`;
2. POST the export's raw bytes to the returned URL with `Content-Type: application/octet-stream`;
3. tell the user that the file is in Canva's Uploads and becomes an editable design when they open it there.

It SHALL NOT claim a design was created. A used or expired upload URL SHALL be replaced by calling `create-upload-url` again.

#### Scenario: Upload is not a design
- **WHEN** route B instructions are composed
- **THEN** they SHALL include the `curl` POST with the octet-stream header and SHALL state that the result is a file in Uploads, not a design

### Requirement: Canva Design Type Mapping
The system SHALL map an artifact's kind and canvas format to Canva's `intended_design_type`. The mapping SHALL include:
- a deck → `presentation`;
- `ig-square` and `ig-portrait` → `instagram_post`;
- `story` → `your_story`;
- `x-image` → `twitter_post`;
- `yt-thumbnail` → `youtube_thumbnail`;
- `a4` → `a4`;
- `letter` → `us_letter`;
- `a3`, `a2`, `a1`, `a0`, `tabloid` and `poster-*` formats → `poster`.

Unmapped artifacts SHALL leave the type out.

#### Scenario: Deck becomes a presentation
- **WHEN** the instructions are composed for an artifact registered with kind `deck`
- **THEN** the import step SHALL pass `intended_design_type: "presentation"`

#### Scenario: Unmapped format
- **WHEN** the artifact has no recorded format and isn't a deck
- **THEN** the import step SHALL omit `intended_design_type`

