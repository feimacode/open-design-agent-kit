# Promote a prototype to real app code

## Why

This extension's artifacts are standalone, sandboxed HTML files under `.open-design/` — great for fast, zero-risk iteration (generation, comments, WYSIWYG edit), but disconnected from a real app's actual code even when the workspace already contains one. Explored broadly with the user across several turns: how design and production code coexist in one repo, and the "existing repo → build design → optimize → back to code" workflow, including whether open-design's own upstream product supports something similar (researched directly: it doesn't have a first-class "connect a GitHub repo, do grounded design work in it" feature — the closest analogs are a local-folder working-directory import and a read-only `linkedDirs` context grant, both local-disk-only, plus a narrow GitHub clone path scoped to design-token evidence only). Also explored whether Claude's own "start from an existing repo" design feature has an upstream open-design equivalent — same answer, it doesn't exist as a first-class thing there either.

Landed on a **prototype-then-promote** model rather than reworking the live editor to operate directly against real framework components (rejected: a fundamentally different rendering model — the editor's sandboxed `srcdoc` iframe approach can't render a real React/Vue component the way a real dev server can). Keep the existing sandboxed-artifact/editor pipeline exactly as-is for the "explore and iterate" phase, and add one new, additive capability: an explicit step that ports a *finished* prototype into the app's real code, once.

## What Changes

- **New tool `port_open_design_artifact_to_app`** (`src/tools/portToAppCodeTool.ts`): input `{ entryPath, targetComponentPath?, referenceComponentPath? }`. Reuses the existing `getArtifact()` (`src/core/workspace/artifactWriter.ts`) to read the artifact's current content — same helper `get_open_design_artifact` already uses. Returns `{ instructions, suggestedTargetComponentPath }` only — no file writes, matching every other content-producing tool in this extension.
- **New instruction composer** (`src/core/generation/portToAppInstructions.ts`): `suggestTargetComponentPath()` — a cheap, best-effort heuristic (plain `fs.readdir`/existence checks against `src/components/`, `app/components/`, `components/` in priority order, guessing the file extension from whatever's already there) — and `composePortToAppInstructions()`, which tells the model to (1) read the embedded artifact content, (2) ground the port in a real reference component — explicitly given, or found by searching the workspace itself, never guessed, (3) translate styling rather than copy inline CSS verbatim, (4) use static content unless the reference pattern shows props/data, (5) explicitly not wire routing/navigation.
- **New entry point**: a "Promote to App Code" button in the Artifact Preview editor's toolbar (`src/webview/main.ts`, always visible — not mode-gated, unlike the Comment-mode-only "Send comments to chat" button), wired through a new `'promote-to-app-code'` message case in `artifactEditorProvider.ts` (same pattern as the existing `'send-comments-to-chat'` case) that opens a prefilled chat message naming the tool and the artifact's entry path explicitly.
- Registered in `registerTools.ts`, declared in `package.json`'s `languageModelTools`, documented in `instructions/open-design.instructions.md`.

## Explicit scope cuts (flagged, not silently dropped)

- No automatic routing/navigation wiring — real blast radius, left as an explicit manual follow-up the instructions themselves call out.
- No live/continuous sync between the prototype and the promoted code — a one-time "port now" action; re-run manually if the prototype is edited further afterward.
- No cross-framework adapters or special-cased framework logic in the extension itself — the model works from whatever real reference component it's given or finds.
- No new workspace file-search utility built for reference-component discovery — entirely the model's own job via its existing tools.

## Impact

- New: `src/core/generation/portToAppInstructions.ts`, `src/tools/portToAppCodeTool.ts`, `src/test/unit/portToAppInstructions.test.ts`.
- Modified: `src/tools/registerTools.ts`, `src/webview/main.ts`, `src/extension/customEditors/artifactEditorProvider.ts`, `instructions/open-design.instructions.md`, `package.json`, `README.md`, `openspec/specs/open-design-tools/spec.md` (new requirement: Promoting a Prototype to Real Application Code).
