## ADDED Requirements

### Requirement: HTML Diagram Contract
A diagram SHALL be an HTML artifact whose container carries `data-od-diagram` (`flow` by default, or `sequence`) and an optional `data-direction` (`right` by default, or `down`). In flow diagrams, nodes SHALL be elements with `data-od-node="<id>"`, a positive integer `data-rank` and `data-lane`, and optionally `data-group` and `data-od-source`; connections SHALL be hidden elements with `data-od-link`, `data-from`, `data-to` and optional `data-label`; groups SHALL be elements with `data-od-group="<id>"` and `data-label`. In sequence diagrams, participants SHALL be elements with `data-od-participant="<id>"` and messages hidden elements with `data-od-message`, `data-from`, `data-to`, optional `data-label` and optional `data-kind="return"`.

#### Scenario: Three-service flow
- **WHEN** a diagram declares nodes `web` (rank 1), `api` (rank 2) and `db` (rank 3) in lane 1 with links web→api and api→db
- **THEN** the rendered diagram SHALL show the three nodes left to right with two arrowed connectors

### Requirement: Diagram Runtime
The diagram runtime SHALL place flow nodes on a CSS grid by rank and lane according to the direction, draw each link as an orthogonal SVG path with an arrowhead routed through the gaps between ranks and lanes, spread parallel connectors, place link labels, draw a labelled box around each group's member nodes, and lay out sequence diagrams as participant columns with lifelines and message arrows in order. It SHALL re-render when fonts finish loading and when nodes resize. It SHALL expose `window.odDiagram` with a `ready` promise, a `relayout()` function and an `errors` list naming unknown node ids in links or messages and nodes missing a rank or lane. Generated connectors SHALL carry `data-od-edge="<from>-><to>"` and their polyline in `data-points`. Its colors and strokes SHALL come from CSS custom properties that fall back to the design-system tokens.

#### Scenario: Link skipping a rank
- **WHEN** a link connects a rank-1 node to a rank-3 node and a different node occupies rank 2 in the same lane
- **THEN** the connector SHALL route around the rank-2 node, not through it

#### Scenario: Link to an unknown node
- **WHEN** a link has `data-to="cache"` and no node has that id
- **THEN** `window.odDiagram.errors` SHALL contain an entry naming `cache`

### Requirement: Diagram Runtime Tool
The system SHALL provide `add_open_design_diagram_runtime`, taking `entryPath`, which inserts the runtime as one `<script data-od-runtime="diagram" data-version="<n>">` block before `</body>` (appending when there is none), or replaces an existing block of any version, leaving the rest of the file byte-for-byte unchanged, and returns a summary of the markup contract. It SHALL work whether or not the artifact is registered, and SHALL return an error when the entry file doesn't exist or isn't HTML.

#### Scenario: Re-running upgrades in place
- **WHEN** the tool runs on a file that already has an older runtime block
- **THEN** the file SHALL contain exactly one runtime block, the current version, and no other change

### Requirement: Diagram Skill
The catalog SHALL include a local `diagram` skill (`od:prototype:diagram`) covering flowchart, architecture, entity-relationship, state and sequence diagrams. Its workflow SHALL tell the agent to read the relevant code before drawing, to write the diagram using the HTML diagram contract styled from the active design system, to call `add_open_design_diagram_runtime`, and to register the artifact with kind `diagram` and the files it read as `sources`.

#### Scenario: Architecture of a monorepo
- **WHEN** the user asks "diagram how our packages depend on each other"
- **THEN** the brief SHALL direct the agent to read the package manifests and imports first, add the runtime with the tool, and register a `diagram` artifact whose `sources` list the files read

### Requirement: Diagram Artifacts Render Everywhere
Artifacts registered with kind `diagram` SHALL be exportable to `svg`, `png` and `jpeg` and checkable with `check_open_design_artifact`, treating an `.html` entry like `html` and an `.svg` entry like `svg`.

#### Scenario: Export a diagram to PNG
- **WHEN** a registered HTML diagram is exported with `format: "png"`
- **THEN** a PNG SHALL be written with the connectors drawn, and no `unsupported-kind` error SHALL be returned

### Requirement: Diagram Checks
For artifacts with a `[data-od-diagram]` container, the visual check SHALL default to a single desktop viewport (1440×900) when no `viewports` are given, SHALL wait for `window.odDiagram.ready` (at most 3 seconds) and report `node-overlap` (warning) when two node boxes intersect by more than 2 px, `edge-through-node` (warning) when a connector's polyline crosses a node other than its endpoints, `group-overlap` (warning) when a group box covers a node that isn't a member, and `diagram-error` (error) for each runtime error.

#### Scenario: Wide diagram, default viewport
- **WHEN** a diagram is checked without `viewports`
- **THEN** it SHALL be checked and captured at desktop width only, with no mobile findings

#### Scenario: Unknown id surfaces in the check
- **WHEN** a diagram links to a node id that doesn't exist
- **THEN** the check SHALL report a `diagram-error` naming the id

### Requirement: Code Files as Sources
Registration SHALL record any existing workspace text file given in `sources` with its SHA-256, extracting only document types (up to 10) and recording other files by hash only (up to 50). `check_open_design_artifact` SHALL report `stale-sources` (info) naming recorded sources that changed or were deleted since registration, as `get_open_design_artifact` does.

#### Scenario: Schema changed after drawing the ERD
- **WHEN** `prisma/schema.prisma` was recorded as a source and has changed since
- **THEN** the check SHALL report `stale-sources` naming `prisma/schema.prisma`
