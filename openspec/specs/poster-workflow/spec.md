# poster-workflow Specification

## Purpose
Ship a guided poster and print workflow in every host (print or screen, format, generate, QR code, check, adapt, bulk, export, report), and keep the social-post workflow on the same format presets.
## Requirements
### Requirement: Poster Entry Point in Every Host
The system SHALL ship a hand-written `open-design-poster` workflow from a single local prompt source, rendered as a VS Code prompt file, an MCP prompt, a Claude plugin skill and a Codex skill. In Claude Code and Codex it SHALL be eligible to load on its own: its description SHALL name poster, flyer and print-piece requests as its trigger, with no explicit-only flag.

#### Scenario: Agent picks it up without a command
- **WHEN** a Claude Code user asks for "an A3 poster for our meetup"
- **THEN** the `open-design-poster` skill SHALL be eligible to load without a slash command

#### Scenario: VS Code without the command
- **WHEN** a VS Code user asks for a poster without running `/open-design-poster`
- **THEN** the chat instructions SHALL direct the agent to the same flow and mention the command

### Requirement: Poster Flow
The workflow SHALL direct the agent to:
1. Establish the medium and format (ask when the brief names neither print nor a platform; never guess print versus screen).
2. Optionally run a design exploration when the user asks for options.
3. Prepare the brief with the chosen `format` and author the file.
4. Create real QR codes with `create_open_design_qr_code` when the poster needs one.
5. Register with `format`.
6. Run export with `checkOnly: true` and fix every error.
7. Adapt to further formats when asked.
8. Export with `preset`, adding `data` for per-row output when the user supplies a list.
9. Report each file's path, size and any remaining warnings. For print output, also report the bleed and trim sizes and the RGB note.

It SHALL NOT post, print, upload or order anything.

#### Scenario: Print poster end to end
- **WHEN** the user asks for "an A2 poster for our hackathon with a QR code to the signup page"
- **THEN** the flow SHALL end with an A2 print PDF with bleed, with a QR code that preflight verified, and the report SHALL include the trim and bleed sizes and the RGB note

#### Scenario: Poster plus social versions
- **WHEN** the user asks for the poster "and versions for Instagram and Stories"
- **THEN** the flow SHALL call `adapt_open_design_artifact` with `ig-portrait` and `story` and export each adaptation with its preset

### Requirement: Social Post Workflow Uses Presets
The social-post workflow's format table SHALL reference catalog format ids and export with `preset`, keeping the same sizes, selectors and byte budgets as before.

#### Scenario: X image via preset
- **WHEN** the social-post flow exports an X single image
- **THEN** it SHALL call export with `preset: "x-image"`, producing the same 1600×900 PNG under 5 MB as before

