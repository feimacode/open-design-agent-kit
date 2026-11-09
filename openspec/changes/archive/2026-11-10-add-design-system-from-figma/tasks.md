## 1. Mapping

- [x] 1.1 `figmaSource.ts`: normalise `get_variable_defs` maps and `search_design_system` items; fixtures from real replies
- [x] 1.2 Roles from names and Figma scopes; button-derived accent; type scale from font variables
- [x] 1.3 One-mode note listing other collections and modes; flattened-alias note
- [x] 1.4 REST styles fallback with a token (local only); tests with a recorded styles reply

## 2. Tool

- [x] 2.1 Figma link in `url` → `needs-figma-read` instructions (connector check, guidance, metadata search, token frames, button, design-system search, call back)
- [x] 2.2 `figma` source schema, merge by confidence, `source: "figma"` record; gateway allows Figma links without fetching
- [x] 2.3 Logos and fonts listed as needed on the gateway; saved into the workspace locally

## 3. Skill and docs

- [x] 3.1 Brand skill: "from my Figma file"; after saving, offer the Claude Design export
- [x] 3.2 Docs: design systems guide, tools reference, Figma integration notes
- [x] 3.3 Live check: a public Figma community design-system file in Claude Code with the Figma connector
