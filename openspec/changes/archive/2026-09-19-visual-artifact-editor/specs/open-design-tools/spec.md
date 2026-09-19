## ADDED Requirements

### Requirement: Live Artifact Preview Editor
The system SHALL provide a custom editor for HTML files (registered as an optional, non-default editor so it never replaces the built-in HTML editor) that renders a live, sandboxed preview of the file's current content, updating automatically when the underlying document changes. Registering an artifact via `register_open_design_artifact` SHALL automatically open this preview for HTML entries.

#### Scenario: Registering an HTML artifact opens its preview
- **WHEN** `register_open_design_artifact` succeeds for an entry ending in `.html`
- **THEN** the artifact preview editor SHALL open automatically for that file

#### Scenario: External changes update the live preview
- **WHEN** the underlying document is edited by any means (the model's own file-editing tools, a manual edit in the preview, or a direct text-editor edit) while the preview is open
- **THEN** the preview SHALL re-render to reflect the new content without requiring the editor to be reopened

### Requirement: Element-Anchored Comments With Chat Handoff, No Apply Engine
The system SHALL let a user pin a comment to a specific element in the live preview, persisted as a workspace-local sidecar file (`<entry>.comments.json`) rather than any external database. The system SHALL NOT provide any mechanism that applies a comment to the artifact automatically; instead, selected open comments SHALL be gathered into a scoped instruction and handed to a new chat message for the calling model to act on with its own file-editing tools, matching the same mechanism by which any other requested change is made. `get_open_design_artifact` SHALL surface open (unaddressed) comments in its response.

#### Scenario: Adding a comment persists it to the sidecar
- **WHEN** a user pins a comment on an element in the preview's Comment mode
- **THEN** a comment record (including an element/selector anchor and the note text) SHALL be written to `<entry>.comments.json`

#### Scenario: Sending comments to chat does not modify the artifact directly
- **WHEN** a user sends one or more open comments to chat
- **THEN** a new chat message SHALL be prefilled with a scoped instruction naming the targeted elements and their notes, and the artifact file SHALL remain unchanged until the calling model acts on that message with its own tools

#### Scenario: Pending comments are visible to the model
- **WHEN** `get_open_design_artifact` is invoked for an entry with unaddressed comments
- **THEN** its response SHALL include those comments so the model can address them before considering the task complete

### Requirement: Direct WYSIWYG Editing for HTML Artifacts
The system SHALL let a user directly edit an HTML artifact's rendered elements (text content, and a curated set of style properties: color, background color, font size, padding) or remove an element, from within the live preview, with changes written back to the underlying file through the standard editor edit/undo mechanism. This capability SHALL be limited to HTML artifacts; artifacts rendered via a non-HTML mechanism (e.g. JSX/react-component) SHALL remain preview-only.

#### Scenario: A direct text edit is written back with undo support
- **WHEN** a user edits an element's text in the preview's Edit mode and commits the change
- **THEN** the underlying file SHALL be updated to reflect that change, and undoing in the editor SHALL revert it

#### Scenario: Edit mode is unavailable for non-HTML artifacts
- **WHEN** the previewed artifact is not an HTML document (e.g. a JSX/react-component artifact)
- **THEN** the preview SHALL still render the artifact, but direct editing SHALL NOT be offered

### Requirement: Gallery Browsing and Remixing of Example Artifacts
The system SHALL vendor a pool of example artifacts (entries with an actual rendered starting file, distinct from skills/design-templates which describe a task or style but ship no rendered output) and expose them through the same unified catalog as skills and design-templates. The system SHALL provide a mechanism to copy a chosen example's rendered artifact into the workspace as a new file, register it, and instruct the calling model to modify that existing file as a targeted change rather than generate new content from scratch.

#### Scenario: An example entry is distinguishable from a task-only skill
- **WHEN** `list_open_design_skills` returns an entry sourced from the examples pool
- **THEN** that entry SHALL include a non-empty reference to its rendered starting artifact, distinguishing it from skills/design-templates that have none

#### Scenario: Remixing copies the file and returns a modification instruction
- **WHEN** an example with a rendered starting artifact is remixed
- **THEN** that artifact's content SHALL be copied into a new file in the workspace, registered as an OpenDesign artifact, and the returned instructions SHALL direct the calling model to modify the existing file rather than regenerate it from scratch

#### Scenario: Remixing an entry with no rendered artifact fails clearly
- **WHEN** remixing is attempted on a skill or design-template with no rendered starting artifact
- **THEN** the system SHALL explain that this entry has nothing to remix and suggest generating from scratch instead

#### Scenario: A native gallery browsing path exists alongside the tool
- **WHEN** a user runs the gallery-browsing command
- **THEN** they SHALL be able to search/select an example from a native picker and have it remixed and previewed without first typing anything in chat
