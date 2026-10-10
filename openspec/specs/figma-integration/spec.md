# figma-integration Specification

## Purpose
Work with Figma in both directions through the user's Figma MCP connection. Turn Figma frames into Open Design artifacts without an access token, and push artifacts into Figma as editable layers from any agent. A shared capture feeds pre-built code parts. Token and import-plugin paths remain as fallbacks.
## Requirements
### Requirement: Connector-First Figma Pull
`pull_open_design_figma_frame` SHALL work without a Figma access token on both the VS Code extension and the MCP server. Its instructions SHALL direct the agent to call `list_open_design_integrations` with `integration: "figma"` and check its own tools, including deferred ones.

When Figma is connected, they SHALL:
1. load Figma's `figma-design-to-code` guidance before `get_design_context`;
2. call `get_design_context` with the fileKey and nodeId parsed from the link;
3. call `get_variable_defs` for the frame's variables;
4. call `get_screenshot` for visual comparison;
5. treat the returned code as a reference to translate into a registered Open Design artifact.

When a token is configured, the structural summary and image SHALL also be included as ground truth. When neither Figma nor a token is available, the instructions SHALL offer Figma setup once and otherwise explain how to configure a token.

#### Scenario: No token configured
- **WHEN** the tool is called with a frame link and no token is configured
- **THEN** it SHALL return connector-first instructions instead of an error

#### Scenario: Link parsing
- **WHEN** the link is `https://www.figma.com/design/<key>/Name?node-id=12-345`
- **THEN** the instructions SHALL pass fileKey `<key>` and nodeId `12:345` to Figma's tools

#### Scenario: Link without a node
- **WHEN** the link has no `node-id`
- **THEN** the tool SHALL ask for a link to a specific frame and SHALL NOT guess a node

### Requirement: Shared Figma Capture
The layer capture SHALL be one self-contained, DOM-only function in core, used both by the VS Code preview and by a headless-browser runner. Both SHALL produce the same capture IR (version 1) for the same rendered page.

#### Scenario: Headless capture
- **WHEN** a registered artifact is captured with the headless runner
- **THEN** a capture IR with resolved image data SHALL be written to `<entry>.od-figma.json`, as the preview's capture is today

### Requirement: Figma Push Parts
The system SHALL turn a capture into ready-to-run `use_figma` code parts under `exports/figma/`. Images SHALL be extracted to files and replaced by references. Each part SHALL:
- be at most 30,000 characters;
- parse as valid JavaScript;
- find its parent layers by marker names, without relying on state from earlier calls.

The last part SHALL remove the markers and return the container id and the node ids that need images. The first part SHALL place the container away from the canvas origin.

#### Scenario: Large capture split
- **WHEN** a capture's builder code would exceed 30,000 characters
- **THEN** it SHALL be split into several parts, each within the limit, that together build every captured node

#### Scenario: Images extracted
- **WHEN** the capture contains image fills
- **THEN** each image SHALL be written as a file, and the clean-up part's result SHALL map every image reference to the node id that receives it

### Requirement: Figma Push Tool
`push_open_design_artifact_to_figma` SHALL be available on both hosts with `entryPath` and an optional `refresh`. It SHALL capture (reusing a capture newer than the entry file unless `refresh` is set), write the parts and images, and return instructions to:
1. look up the Figma integration;
2. ask the user whether to add to an existing file (by link) or a new file (`whoami`, then `create_new_file`), and wait for their answer;
3. load `figma-use`;
4. run every part verbatim with `use_figma`, stopping on an error;
5. upload images with `upload_assets` to the returned node ids;
6. verify with `get_screenshot`;
7. share the file link.

When Figma isn't connected, the instructions SHALL offer setup once and otherwise give the import-plugin steps. The tool SHALL NOT contact Figma itself.

#### Scenario: Target choice before writing
- **WHEN** the instructions are composed
- **THEN** they SHALL require the user's choice of target file before any `use_figma` or `create_new_file` call

#### Scenario: Plugin fallback
- **WHEN** Figma isn't connected and the user declines setup
- **THEN** the instructions SHALL give the import-plugin steps using the written `.od-figma.json`

### Requirement: Push Hand-Off From the Preview
After the VS Code preview's "Export → Figma" writes a capture, the notification SHALL offer to push it with the Figma connection, by opening chat with a request to call `push_open_design_artifact_to_figma` for that artifact. It SHALL still offer "Copy JSON" and "Show Import Plugin".

#### Scenario: Three choices
- **WHEN** a capture is written from the preview
- **THEN** the notification SHALL offer "Push with Figma connection", "Copy JSON" and "Show Import Plugin"

