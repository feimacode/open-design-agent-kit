# Bug fix: the model was reading files from the extension's own install directory

## Why

The user reported that after clicking a gallery example (populating a prefilled chat message via `chatWithExample.ts`), when the model worked on the task, it tried to read `src`, `prompts`, `prompts/featured`, and `example.html` — real directories/files from *this extension's own source repository*, outside the user's actual workspace, triggering VS Code's "Allow reading external directory?" confirmation dialog.

Traced two real, independent leaks:

1. **`prepare_open_design_brief`'s `instructions` field embeds a skill's raw upstream `SKILL.md` body verbatim** (`composeInstructions()` → `skillBody: skill.body`). 27 of the 167 vendored example `SKILL.md` files include a literal "Resource map" section written for OpenDesign's own daemon-backed runtime, e.g.:
   ```
   webgl-holographic-foil/
   ├── SKILL.md          ← you're reading this
   ├── example.html      ← the complete, working artifact (READ FIRST)
   ```
   `example.html ← ... READ FIRST` is a literal instruction the model dutifully tried to follow — but that relative path only resolves under this extension's bundled `assets/open-design/examples/<id>/`, not anywhere in the user's workspace, so the model went looking for it outside the workspace.
2. **`instructions/open-design.instructions.md`** (injected into every chat via `chatInstructions`) named a real repo-relative path, `prompts/featured/`, when describing the curated slash commands — inviting the model to go browse that literal directory, which again only exists in the extension's own source tree.

## What Changes

- `composeInstructions()` (`src/core/generation/composeInstructions.ts`) now prefixes the embedded skill body with an explicit disclaimer: any file paths mentioned in the upstream skill text describe OpenDesign's own separate runtime layout, are not present in the workspace, and must not be opened/searched for.
- `instructions/open-design.instructions.md` no longer names the literal `prompts/featured/` path (describes the slash commands without a directory reference), and gains a general guardrail sentence: all OpenDesign content arrives as plain text through the tool calls, never as a file path, and the model should never need to browse outside the workspace (including this extension's own install directory) to find it.
- Verified clean via direct inspection (not guessing): `list_open_design_design_systems` and `get_open_design_artifact` were checked and confirmed to never return any path pointing into the extension's install directory — the leak was isolated to the skill-body embedding path.

## Impact

- Modified: `src/core/generation/composeInstructions.ts`, `instructions/open-design.instructions.md`.
- No tool response shape changed (the disclaimer is prose inside the existing `instructions` string field); no spec delta needed since this corrects behavior back to the existing implicit contract ("author the files yourself... do not look for any tool that writes content on your behalf") rather than changing it.
