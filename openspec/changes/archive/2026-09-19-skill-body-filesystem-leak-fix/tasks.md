# Tasks: skill-body-filesystem-leak-fix

## 1. Diagnose

- [x] User report: after chat-prefill on a gallery example, the model read `src`, `prompts`, `prompts/featured`, `example.html` from the extension's own source repo, outside the actual workspace
- [x] Checked `list_open_design_design_systems` and `get_open_design_artifact` tool responses directly — confirmed neither returns any extension-install-directory path (ruled out as the source)
- [x] Found the real leak: `prepare_open_design_brief` embeds `skill.body` (raw upstream `SKILL.md`) verbatim via `composeInstructions()`; 27/167 vendored example `SKILL.md` files contain a literal "Resource map" section instructing the reader to open `example.html`, a path only valid inside OpenDesign's own runtime
- [x] Found a second leak: `instructions/open-design.instructions.md` named the real repo-relative path `prompts/featured/`
- [x] Checked design-system `DESIGN.md` bodies for the same pattern — 0 matches, no fix needed there

## 2. Fix

- [x] `composeInstructions.ts`: added an explicit disclaimer immediately before the embedded skill body, telling the model any file paths mentioned in it describe OpenDesign's own separate runtime and must not be opened/searched for
- [x] `instructions/open-design.instructions.md`: removed the literal `prompts/featured/` path reference; added a general guardrail that all content arrives as plain text via tool calls and the model should never need to browse outside the workspace

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged (existing `composeInstructions.test.ts` still passes against the new output shape)
- [x] `rm -rf dist && npm run compile` — clean; confirmed the disclaimer text is present in `dist/extension.js`
- [x] Confirmed `instructions/open-design.instructions.md` is loaded by VS Code directly via its `chatInstructions` contribution path (not esbuild-bundled), so the edit takes effect without a rebuild
- [ ] **Not performed**: manual verification in a live Extension Development Host — click a gallery example, let the model act on the resulting task, confirm it no longer attempts to read anything outside the workspace. Same documented, recurring gap as every prior change in this repo.
