## MODIFIED Requirements

### Requirement: Connector-Aware Canva Instructions
`publish_open_design_artifact_to_canva` SHALL be available on both the VS Code extension and the MCP server with the input `entryPath`, and SHALL compose instructions without writing files or contacting Canva. After deriving metadata and exporting (`pptx` with `editable: true` for a deck, falling back to the picture `pptx` and telling the user when the editable export fails; `pdf` otherwise), the instructions SHALL:
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

#### Scenario: Deck goes to Canva as editable PPTX
- **WHEN** the instructions are composed for a registered deck
- **THEN** they SHALL export it with `format: "pptx"` and `editable: true`, and use the picture `pptx` only if that export fails, telling the user the Canva design will be pictures
