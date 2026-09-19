# Bug fix: model opened generated artifacts in Simple Browser via a blocked file:// URL

## Why

The user reported that after a generation task finished, the chat opened the artifact "in the embedded browser" at a `file:///.../.open-design/<slug>/<slug>.html` URL, which VS Code's Simple Browser blocked with "Forbidden. File does not reside within a trusted folder." — a confusing dead end for the user.

Both `register_open_design_artifact` and `remix_open_design_example` already auto-open the correct preview (`openDesign.openArtifactPreview`, our own Custom Editor, via `vscode.commands.executeCommand`) right after writing the artifact — but neither tool's response text said so. With no signal that a preview already exists, the model's natural next instinct after finishing a visible task is to "show the result" itself, and it reached for a generic browser-opening capability with a raw `file://` URL — which VS Code blocks as an untrusted local file open, independent of anything this extension does.

## What Changes

- `registerArtifactTool.ts`: for HTML entries, the success response now states the preview already opened automatically and explicitly says not to also open the file in a browser or via `file://`.
- `remixOrchestrator.ts`: the `instructions` string returned by `performRemix()` (used by `remix_open_design_example`, the QuickPick, tree, and grid) gains the same note.
- `instructions/open-design.instructions.md`: added an explicit "never open the artifact yourself" sentence alongside the existing description of the automatic preview.

## Impact

- Modified: `src/tools/registerArtifactTool.ts`, `src/core/workspace/remixOrchestrator.ts`, `instructions/open-design.instructions.md`.
- No tool response shape changed (guardrail text appended to the existing `instructions`/summary string fields); no spec delta — corrects behavior back toward the existing documented intent ("it opens automatically") rather than changing a capability.
