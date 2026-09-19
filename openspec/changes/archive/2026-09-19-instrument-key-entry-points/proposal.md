# Instrument all command/webview entry points, not just tool calls

## Why

The previous round (`output-panel-logging`) ported a real `LogOutputChannel`-backed logging infrastructure and wrapped all 7 `languageModelTools`, but every other user-triggered entry point — the 7 commands, the two webview panel providers, and the artifact editor's message handling — still logged nothing. The user asked directly to "put logs for the key entries," i.e. extend the same instrumentation to these non-tool entry points so the Output panel shows a complete picture of what the extension did, not just what the model's tool calls did.

## What Changes

- `ILogService` is now threaded through every command-registration function and webview provider that previously didn't receive it: `browseDesignSystemsCommand.ts`, `browseGalleryCommand.ts`, `remixAndOpen.ts` (both the shared `remixAndOpen()` helper and `registerRemixExampleCommand`), `previewExampleCommand.ts`, `chatWithExample.ts`, `openArtifactPreviewCommand.ts`, `openGalleryGridCommand.ts`, `GalleryGridProvider`, `ExamplePreviewProvider`.
- Each command now logs its own invocation (`Command: openDesign.<name>`) at entry, its outcome (success with the relevant id/path, or a `warn` for a no-op like "no file to preview" or "could not resolve a skillId"), and any previously-silent `catch` blocks (thumbnail/example read failures) now log the actual error via `collectErrorMessages` instead of swallowing it.
- `ArtifactEditorProvider` (already had `log` from the prior round) gains logging at its own three key message branches — `apply-patch`, `comments-changed`, `send-comments-to-chat` — plus document open/close.
- Left unchanged, deliberately: the status bar refresh (`activeDesignSystemStatusBarItem.ts`) and the tree data provider (`galleryTreeProvider.ts`) — these are passive/derived-state rendering, not discrete user actions, so they weren't in scope for "key entries."

## Impact

- Modified: all 7 command files under `src/extension/commands/`, `src/extension/webviews/{galleryGridProvider,examplePreviewProvider}.ts`, `src/extension/customEditors/artifactEditorProvider.ts`, `src/extension/extension.ts` (threads `log` into the newly-updated registration calls).
- No behavioral/spec change — pure observability.
