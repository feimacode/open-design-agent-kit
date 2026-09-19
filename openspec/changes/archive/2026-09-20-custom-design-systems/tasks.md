# Tasks: custom-design-systems

## 1. Research

- [x] Researched open-design's real custom-design-system feature directly (`DesignSystemFlow.tsx`, `brand-routes.ts`, `brands/`) — confirmed it's a daemon-hosted hybrid (deterministic extraction + optional agent refinement), not exposed as an MCP tool, and identified exactly which parts don't need a daemon
- [x] Confirmed current `ContentIndex` internals via a second research pass (`DesignSystemSummary`/`DesignSystemDetail` shape, `listDesignSystems`/`getDesignSystem` caching, no existing workspace-local content-reading path) before designing the merge
- [x] Entered plan mode given the scope (new tool, new content pool, new storage format, network-fetch code) — plan approved before implementation

## 2. `ContentIndex`

- [x] `DesignSystemSummary`/`DesignSystemDetail` gain `source: 'built-in' | 'user'`; both branches of `loadDesignSystems()` tagged `'built-in'`
- [x] `loadUserDesignSystems(dir)` — scans `<dir>/*/DESIGN.md`, reuses `parseDesignSystemMarkdown()`, ids prefixed `user:`
- [x] Constructor gains optional `getUserDesignSystemsDir?: () => string | undefined`, kept out of `ensureLoaded()`'s cached promise — new `loadedDesignSystems()` merges the cached built-in pool with a freshly-rescanned user pool on every call
- [x] `listDesignSystems`/`listDesignSystemCategories`/`getDesignSystem` all route through `loadedDesignSystems()`

## 3. Extraction

- [x] `src/core/generation/brandExtraction.ts`: `extractBrandEvidence(url)` (network orchestration, timeouts, same-origin-only stylesheet fetch, never throws) + `synthesizeBrandEvidence()` (pure regex harvesting, directly testable)
- [x] **Real bug caught by the new unit tests**: the font-family regex excluded quote characters from its own capture group, truncating quoted declarations to empty strings before the quote-stripping step ever ran — fixed, see `design.md`

## 4. Tool

- [x] `src/core/generation/customDesignSystemInstructions.ts`: `composeCustomDesignSystemInstructions()` — never writes a file, composes instructions + evidence for the model
- [x] `src/tools/createCustomDesignSystemTool.ts`: `create_open_design_design_system`, computes `id`/`suggestedEntryPath` via existing `slugify()`/`getOutputDirectory()`
- [x] Registered in `registerTools.ts` and declared in `package.json`'s `languageModelTools`

## 5. Discoverability

- [x] `instructions/open-design.instructions.md`: new flow note
- [x] `prompts/open-design-custom-design-system.prompt.md` + `chatPromptFiles` registration in `package.json`
- [x] `browseDesignSystemsCommand.ts`: badges `source: 'user'` items "custom" in the QuickPick description
- [x] `listDesignSystemsTool.ts`: includes `source` in its response payload

## 6. Documentation

- [x] README: new "Custom design systems" subsection + updated tool list
- [x] `openspec/specs/open-design-tools/spec.md`: new "Custom Design Systems" requirement + 3 scenarios
- [x] `openspec validate --specs --strict` — clean

## 7. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] New unit tests: `brandExtraction.test.ts` (6 cases, caught and fixed the font-family regex bug) + 3 new `contentIndex.test.ts` cases (built-in tagging, user-pool merge/id-prefixing, live re-scan)
- [x] `rm -rf out out-webview && npm run test:unit` — 50 passing (41 prior + 9 new)
- [x] `rm -rf dist && npm run compile` — clean; confirmed `create_open_design_design_system` present in `dist/extension.js`
- [x] `node -e` sanity check: `package.json` parses, 8 tools declared (new one present), 26 prompt files (new one present)
- [ ] **Not performed**: manual verification in a live Extension Development Host — ask Copilot to create a custom design system from a real URL, confirm the `DESIGN.md` appears under `.open-design/design-systems/<slug>/`, confirm it's immediately visible in `list_open_design_design_systems`/the Browse Design Systems picker with no reload, confirm `set_active_design_system` + a subsequent generation picks up its tokens. Same documented, recurring gap as every prior change in this repo.
