# Ground generation in an existing app, when there is one

## Why

Closing the last open item from the design/code-coexistence exploration that also produced `port_open_design_artifact_to_app`: this extension always generates a standalone prototype under `.open-design/`, with no awareness of whether the workspace already contains a real application it could visually align with. Discussed and agreed with the user across a few turns before building: a cheap, deterministic signal — not a hardcoded framework classifier — that only changes what `prepare_open_design_brief` tells the model, never where or how the artifact gets written. The model still does all the actual judgment; detection only decides whether to nudge it to look.

## What Changes

- **New `src/core/workspace/appDetection.ts`**: `detectExistingApp(workspaceRoot)` reads the workspace's `package.json` once (a single `fs.readFile`, no separate existence check) and checks its dependencies against a small fixed map of recognizable framework packages (React, Next.js, Vue, Nuxt, Svelte, Angular, Astro, Solid), returning every match found. Degrades to `[]` — never throws — when `workspaceRoot` is `undefined`, `package.json` is absent, or it's unparseable.
- **`composeInstructions.ts`**: `ComposeInstructionsInput` gains an optional `existingAppFrameworks?: string[]`; when non-empty, a new conditional section is inserted naming the detected frameworks and nudging the model to check real existing components/conventions before generating — explicitly stating this doesn't change where the artifact is written.
- **`prepareBriefTool.ts`**: resolves `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` directly (not `getWorkspaceRoot()`, which throws with no folder open) and passes `detectExistingApp()`'s result through — the only new touch point. `create_open_design_design_system` and `port_open_design_artifact_to_app` are deliberately left untouched: the former is about brand/color identity, not UI conventions, and the latter already does real grounding via its own reference-component mechanism, making this nudge redundant there.

## Impact

- New: `src/core/workspace/appDetection.ts`, `src/test/unit/appDetection.test.ts`.
- Modified: `src/core/generation/composeInstructions.ts`, `src/tools/prepareBriefTool.ts`, `src/test/unit/composeInstructions.test.ts`, `README.md`, `openspec/specs/open-design-tools/spec.md` (extended "Brief Preparation Without File Writes" with 2 new scenarios).
- No `package.json` schema change — `prepare_open_design_brief`'s input shape is unchanged; only the content of its `instructions` output changes, conditionally.
