## 1. Naming and recommendation

- [x] 1.1 Heading by kind in `customDesignSystemInstructions.ts`; `kind` input on `create_open_design_design_system` written to `brand.json`; tests
- [x] 1.2 Descriptor from `brand.json`, own-brand boost in `designSystemMatching.ts`; active-system note in `composeInstructions.ts`; tests

## 2. Check and critic

- [x] 2.1 `brand-off-palette` (area-weighted, tints accepted, ΔE 6, 1% floor), `brand-font`, indigo exemption, `brand-mark-missing`; `data-od-allow`; fixtures
- [x] 2.2 Critic input: reference screenshot, component specs, voice facts; `design-critic` agent rubric note for `fit`
- [x] 2.3 Review page and `brand-fidelity` findings for `data-od-brand-review` pages (the sample is fixed markup styled only by `tokens.css`, so it follows every edit; the showcase renderer bakes values at render time and goes into `brand.html` instead)

## 3. Export, share, refresh

- [x] 3.1 `export_open_design_design_system` (MCP, VS Code, gateway allow-list) over `claudeDesignSystem.ts`; assets for own brands; script keeps working
- [x] 3.2 `brand.html` from the showcase, marks, voice and DESIGN.md do and don't; registered artifact
- [x] 3.3 `compareTo` diff in `siteExtraction.ts`

## 4. Skill and docs

- [x] 4.1 Skill: kind into `brand.json`, root DESIGN.md offer, export via the new tool, refresh flow; regenerate copies
- [x] 4.2 `docs/guides/design-systems.md` "Your own brand", `reference/tools.md`, `remix-and-gallery.md`
