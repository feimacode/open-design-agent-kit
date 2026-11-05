## 1. Vector

- [x] 1.1 `styleVector.ts`: about 20 features from tokens.css, normalised over the bundled set, null when missing, versioned
- [x] 1.2 Distance: mean absolute difference over shared features, with the count; plain-word axis differences
- [x] 1.3 Vectors for bundled systems in the profile index build; user systems on save
  - Note: computed lazily in `ContentIndex` and cached for built-in systems; user systems are vectorised when read (they are re-read on every call), so nothing is stored on save.

## 2. Use

- [x] 2.1 Extraction results gain `nearest` (top 3, at least 8 features) and `distinctive` (top 3 outlying features)
- [x] 2.2 Recommend tool `like` input (system id or bundleDir) in MCP, VS Code and the gateway
  - Note: the gateway serves the MCP server's tool list, so it gets `like` from `session.ts`.
- [x] 2.3 Skill: offer nearest systems as brand-free starting points for reference sites; `sync-content`

## 3. Tests and docs

- [x] 3.1 Known pairs rank as expected; missing tokens stay null; a vector of another version is refused
- [x] 3.2 Docs: tools reference, design systems guide
