## 1. Content

- [x] 1.1 Write `local/surfaces.json` with the 15 surfaces (Diagram `ready` with the `diagram` skill if add-codebase-diagrams has landed; Color + type and 3D object as `planned`) mapped to non-stub entries checked against the current catalog
- [x] 1.2 Copy `surfaces.json` into assets in `apply-local-overlay.mjs`; mirror into the VS Code assets
- [x] 1.3 Add the surface guard to `check-content-sync.mjs` with tests (missing entry, stub entry, missing prompt, planned surface skipped)

## 2. Core

- [x] 2.1 `ContentIndex`: load surfaces; detect stubs (`stub: true`) with tests against real stub and non-stub entries
- [x] 2.2 `listSkills`: `surface` filter (`"list"`, id, unknown id error), excluding stubs, returning prompt and questions; tests

## 3. Hosts

- [x] 3.1 VS Code + MCP tool schemas: `surface` argument and descriptions; `stub` in results
- [x] 3.2 VS Code Gallery: "New design" grid of ready surfaces, click opens chat with `/open-design-new <id>`
- [x] 3.3 Local prompt `local/prompts/new.md` (`/open-design-new`); regenerate VS Code prompt files, Claude/Codex skills and CLI assets
- [x] 3.4 Instructions (VS Code + overview skill): use `surface` when a request names a kind of thing; never pick `stub: true` entries

## 4. Docs and verification

- [x] 4.1 Tools reference (`surface`, `stub`), getting-started pages (New design grid, `/open-design-new`); docs check
- [ ] 4.2 Manual: Gallery "New design" tile → chat → artifact for Wireframe and Diagram in VS Code; `/open-design:open-design-new` in Claude Code
