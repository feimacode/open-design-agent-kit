## Why

Developers already have an agent that can read their repo. What they can't get from Claude Design, or anything else, is a *designed* diagram of their own system (architecture, request flow, schema, state machine) that matches their brand and stays true to the code.

The pieces aren't there today:
- **No real diagram content.** `hand-drawn-diagrams` and `d3-visualization` are catalog stubs, and `frame-flowchart-sticky` is a hand-positioned video frame.
- **Hand-placed layout breaks down.** Coordinates an LLM places itself fall apart past a handful of nodes.
- **The `diagram` kind is half-wired.** Its manifest advertises png/jpeg export, but export and the visual check reject its renderer with `unsupported-kind`.

## What Changes

- **HTML diagrams laid out by the browser.** A diagram is an ordinary HTML artifact.
  - Nodes are DOM elements with `data-od-node`. The agent gives each one a `data-rank` (step along the flow direction) and a `data-lane` (position across it), which an agent can decide from the code.
  - CSS grid places the nodes, so the browser measures text and the design system's CSS styles them.
  - Connections are declared as hidden `data-od-link` elements (`data-from`, `data-to`, optional `data-label`), and groups as `data-od-group` elements that nodes join with `data-group`.
  - Nothing is computed outside the browser, and there's no layout library.
- **A small, self-contained diagram runtime** (plain JavaScript, no dependencies) lives in the artifact as one marked `<script data-od-runtime="diagram">` block. It:
  - places nodes on the grid;
  - draws right-angle connectors in an SVG overlay, routed through the gaps between columns and rows so they don't cross nodes, with arrowheads and labels;
  - draws group boxes around their members;
  - lays out sequence diagrams (participants, lifelines, message arrows);
  - re-runs when fonts load or nodes resize (WYSIWYG and tweak edits included);
  - exposes `window.odDiagram.ready` and a list of `errors`.

  It renders the same in the live preview, export, the visual check and a plain browser, and its styling comes from CSS custom properties that fall back to the design-system tokens.
- **New tool `add_open_design_diagram_runtime`** inserts the runtime block into a diagram's entry file, or updates it in place, and returns the markup contract. The agent writes only the diagram's content; the runtime is machinery, like a QR code. The preview renders artifacts from their text and can't load relative script files, which is why the runtime is inline.
- **New local skill `diagram`** (`od:prototype:diagram`) covers flowchart, architecture, entity-relationship, state and sequence diagrams. Its workflow grounds the diagram in the repo: read the relevant code first, put each node's source file in `data-od-source`, and pass the files read as `sources`.
- **Fix the `diagram` kind:** it renders and exports (`svg`, `png`, `jpeg`) and checks like an HTML or SVG artifact.
- **Diagram checks** in `check_open_design_artifact` for diagram artifacts:
  - `node-overlap`: two node boxes intersect.
  - `edge-through-node`: a connector crosses a node it doesn't connect.
  - `group-overlap`: a group box covers a node that isn't a member.
  - `diagram-error`: the runtime reported problems, such as a link to an unknown node or a node without a rank or lane.
- **Code files as sources.** Registration records any workspace text file in `sources` by its hash, not just documents. Code files aren't extracted, only hashed. The visual check reports `stale-sources` (info) when recorded sources changed, which `get_open_design_artifact` already does, so the agent can offer to redraw.

## Capabilities

### New Capabilities
- `codebase-diagrams`: the HTML diagram contract and runtime, the runtime tool, the diagram skill, diagram checks, code files as sources with stale reporting in the check, and the diagram renderer in export and check.

### Modified Capabilities
<!-- None: export's renderable set grows and source registration accepts more file types, both specified in codebase-diagrams. -->

## Impact

- `packages/core`:
  - `generation/diagramRuntime.ts`: the runtime as a string, plus insertion into the entry file;
  - diagram checks in `checkArtifact.ts`;
  - the `diagram` renderer in export and check;
  - hash-only code sources in `generation/sourceNumberCheck.ts`.
- `packages/content/local/skills/diagram/` with an example.
- `packages/vscode` and `packages/mcp-server`: the new tool. Instructions on every host.
- No new npm dependencies.
- The Diagram surface entry moves into add-surface-picker, which hasn't been implemented yet.
