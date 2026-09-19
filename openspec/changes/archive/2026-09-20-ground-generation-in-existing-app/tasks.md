# Tasks: ground-generation-in-existing-app

## 1. Plan

- [x] Confirmed via research that `prepareBriefTool.ts` never touches `vscode.workspace.workspaceFolders`/`getWorkspaceRoot()` today (so it works without an open workspace) — the new detection must preserve that, never introducing a new throw/crash path
- [x] Entered plan mode, confirmed exact current `prepareBriefTool.ts`/`composeInstructions.ts` state before designing the insertion points; plan approved before implementation

## 2. Detection

- [x] `src/core/workspace/appDetection.ts`: `detectExistingApp(workspaceRoot)` — single `fs.readFile` + `JSON.parse`, both wrapped to degrade to `[]` rather than throw; checks a fixed map of 8 recognizable framework packages against `dependencies`/`devDependencies`, reports every match (deliberately not resolving Next-implies-React overlap)

## 3. Wiring

- [x] `composeInstructions.ts`: new optional `existingAppFrameworks?: string[]` field; conditional section inserted after craft rules, before the semantic-filename guidance
- [x] `prepareBriefTool.ts`: reads `workspaceFolders` directly (not `getWorkspaceRoot()`) to avoid its throwing contract, passes the detection result through

## 4. Documentation

- [x] README: new "Grounding generation in an existing app" section
- [x] `openspec/specs/open-design-tools/spec.md`: extended "Brief Preparation Without File Writes" with 2 new scenarios (nudge present when detected, silent no-op otherwise)
- [x] `openspec validate --specs --strict` — clean

## 5. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] New unit tests: `appDetection.test.ts` (7 cases: no workspace root, no package.json, malformed JSON, single framework via dependencies, single framework via devDependencies, multiple frameworks reported together, unrecognized dependencies → `[]`); `composeInstructions.test.ts` extended with 1 case covering all three states (absent, empty array, populated)
- [x] `rm -rf out out-webview && npm run test:unit` — 80 passing (72 prior + 8 new)
- [x] `rm -rf dist && npm run compile` — clean; confirmed `detectExistingApp`/the new instructions text present in `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — call `prepare_open_design_brief` in a workspace with a real `package.json` listing React, confirm the nudge appears; confirm it's absent with no `package.json` or no open folder. Same documented, recurring gap as every prior change in this repo.
