# Tasks: active-design-system

## 1. Explore

- [x] Identify the gap: no persisted "active" concept, matched against user's manual-testing feedback and open-design's own active-context idiom
- [x] Evaluate "register every design system as a `#`-mentionable symbol/tool" — rejected (no stable per-entity chat-reference API; N-tools approach inflates every turn's context)
- [x] Confirm sticky-on-generation behavior with the user (explicit choice, not assumed)

## 2. Implement

- [x] `openDesign.activeDesignSystemId` workspace setting
- [x] `src/core/workspace/activeDesignSystem.ts`: get/set/on-change helpers
- [x] `prepareBriefTool.ts`: optional `designSystemId` falls back to active; explicit one persists as active; stale active id degrades to "none" silently; response includes resolved `designSystemId`/`designSystemName`
- [x] `listDesignSystemsTool.ts`: `active` flag per result
- [x] New `setActiveDesignSystemTool.ts` + `set_active_design_system` tool contribution
- [x] New `activeDesignSystemStatusBarItem.ts`, wired in `extension.ts`
- [x] `browseDesignSystemsCommand.ts`: sets active on pick, shows checkmark + "(active)" on the current one, offers a "Clear active design system" entry
- [x] `package.json`: new setting, new tool, updated modelDescriptions for `prepare_open_design_brief`/`list_open_design_design_systems`
- [x] `instructions/open-design.instructions.md`, `README.md` updated

## 3. Verify

- [x] `tsc --noEmit`, `eslint`, `esbuild` all clean
- [x] Existing 33 unit tests still passing (new modules are vscode-dependent, same as `artifactWriter.ts` — not unit-tested, consistent with existing pattern)
- [x] `node -e` sanity check: `package.json` parses, 6 tools registered, 2 configuration keys present
- [ ] **Not performed**: manual verification in a live Extension Development Host of the status bar rendering/updating, the browse-command's set-active + checkmark behavior, and `prepare_open_design_brief`'s fallback/stickiness across two chat turns — same documented gap as prior changes in this repo.
