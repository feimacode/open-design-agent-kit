# Tasks: instrument-key-entry-points

## 1. Thread `log` through every command

- [x] `browseDesignSystemsCommand.ts` — logs invocation, cancellation, clear, and the selected design system id
- [x] `browseGalleryCommand.ts` — logs invocation, cancellation, and the picked skillId; passes `log` into `remixAndOpen()`
- [x] `remixAndOpen.ts` — both the shared `remixAndOpen()` helper (logs the remix outcome, success or `performRemix`'s error) and `registerRemixExampleCommand` (logs invocation, unresolved-arg warning)
- [x] `previewExampleCommand.ts` — logs invocation, unresolved-arg warning
- [x] `chatWithExample.ts` — both the shared `chatWithExample()` helper (logs unknown-skillId warning, prefill success) and `registerChatWithExampleCommand`
- [x] `openArtifactPreviewCommand.ts` — logs invocation with the target path, or a warning when there's nothing to preview
- [x] `openGalleryGridCommand.ts` — logs invocation, passes `log` into `GalleryGridProvider.open()`
- [x] `extension.ts` — threads `log` into all of the above registration calls

## 2. Webview providers

- [x] `GalleryGridProvider` — logs panel open/dispose, every received message type (debug), and the previously-silent thumbnail-read `catch` block now logs the real error
- [x] `ExamplePreviewProvider` — logs `show()` invocation and panel dispose, and the previously-silent example-read `catch` block now logs the real error

## 3. Artifact editor

- [x] `ArtifactEditorProvider.resolveCustomTextEditor` — logs document open/close
- [x] `apply-patch`, `comments-changed`, `send-comments-to-chat` message branches each log their own action

## 4. Verify

- [x] `npm run typecheck` — clean on the first pass; all call sites for `remixAndOpen`, `chatWithExample`, `ExamplePreviewProvider.show`, `GalleryGridProvider.open` were required (non-optional) `log` params, so a missed call site would have failed here — none did
- [x] `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed all 7 `Command: openDesign.*` log lines present in `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host. Same documented, recurring gap as every prior change in this repo.
