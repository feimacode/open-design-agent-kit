## 1. Vector

- [ ] 1.1 `styleVector.ts`: about 20 features from tokens.css, normalised over the bundled set, null when missing, versioned
- [ ] 1.2 Distance: mean absolute difference over shared features, with the count; plain-word axis differences
- [ ] 1.3 Vectors for bundled systems in the profile index build; user systems on save

## 2. Use

- [ ] 2.1 Extraction results gain `nearest` (top 3, at least 8 features) and `distinctive` (top 3 outlying features)
- [ ] 2.2 Recommend tool `like` input (system id or bundleDir) in MCP, VS Code and the gateway
- [ ] 2.3 Skill: offer nearest systems as brand-free starting points for reference sites; `sync-content`

## 3. Tests and docs

- [ ] 3.1 Known pairs rank as expected; missing tokens stay null; a vector of another version is refused
- [ ] 3.2 Docs: tools reference, design systems guide
