## Context

No vendored content lays out graphs. Agents writing raw SVG coordinates produce overlapping boxes and edges through nodes once graphs pass about 8 nodes; Mermaid output looks generic and ignores the design system.

The VS Code preview renders an artifact by putting its text into an iframe's `srcdoc`, with a content security policy that allows nonce-stamped inline scripts. Relative `<script src>` and asset paths do not load there. Export and the visual check serve the workspace over HTTP, so they would load relative files.

Registration already records sources with SHA-256 hashes, and `get_open_design_artifact` reports `staleSources`. But the source reader only accepts documents (md, txt, csv, pdf, docx, pptx, xlsx).

## Goals / Non-Goals

**Goals:**
- Legible diagrams of real code at 5–60 nodes.
- Styled by the design system.
- Rendered identically in the preview, export, the check and a browser.
- No new dependencies.
- Checks that catch layout failures.
- A way to notice when the code moved on.

**Non-Goals:**
- A diagram editor.
- Mermaid or PlantUML import and export.
- Extracting graphs from code with static analysis (the agent reads the code).
- Animated diagrams.
- Automatic crossing minimization: the agent orders lanes, and the check flags problems.

## Decisions

### D1. HTML diagrams laid out by the browser
The agent decides what the graph is and where each node sits on a coarse grid: a rank (step along the flow) and a lane (position across it). The browser lays out the grid, sizes nodes to their text, and applies the design system. A runtime then draws the connectors.

The alternatives:
- **A Node-side layout library (elkjs or dagre) that returns coordinates.** It adds a 0.3–1.5 MB dependency to the extension (elkjs is EPL-2.0), and the agent still has to transcribe coordinates into SVG.
- **Raw agent-placed SVG.** It degrades with size.

The grid also means WYSIWYG text edits and token tweaks re-flow the diagram for free.

### D2. The runtime is inlined by a tool
Because the preview can't load relative scripts (see Context), the runtime must be inline. Asking the agent to paste about 5 KB of exact JavaScript wastes tokens and invites corruption. So `add_open_design_diagram_runtime`:
- finds `<script data-od-runtime="diagram" data-version="N">…</script>`;
- replaces it, or inserts it before `</body>` (appending it when there's no `</body>`);
- leaves everything else in the file byte-for-byte unchanged.

The runtime is code, not design, so this stays consistent with "tools never write your design", like the QR-code asset. It works before or after registration. The runtime is stored in core as a string constant, not a serialized function, so bundler name-mangling or `__name` helpers can't leak into user files.

### D3. Routing through grid gaps
Positions are read from the rendered nodes. A rank's extent is the min/max of its nodes along the flow axis, and a lane's extent the same across it. The gaps between them are free channels.

Edge routes, with the flow running "right" (for "down" the axes swap):
- **Next rank:** exit the source's far side, run along the channel after the source's rank, and enter the target's near side.
- **Longer jumps:** drop into the gap between lanes next to the source (on the target's side), travel along that gap to the channel before the target's rank, then enter the target.
- **Backward edges:** use the channel before the target's rank.
- **Same-rank edges:** loop through the channel after the rank.

Several edges sharing a channel or gap are spread 8 px apart, and several edges on one node side spread along its middle 60%. Each label sits on the edge's longest segment.

### D4. Sequence mode is fixed geometry
With `data-od-diagram="sequence"`:
- **Participants** (`data-od-participant`) form header columns.
- **Messages** (hidden `data-od-message` elements with `data-from`, `data-to`, `data-label`, and `data-kind="return"` for dashed arrows) stack in rows of `--od-message-gap`.
- **Lifelines** are dashed verticals.
- **Self-messages** are small loops.

### D5. Styling hooks
The runtime sets layout only. Colors and stroke come from CSS custom properties that fall back to the design-system tokens:
- `--od-edge-color` → `var(--muted)`, `--od-edge-width`;
- `--od-edge-label-bg` → `var(--bg)`, `--od-edge-label-color` → `var(--fg)`;
- `--od-group-border` → `var(--border)`, `--od-group-bg`;
- `--od-rank-gap`, `--od-lane-gap`, `--od-message-gap`.

Generated elements carry attributes the skill's CSS can target: `path[data-od-edge]`, `[data-od-group-box]` and `[data-od-edge-label]`.

### D6. Checks read the rendered result
In the check, the diagram geometry script waits for `window.odDiagram.ready` (capped at 3 s) and then:
- intersects node boxes (`node-overlap`, warning);
- tests each edge's polyline (stored by the runtime in `data-points`) against the boxes of the nodes it doesn't connect (`edge-through-node`, warning);
- tests group boxes against nodes that aren't members (`group-overlap`, warning);
- reports `odDiagram.errors` (`diagram-error`, error).

### D7. Code files as hashed sources
When a `sources` path isn't a document type, registration records `{ path, sha256 }` without extracting it and without the number check. The document limit stays at 10, and hash-only files get their own limit of 50. The visual check adds `stale-sources` (info), using the existing `findStaleSources`.

## Risks / Trade-offs

- [Grid layout can't express every graph well (dense cross-links)] → the skill tells the agent to order lanes to keep connected nodes adjacent and to split very dense graphs; the checks flag crossings through nodes.
- [Runtime bugs ship inside users' files] → a versioned block; re-running the tool upgrades it; browser tests cover the routing cases.
- [Scripts disabled (some paste targets, email)] → diagrams are for viewing and image or PDF export; the PNG/SVG export is the portable form.

## Migration Plan

Additive, plus the renderer fix (exports that failed before now succeed). Rollback: remove the tool and the skill, and keep the renderer fix.

## Open Questions

- Export to a static SVG (connectors baked in, no script) for embedding in Markdown READMEs. Proposed as a follow-up: serialize the rendered DOM into an SVG `foreignObject`, or rebuild the nodes as SVG.
