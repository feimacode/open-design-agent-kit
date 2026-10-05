## MODIFIED Requirements

### Requirement: Poster Flow
The workflow SHALL direct the agent to:
1. Establish the medium and a default shape. Ask print or screen when the brief doesn't say, and never guess between them. Take a size the user names; otherwise default to A3 for print and Instagram portrait for screen, saying the shape can change later.
2. Optionally run a design exploration when the user asks for options.
3. Prepare the brief with that `format` and `fluid: true`, and author the file.
4. Create real QR codes with `create_open_design_qr_code` when the poster needs one.
5. Register with `format`.
6. Run export with `checkOnly: true` and fix every error.
7. When the user wants other sizes, or before the final export of a print piece, make a shape sheet (`shapeSheet: true, checkOnly: true`) and fix shapes with errors by tuning the master (`adapt_open_design_artifact` returns the tuning instructions).
8. Export with `preset` or `presets`, adding `data` for per-row output when the user supplies a list.
9. Report each file's path, size and any remaining warnings. For print output, also report the bleed and trim sizes and the RGB note.

It SHALL NOT post, print, upload or order anything.

#### Scenario: Print poster end to end
- **WHEN** the user asks for "an A2 poster for our hackathon with a QR code to the signup page"
- **THEN** the flow SHALL end with an A2 print PDF with bleed, from a fluid design, with a QR code that preflight verified, and the report SHALL include the trim and bleed sizes and the RGB note

#### Scenario: Poster plus social versions
- **WHEN** the user asks for the poster "and versions for Instagram and Stories"
- **THEN** the flow SHALL make a shape sheet for `ig-portrait` and `story`, fix any failing shape in the master, and export all shapes with `presets`, without generating new files
