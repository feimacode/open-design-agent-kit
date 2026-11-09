## Why

Figma is where most designers' design systems actually live, and the kit has no way to turn a Figma file into an Open Design design system:

- `pull_open_design_figma_frame` turns **one frame into an artifact** and reads the frame's variables only for that artifact. Nothing is saved as a design system.
- `add-design-system-from-url` explicitly left Figma out of scope, and `add-brand-from-screenshot-or-css` left out "reading Figma brand kits".
- Claude Design now does this through the Figma connector (the Design System type's `from-design-tool.md`): map the file with `get_metadata`, read token frames with `get_variable_defs`, add names and scopes with `search_design_system`, and save. It writes literal values with no role mapping, no contrast check and no review. It keeps one mode, flattens aliases and brings no fonts.

The kit can do the same read and add what we already do for websites: roles from names, confidence per value, conflicts, contrast and a review page. It can then save the result in both our format and Claude Design's.

## What Changes

- **Figma links on the extract tool.** `extract_open_design_design_system` accepts a Figma file or frame link in `url`. The server doesn't contact Figma. It returns `status: "needs-figma-read"` with instructions: check the Figma connector through `list_open_design_integrations`, load Figma's required guidance, call `get_metadata` on the file and find token frames (pages or frames named like colours, colour, tokens, typography, type, spacing, radius, foundations, styles), logo frames and the button component, then call `get_variable_defs` on each token frame and on the button, and `search_design_system` for variable names, collections, scopes and descriptions. Then call the tool again with the results as a `figma` source. Huge `get_metadata` replies are searched, not read whole, as Claude Design's procedure does.
- **A `figma` source kind.** `{ kind: "figma", file, frames: [{ nodeId, name, variables: { "<name>": "<value>" } }], designSystem?: [{ name, collection, scopes, description }] }`. Values are `declared`. Names are normalised (`var(--x)` and `/` separators) and keep the Figma name for the review.
- **Roles from names and scopes.** The existing "roles from names only" rule is extended with Figma scopes: `FRAME_FILL` or `ALL_FILLS` with background names → `--bg` or `--surface`; `TEXT_FILL` → text tiers; `STROKE_COLOR` → `--border`; `CORNER_RADIUS` → radius steps; `GAP` and `WIDTH_HEIGHT` → spacing; font family, size and line height variables → the type scale. The button's variables give `--accent` and its foreground when no name says "primary". Everything else stays a candidate.
- **One mode, said plainly.** The connector returns resolved values for the mode the frame shows. The draft takes that mode and lists the file's other collections and modes (from `search_design_system`) as not read, with a pointer to `add-figma-variable-modes`. Aliases arrive flattened, and the draft says so.
- **Token fallback for styles.** When Figma isn't connected but a Figma token is configured (local server only, as for `pull_open_design_figma_frame`), the server reads the file's published styles (`GET /v1/files/:key/styles` and the style nodes) for fill, text and effect styles, all `declared`. Variables through REST need Figma Enterprise, so that's left to `add-figma-variable-modes`.
- **Logos.** Logo frames are exported by the agent with `get_screenshot` or the SVG URLs from `get_design_context` into the workspace on the local server. On the hosted gateway they are listed as needed and the person is asked to attach them. Font files are always listed as needed.
- **Same review and both formats.** The draft goes through the usual review page and save. The skill then offers `export_open_design_design_system` so the same Figma file also becomes a Claude Design system, with roles and contrast checks Claude Design's own import lacks. The draft records `source: "figma"` with the file link, frame links and date, so a later re-read touches the same frames.
- **Skill.** The brand skill adds "from my Figma file" to its first question.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: Figma link handling, the `figma` source kind, roles from Figma scopes, one-mode reporting, the styles fallback.
- `figma-integration`: the extract route joins frame pull and push as a third Figma flow; link parsing is shared.

## Impact

- `packages/core/src/generation/figmaPull.ts`: export `parseFigmaUrl` for reuse (already handles design, branch, board, make links); new `figmaSource.ts` (variable map and design-system search normalisation, scope roles, REST styles fallback); `siteExtraction.ts`: `needs-figma-read` and source merge.
- `packages/mcp-server/src/session.ts`, `tools.ts`: `figma` source schema; `remote.ts`: allow `url` when it is a Figma link (no fetch) and the `figma` source.
- Skill and docs as for the Canva change; `integrations.json` Figma notes.
- Not in this change: modes and aliases (`add-figma-variable-modes`), components rebuilt as code (frames still go through `pull_open_design_figma_frame`), live sync.
