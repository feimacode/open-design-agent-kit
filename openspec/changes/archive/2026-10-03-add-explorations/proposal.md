## Why

Every Open Design request today produces exactly one artifact, so the first thing the model invents is the thing the user gets. Concept exploration (asking for several genuinely different directions, comparing them side by side, then picking one) is a headline workflow in dedicated design tools like Claude Design, and upstream Open Design's own prompt already says *"Default to 2–3 differentiated directions on the same brief when the user is exploring"*. Our port never exposed it. It is also the gap most specific to developers: we are the only option where the chosen direction goes straight into `port_open_design_artifact_to_app` in the same session, and "three directions from one prompt" is the most demo-able, shareable moment for growing the user base.

Simply asking the model for "3 directions" doesn't work: the results converge. Directions have to be **assigned up front**, from a fixed library, before anything is generated. Today's collections can't be reused as-is either: they are built for consistency (`composeInstructions` tells each screen to match its siblings), and explorations need the opposite.

## What Changes

- **Vendor upstream's design-direction library** (`apps/daemon/src/prompts/directions.ts`, Apache-2.0): five visually distinct "schools", each with fonts, an OKLch palette, mood, references and layout posture. It's pure data, the same daemon-free kind of thing we already vendor.
- **Add an extension-authored structural direction library** for when the brand is locked: page layouts (e.g. classic hero-and-grid, story-led long scroll, product-UI-first, dense utility) and deck narrative arcs.
- **New tool `prepare_open_design_exploration`**: one brief → 2–4 (default 3) directions, each with its own composed instruction block and entry path. The tool assigns the directions. The axis is visual (assign schools) by default, structural when a design system is active, or custom labels the agent passes for a named axis ("different hero concepts"). Directions are **sketches** (one strong screen, or a cover plus two slides), not full builds. The tool records the plan in an `exploration.json` file.
- **`register_open_design_artifact` gains `explorationId` and `directionId`**. Registering a direction regenerates the exploration's **`compare.html`**: a static grid of live iframes with each direction's label, school or axis and rationale, viewable in any browser. This is the first visual surface for Claude Code, Codex and Cursor users, who have no preview editor.
- **New tool `compare_open_design_exploration`**: reports which directions are registered or missing, returns the `compare.html` path, and optionally renders a **contact-sheet PNG** through the existing headless export. The agent can view it to check that the directions really differ, and the user can share it.
- **New tool `choose_open_design_direction`**: records the choice and returns instructions for one of three next steps: **build out** the chosen sketch at full fidelity, **merge** named aspects across directions, or **save it as a custom design system** so later work and collections reuse it.
- **A new curated command `open-design-explore`** (a local overlay prompt), rendered for every host: a VS Code prompt file, an MCP prompt, and Claude Code and Codex skills. The overview skill and the VS Code chat instructions learn when to explore. That is only when the user asks for options or directions, never by default, because of the cost.
- **VS Code, minimal**: the artifact preview shows "Direction N of M" with previous/next, by generalizing today's collection navigation. A native comparison view is phase 2 and not part of this change.
- **Docs**: a new "Explore directions" guide, plus reference entries for the three tools and the new manifest fields.

## Capabilities

### New Capabilities
- `design-explorations`: assigning divergent directions, the exploration plan file, exploration-aware registration, the generated comparison page and contact sheet, choosing and its follow-up instructions, the curated `explore` command, and direction navigation in the VS Code preview.

### Modified Capabilities
<!-- None. Registration keeps its existing contract; the new optional fields and the compare-page side effect are specified as additions in design-explorations. -->

## Impact

- **Core** (`packages/core`):
  - newly vendored `vendored/designDirections.ts`, recorded in `SOURCE.md`
  - new structural library
  - new `generation/exploration*.ts` modules for assignment, instruction composition and choose instructions
  - new `workspace/explorationStore.ts` (plan file and scan) and a `compare.html` renderer
  - `artifactManifest.ts` gains two optional fields, the same kind of divergence as the collection fields
- **MCP server** (`packages/mcp-server`): three new tools; `register_open_design_artifact` gains two optional arguments.
- **VS Code** (`packages/vscode`): three new `languageModelTools` and their `package.json` contributions; register tool arguments; preview navigation generalized from collections to explorations.
- **Content** (`packages/content/local/prompts/explore.md`) and the generated skills, prompt files and MCP prompts.
- **Docs**: `docs/guides/explore-directions.md`, `docs/reference/tools.md`, `docs/reference/artifact-manifest.md`, prompts reference (enforced by `scripts/check-docs.mjs`).
- **No new runtime dependencies.** The contact sheet reuses the existing browser discovery and degrades gracefully when no browser is installed.
