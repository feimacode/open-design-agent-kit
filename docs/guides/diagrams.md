# Diagrams of your code

Ask for a diagram of your own system (architecture, package dependencies, a request flow, a database schema, a state machine or a sequence of calls) and the agent reads the code first, then draws a designed diagram of what it actually found, styled by your [design system](design-systems.md).

## Before you start

- Nothing to install for drawing. Checking and exporting to PNG or PDF need an installed Chrome, Edge or Chromium ([why](export-images.md#before-you-start)).

## Start

Just ask, naming what to draw:

> Diagram how the packages in this repo depend on each other.

> Draw an ER diagram of `prisma/schema.prisma`.

> Show the sequence of calls when a user checks out.

To start from a working example instead, ask to remix the diagram example (`od:prototype:diagram:example`, see [Remix and the gallery](remix-and-gallery.md)).

## What happens

1. **The agent reads the code.** Package manifests and imports for architecture, routes and handlers for flows, schema files for ERDs, the reducer or transition table for state machines. It draws only what it read, and lists those files in a *Sources* footer.
2. **It writes the diagram as HTML.** Each box is an element with two small numbers, a *rank* (its step along the flow) and a *lane* (its position across it). Links and groups are declared by name. No coordinates.
3. **It adds the layout runtime** with [`add_open_design_diagram_runtime`](../reference/tools.md#add_open_design_diagram_runtime). This small script, inlined in the file, places the boxes on a grid, draws right-angle connectors through the gaps between them (so they don't cross boxes), boxes groups, and lays out sequence diagrams. The file renders the same in the preview, in exports and in any browser.
4. **It registers the diagram** with kind `diagram` and the files it read as `sources`.
5. **It checks the result** with [`check_open_design_artifact`](../reference/tools.md#check_open_design_artifact): a screenshot plus diagram checks:
   - `node-overlap`: boxes on top of each other;
   - `edge-through-node`: a link crossing a box it doesn't connect;
   - `group-overlap`: a group's box covering a node that isn't a member;
   - `diagram-error`: a link to a name that doesn't exist, or a box without a rank or lane.

   Diagrams are checked at desktop width only, since they're wide by nature.

## Keeping it current

The files a diagram was drawn from are recorded with a fingerprint. When any of them changes, the next check (or [`get_open_design_artifact`](../reference/tools.md#get_open_design_artifact)) reports `stale-sources`, naming the files, and the agent offers to redraw.

## Change the look

The diagram follows your design system. To adjust it by hand, set these custom properties on the diagram's container:

| Property | Controls |
|---|---|
| `--od-edge-color`, `--od-edge-width` | Link color and stroke width |
| `--od-edge-label-bg`, `--od-edge-label-color` | Link label background and text |
| `--od-group-border`, `--od-group-bg`, `--od-group-pad` | Group boxes |
| `--od-rank-gap`, `--od-lane-gap` | Space between ranks (along the flow) and lanes (across it); widen the rank gap when links carry labels |
| `--od-message-gap`, `--od-participant-gap` | Sequence diagram spacing |

Box styles are ordinary CSS on the nodes. Text edits in the [preview](preview-comments-edit.md) re-flow the diagram automatically.

> **In VS Code:** the diagram opens in the Artifact Preview like any design.

> **In Claude Code / Codex:** open the HTML file in a browser.

## Export

Export like any page ([Export images](export-images.md)): PNG or JPEG for slides and docs. The exported image has the connectors drawn.

## Related

- [Generate a design](generate-a-design.md)
- [Export images](export-images.md)
