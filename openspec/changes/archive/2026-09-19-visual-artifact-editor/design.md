# Design: visual artifact editor + gallery/remix

## Editor registration

`vscode.CustomTextEditorProvider` (not the full `CustomEditorProvider`) — HTML artifacts are plain text, so `vscode.workspace.applyEdit` gives free save/undo integration without a custom document model. `contributes.customEditors` selector is `**/*.html` with `priority: "option"`, so it never hijacks the default HTML editor; it's reachable via "Reopen With...", the "OpenDesign: Open Artifact Preview" command, an Explorer context-menu entry, or automatically after `register_open_design_artifact` succeeds. Accepted trade-off: this also matches non-OpenDesign `.html` files in the workspace (`customEditors` selectors can't express "only files with a sidecar manifest") — it degrades gracefully, rendering a plain preview with no manifest/comments found.

## Three modes, one webview

Mirrors upstream's own `FileViewer` modality (view/comment/edit as toggles on one surface) rather than three separate views — a small in-webview toolbar switches modes; mode state lives entirely client-side in the webview script, not pushed from the extension host.

## Where ported logic runs: the webview's browser context

`source-patches.ts`'s DOM-diff/re-serialize approach needs `DOMParser`/`document` — unavailable in the Node extension host without a dependency like jsdom. Upstream itself runs this client-side; the direct port target is the webview's own script, which has a real DOM via the rendered iframe. This required a second esbuild entry point (`src/webview/main.ts`, browser platform, IIFE, output to `dist/webview/main.js`) and a separate TypeScript project (`src/webview/tsconfig.json`, `lib: ["ES2020", "DOM"]`, no Node `types`) distinct from the root project (`lib: ["ES2020"]` only, Node types) — the two run in fundamentally different JS environments and can't share a tsconfig. `npm run typecheck` now runs both projects; the root `tsconfig.json` explicitly excludes `src/webview/**/*` so it isn't also (incorrectly) type-checked against a Node-only lib.

**Simplification found during the port, not upstream-driven**: upstream's `edit-mode/bridge.ts` needs a real `postMessage` bridge between the outer app and the preview iframe because they're genuinely cross-origin in the deployed product. This extension's preview iframe is `srcdoc`-rendered with `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"`, which keeps the iframe's effective origin accessible to the parent frame — so `iframe.contentDocument` is directly queryable from the outer webview script with no injected in-iframe bridge script at all. This is a strictly simpler shape than upstream's, appropriate because this embedding context isn't actually cross-origin the way upstream's is. (`allow-scripts`+`allow-same-origin` together is flagged as an escapable sandbox pattern for genuinely untrusted content — accepted here because this iframe only ever renders content the user's own model just generated locally, the same tradeoff upstream itself makes for its "powered preview" mode.)

## Comment sidecar format (`<entry>.comments.json`)

Deliberately smaller than upstream's SQLite-backed `PreviewComment` (`packages/contracts/src/api/comments.ts`): drops `conversationId`, `podMembers`, `slideIndex`, `authorMemberId`, and other multi-user/collab fields — no daemon, single local user, no deck/slide support in v1. Anchor freshness and on-screen pixel position are **not persisted** — recomputed live in the webview against the current DOM each render, via a simplified two-step lookup (exact `data-od-id` match, else CSS selector match, else unanchored) rather than upstream's fuzzy htmlHint/text-similarity drift ladder with cross-session position caching.

## Comments → chat (identical in spirit to upstream, not merely inspired by it)

Upstream's actual mechanism — confirmed by reading it, not assumed — is that a comment is never "applied" by a special engine. Selected comments are serialized into the next chat message as a structured, scoped instruction block; the agent edits the file like any normal request. `artifactEditorProvider.ts`'s `formatCommentsForChat()` reproduces this directly: gathered open comments become a message handed to `workbench.action.chat.open` with `isPartialQuery: true` (same prefill pattern already used by the design-system browse command), and the model does the actual editing with its own native tools — no new "apply" mechanism was needed anywhere in this stack.

## WYSIWYG write path

Webview posts `{ type: 'apply-patch', newSource }` (already patched + re-serialized against the live DOM) → `artifactEditorProvider.ts` builds a `vscode.WorkspaceEdit` replacing the full document range → `vscode.workspace.applyEdit(edit)`. VS Code owns the undo-stack entry and on-disk save automatically per `CustomTextEditorProvider`'s contract — no custom document model or save handler needed.

## Entry path resolution uses the document's actual containing folder, not "the first workspace folder"

`src/core/workspace/artifactWriter.ts`'s existing `getWorkspaceRoot()` always assumes `vscode.workspace.workspaceFolders[0]` — a known simplification acceptable for tool calls (which act on "the workspace" as a singular concept). The custom editor provider does not reuse it: it resolves `vscode.workspace.getWorkspaceFolder(document.uri)` instead, so a multi-root workspace computes the artifact's `entryPath` (used for the comments sidecar) relative to the folder that actually contains it, not folder zero. If a `.html` file is opened from outside any workspace folder, comment persistence is silently disabled (view/edit modes still work) rather than erroring.

## Gallery + Remix

Upstream's Community/Gallery is "browse the curated example-plugin catalogue" and Remix is "copy an existing example's rendered HTML into a new project + seed the first prompt as a modification instruction, not a fresh-generation one" (traced end-to-end through `apps/daemon/src/plugins/duplicate-project.ts` and `apps/daemon/src/routes/plugins/index.ts`) — both are thin layers over `plugins/_official/examples/*/{SKILL.md, open-design.json, example.html}` (same `SKILL.md` shape as `skills/`/`design-templates/`, plus an actual rendered artifact), and neither needs the daemon's project database or multi-user bookkeeping to reproduce the core mechanic.

- **Vendoring**: `scripts/sync-open-design-content.mjs` gained `copyExamples()`, which only vendors entries that actually have a rendered `example.html` (169 of 183 upstream entries do; many `plugins/_official/examples/*` folders are skill-only, no artifact), copies any sibling `assets/` folder, and **caps each example at 2MB** — 2 outliers (`open-design-landing` 22MB, `open-design-homepage` 12MB, both asset-heavy) are excluded, keeping the vendored addition to ~8.3MB across 167 entries rather than ~43.5MB across 169. This is an implementation-level size/completeness trade-off, not a scope change requiring separate approval — documented here for visibility.
- **Content model**: `ContentIndex` merges this as a fourth pool (`source: 'example'`) into the same unified skill/template catalog, sharing the `od:<mode>:<name>` id scheme. An entry's `exampleArtifactPath` field (only present when a vendored `example.html` exists) is both the remix data source and the "is this remixable" signal — no separate flag needed. Its `examplePrompt` comes from a sibling `open-design.json`'s `od.useCase.query.en` (a different manifest file than skills/templates use for the same concept, `od.example_prompt` in `SKILL.md` itself) — reflects upstream's own inconsistency between the two content shapes, not an inconsistency introduced here.
- **Shared orchestration**: `performRemix()` (`src/core/workspace/remixOrchestrator.ts`) holds the copy-and-register logic once, used by both `remixExampleTool.ts` (the languageModelTool) and `browseGalleryCommand.ts` (the QuickPick command) — extracted specifically so the command doesn't need to go through `vscode.lm.invokeTool`'s confirmation-dialog ceremony just to reuse tool logic.
- **Reproduces upstream's actual modification-instruction behavior** (`skipDiscoveryBrief` + pending-prompt-as-modification in the real product) without needing project/discovery-brief machinery this extension doesn't have: the returned `instructions` string explicitly tells the model the file already exists and to treat the brief as a targeted modification, not a fresh generation.

## Explicit scope cuts vs. upstream

- No multi-slide deck support — comment/edit modes target single-document `kind: 'html'` artifacts (decks still get read-only preview).
- No JSX/react-component WYSIWYG editing (matches upstream's own limitation — no JSX patch path exists there either). Preview still works via the same client-side Babel-standalone + React/ReactDOM UMD CDN approach upstream uses; vendoring those scripts locally for full offline support is a reasonable follow-up, not done here.
- No freehand/stroke visual annotations (upstream's `PreviewDrawOverlay`) — click-to-pin element comments only.
- No version history/diff UI.
- Style-edit patch UI ships with a small curated property set (color, background, font size, padding) vs. upstream's full style panel.
- No multi-user/collaboration fields (single local user, no daemon).
- No "duplicate my own past artifact" — upstream treats that as a distinct, simpler concept from Remix (plain file copy, no prompt reseeding); a user can just copy the file themselves in the Explorer.
- Gallery/Remix v1 covers only `plugins/_official/examples/*` (bundled official examples) — no community/marketplace plugin registry integration (this extension has no plugin install mechanism at all).
- No automated test coverage for the webview's browser-context code (`elementTargeting.ts`, `sourcePatches.ts`, `commentOverlay.ts`, `main.ts`) — no DOM test harness (jsdom) exists in this repo. Manual verification in the Extension Development Host covers it; this is the same kind of documented gap as the still-missing `@vscode/test-electron` integration suite.
