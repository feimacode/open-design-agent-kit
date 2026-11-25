## MODIFIED Requirements

### Requirement: Artifact Preview Guidance
The Claude-facing skills SHALL tell the agent that, when it has an Artifact tool, it offers once per design, as one of the next steps when the design is first ready, to keep a private Claude artifact of it. It SHALL NOT ask before work starts, and SHALL publish only after the user agrees, with `publish_open_design_artifact` and `provider: "claude-artifact"`. Once the artifact exists, the agent SHALL republish to the recorded URL after each round of feedback it has applied, without asking again, and not after every small edit. The agent SHALL give the link the first time and afterwards say only that it was updated. The guidance SHALL be conditional on the Artifact tool being available, and skills generated for Codex and the VS Code instructions SHALL NOT contain it.

#### Scenario: Design ready
- **WHEN** the agent finishes a new poster in Claude Code with an Artifact tool available
- **THEN** it SHALL offer the Claude artifact in its closing next steps and SHALL NOT publish it yet

#### Scenario: User accepts
- **WHEN** the user says yes to the offer
- **THEN** the agent SHALL publish the artifact and give the link

#### Scenario: Feedback round
- **WHEN** the agent has applied the user's feedback to a design that has an artifact
- **THEN** it SHALL republish to the same artifact URL without asking

#### Scenario: No Artifact tool
- **WHEN** the same skill runs in Cursor or Codex
- **THEN** the agent SHALL NOT offer an artifact preview

## ADDED Requirements

### Requirement: Files List When Done
The shared voice rules SHALL tell the agent to end a finished design, and each export, with a **Files** list: the design file first, then every exported file. Where the host makes paths clickable, each entry SHALL be a Markdown link; elsewhere the folder SHALL be named in plain words; a `file://` link SHALL NOT be used. A line on where to see the design SHALL follow only when that place lasts beyond the reply, and a live preview address SHALL be marked as working only while the session is open.

#### Scenario: Poster exported in the Code tab
- **WHEN** the agent exports an A3 PDF of a poster in Claude Desktop's Code tab
- **THEN** its reply SHALL end with links to the poster's HTML file and the PDF, and say that clicking the design opens it in the Browser pane

#### Scenario: Chat without clickable paths
- **WHEN** the same happens in a chat whose paths aren't clickable
- **THEN** the reply SHALL name the folder in plain words instead of giving raw paths
