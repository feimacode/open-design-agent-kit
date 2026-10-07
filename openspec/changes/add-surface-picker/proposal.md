## Why

People arrive with a *kind of thing* in mind — "a diagram", "an HTML email", "a wireframe" — not a template id. Claude Design greets them with a grid of surface types; we greet them with a catalog of ~280 entries whose upstream taxonomy is inconsistent (`scenario` values duplicated quoted/unquoted, ~40 `category` values) and in which 85 of 164 skills are catalog stubs that only link upstream. Curation today is per template (27 commands), so whole surfaces we can make well (wireframes, research boards, emails, diagrams) have no front door, and the agent can land on a stub. This is the cheapest backlog item and the entry point the later ones (diagrams, email, campaign kit, style tiles, 3D) plug into.

## What Changes

- An extension-owned **surface catalog**, `packages/content/local/surfaces.json`: each surface has an id, label, one-line description, codicon, an ordered list of real entry ids (skills, templates, examples), optionally a host prompt that owns the flow (e.g. `poster`), and one or two clarifying questions. Initial surfaces: Prototype, Mobile app, Slides, Document, Wireframe, Animation, Résumé, Research, Data report, Poster / flier, Social post, HTML email, Diagram, Color + type, 3D object. Surfaces whose content isn't built yet (Diagram, Color + type, 3D object) ship marked `status: "planned"` and are hidden until their change lands.
- A **build-time guard** in the content sync checks: every surface entry exists, isn't a catalog stub, and every referenced prompt exists. Fails the build otherwise.
- `list_open_design_skills` gains an optional `surface` argument returning that surface's entries in curated order; with `surface: "list"` it returns the surface catalog itself. Same on VS Code and MCP.
- **VS Code:** the Gallery opens on a "New design" grid of surfaces (above the existing example grid). Clicking one opens chat with `/open-design-new <surface>` prefilled. New prompt file `/open-design-new`.
- **Claude Code / Codex:** a generated `open-design-new` skill (`/open-design:new`) listing surfaces and routing to them.
- Instructions: when a request names a surface, call `list_open_design_skills` with `surface` first; never pick a catalog-stub entry (results already exclude them for surfaces).
- Catalog stubs are flagged `stub: true` in every `list_open_design_skills` result so the agent can tell them apart in free queries too.

## Capabilities

### New Capabilities
- `design-surfaces`: the surface catalog, its build guard, the `surface` argument, the New design grid, the `/open-design-new` entry points, and stub flagging.

### Modified Capabilities
<!-- None: the surface argument and stub flag are additive and specified in design-surfaces. -->

## Impact

- `packages/content`: `local/surfaces.json`, a guard in `check-content-sync.mjs`, overlay copy into assets.
- `packages/core`: `ContentIndex` loads surfaces and detects stubs; `listSkills` gets `surface`.
- `packages/vscode`: Gallery webview "New design" section, `package.json` tool schema, prompt file.
- `packages/mcp-server`: tool schema. `packages/claude-plugin`, `packages/codex`, `packages/cli` assets: generated `open-design-new` skill.
- Docs: tools reference, getting-started pages.
