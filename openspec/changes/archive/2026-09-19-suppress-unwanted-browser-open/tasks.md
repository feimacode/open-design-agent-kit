# Tasks: suppress-unwanted-browser-open

## 1. Diagnose

- [x] User report: after a generation task finished, the chat opened the artifact in Simple Browser at a `file://` URL, blocked with "Forbidden. File does not reside within a trusted folder."
- [x] Confirmed both `registerArtifactTool.ts` and `remixOrchestrator.ts` already auto-open the correct preview via `openDesign.openArtifactPreview`, but neither told the model so in its response text — the model had no reason not to also try opening it itself

## 2. Fix

- [x] `registerArtifactTool.ts`: HTML-entry success response now states the preview already opened automatically and forbids opening the file elsewhere (Simple Browser, `file://`)
- [x] `remixOrchestrator.ts`: same note appended to `performRemix()`'s `instructions` string
- [x] `instructions/open-design.instructions.md`: added an explicit "never open the artifact yourself" sentence

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed the new guardrail text present at both call sites in `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — run a full generation and a remix, confirm the model no longer attempts to open Simple Browser / a `file://` URL. Same documented, recurring gap as every prior change in this repo.
