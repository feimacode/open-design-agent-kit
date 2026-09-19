# Tasks: promote-to-app-code

## 1. Explore and plan

- [x] Explored the design/code coexistence question broadly with the user across several turns before building anything: how design and production code coexist in one repo, whether upstream open-design has an equivalent "start from an existing repo" feature (researched directly — it doesn't, as a first-class thing), and whether "ground generation in an existing app" detection is worth adding (separately explored, informs future work, not this round)
- [x] Entered plan mode given scope (new tool, new UI entry point, new instruction-composition module); researched current exact state of `main.ts`'s toolbar and `artifactEditorProvider.ts`'s message handling (both heavily edited across many prior rounds) before designing; plan approved before implementation

## 2. Instruction composer

- [x] `src/core/generation/portToAppInstructions.ts`: `suggestTargetComponentPath()` (checks `src/components/`, `app/components/`, `components/` in priority order, guesses extension from existing files, returns `undefined` if none found) and `composePortToAppInstructions()` (embeds artifact content, target-path guidance, reference-component guidance, styling/content translation guidance, explicit routing-wiring exclusion)

## 3. Tool

- [x] `src/tools/portToAppCodeTool.ts`: `port_open_design_artifact_to_app`, reuses existing `getArtifact()`, computes a suggested target path when none given, returns `{ instructions, suggestedTargetComponentPath }` only
- [x] Registered in `registerTools.ts`, declared in `package.json`'s `languageModelTools`

## 4. UI entry point

- [x] `src/webview/main.ts`: new `#od-promote-to-app` button in `.od-toolbar`, always visible (not mode-gated)
- [x] `artifactEditorProvider.ts`: new `'promote-to-app-code'` message case, reuses the already-resolved `location`, opens a prefilled chat message naming the tool and entry path explicitly (same `workbench.action.chat.open` pattern as `'send-comments-to-chat'`); warns if the document is outside any workspace folder

## 5. Documentation

- [x] `instructions/open-design.instructions.md`: new flow note
- [x] README: new "Promoting a prototype to real app code" section
- [x] `openspec/specs/open-design-tools/spec.md`: new "Promoting a Prototype to Real Application Code" requirement + 3 scenarios
- [x] `openspec validate --specs --strict` — clean

## 6. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] New unit tests: `portToAppInstructions.test.ts` — 4 cases for `suggestTargetComponentPath` (no directory, extension-guessing, priority ordering, fallback), 6 cases for `composePortToAppInstructions` (content embedding, explicit vs. inferred target, explicit vs. searched reference, routing exclusion always present)
- [x] `rm -rf out out-webview && npm run test:unit` — 72 passing (62 prior + 10 new)
- [x] `rm -rf dist && npm run compile` — clean; confirmed `port_open_design_artifact_to_app` in `dist/extension.js`, the toolbar button markup in `dist/webview/main.js`, and the message-case wiring in `dist/extension.js`
- [x] `node -e` sanity check: `package.json` parses, 9 tools declared (new one present)
- [ ] **Not performed**: manual verification in a live Extension Development Host — open an artifact in the preview editor, click "Promote to App Code," confirm the prefilled chat message; in a workspace with a real component directory, confirm a sensible target path suggestion. Same documented, recurring gap as every prior change in this repo.
