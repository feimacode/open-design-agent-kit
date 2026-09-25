# Provenance: vendored code

Source: https://github.com/nexu-io/open-design (local checkout `/home/iven/tools/open-design`), commit `eca7c7ab9898`, synced 2026-09-18. Upstream `open-design` is licensed **Apache-2.0** — see its `LICENSE` file. This repository as a whole is MIT-licensed, but the two files below are adaptations of Apache-2.0-licensed code and retain that provenance; if you redistribute this extension, keep this notice and the upstream attribution intact for these two files, per Apache-2.0 §4.

## What was ported, and how

- **`artifactManifest.ts`** — ported close to verbatim from `apps/daemon/src/artifacts/manifest.ts`. Pure validation/sanitization logic, no daemon/HTTP/SQLite coupling in the original, so no adaptation needed beyond module syntax.
- **`artifactCreate.ts`** — adapted from `apps/daemon/src/artifacts/create.ts`. The daemon's version takes an injected `writeProjectFile` callback so the same code can target an HTTP-backed project store; this extension only ever writes to the local VS Code workspace filesystem, so that indirection was dropped in favor of direct `fs/promises` calls scoped to a `workspaceRoot`. The manifest-resolution/validation behavior (`resolveArtifactManifest`, formerly `resolveCreateArtifactManifest`) is unchanged.
- **`composeSystemPrompt()`** (`packages/contracts/src/prompts/system.ts`, ~1180 lines) was **NOT** ported. It is tightly coupled to Open Design's own product surface: a `<question-form>` UI protocol only OD's own web/daemon client renders, `<od-card>` verify-scorecard/memory-applied tags, the "OD Next" strategy-recipe fork, a personal-memory subsystem, deck-framework CLI dispatch (`$OD_NODE_BIN`/`$OD_BIN`), a media-generation contract, and explicit references to CLI-agent tool names (`TodoWrite`, `Bash`, `Read`, `Write`, `Edit`) that don't exist in a VS Code Copilot Chat context. Porting it verbatim would hand Copilot's model instructions describing tools and UI markup it cannot use. Instead, `../generation/composeInstructions.ts` is a new, minimal function written for this project, reusing only the one clearly generic, non-product-specific piece — the "semantic output file names" guidance — and otherwise re-deriving the skill + design-system + craft + brief layering idea from scratch for this project's actual tool surface (native VS Code file-editing tools, no CLI, no daemon UI markup).

## Visual editor (webview), added 2026-09-19 — see `openspec/changes/archive/2026-09-19-visual-artifact-editor/design.md` for the full reasoning

The webview client (`../../webview/`) is **adapted, not ported verbatim**, from three upstream files — the scope was deliberately narrowed (see that change's "Explicit scope cuts" in its `proposal.md`), not a line-for-line transcription of ~2,900 upstream lines:

- **`src/webview/dom/elementTargeting.ts`** — adapted from `apps/web/src/edit-mode/bridge.ts`. Upstream needs a real postMessage bridge because its preview iframe is genuinely cross-origin in the deployed app; this extension's `srcdoc` + `allow-same-origin` iframe makes `contentDocument` directly queryable from the outer webview script, so the whole bridge-protocol layer was dropped — only the element-identification strategy (`data-od-id` / CSS selector / positional fallback) carries over.
- **`src/webview/dom/sourcePatches.ts`** — adapted from `apps/web/src/edit-mode/source-patches.ts`. Same `DOMParser`-based re-serialize approach, but the patch vocabulary is cut down to `set-text`/`set-style` (curated properties only: color, background, font size, padding)/`remove-element` — upstream additionally has `set-link`, `set-image`, `set-outer-html`, and design-token patches.
- **`src/webview/dom/commentOverlay.ts`** — adapted from `apps/web/src/comments.ts`. Upstream's full drift ladder (`anchored`→`reanchored`→`stale`→`lost`, with fuzzy text/selector/position-proximity matching and cross-session position caching) is simplified to a two-step lookup (exact `data-od-id`, else CSS selector, else unanchored) with no persisted position cache.
- **`src/core/workspace/artifactComments.ts`**'s `ArtifactComment` shape is a deliberately smaller version of upstream's SQLite-backed `PreviewComment` (`packages/contracts/src/api/comments.ts`) — no `conversationId`/`podMembers`/`slideIndex`/multi-user fields, stored as a plain `<entry>.comments.json` sidecar instead of a database row.
- **The "comments → chat" mechanism is not adapted, it's identical in spirit**: upstream never applies a comment through a special engine either — it serializes selected comments into the next chat message as a scoped instruction block, and the agent edits the file normally. `artifactEditorProvider.ts`'s `formatCommentsForChat()` reproduces that exact idea for `workbench.action.chat.open`.
- **Gallery/Remix** (`src/core/workspace/remixExample.ts`, `remixOrchestrator.ts`) reproduce upstream's actual Remix *effect* (copy an example's rendered HTML + assets into a new file, tell the agent to treat it as an existing file to modify) without any of upstream's project-database/multi-user machinery — confirmed unnecessary by tracing the real implementation (`apps/daemon/src/plugins/duplicate-project.ts`).

## Design collections, added 2026-09-23

`artifactManifest.ts`'s validator/`sanitizeManifest()` gained four new optional fields — `collectionId`, `collectionName`, `screenRole`, `screenIndex` — a deliberate, additive divergence from the upstream-ported validator (upstream's own manifest shape has no such concept). Each is validated the same way the file already validates `sourceSkillId`/`designSystemId` (bounded-length optional string, or for `screenIndex` a bounded non-negative integer). No central collection registry exists anywhere in this codebase — a "collection" is just several artifacts whose manifests happen to share a `collectionId`, discovered by scanning (`workspace/collectionScan.ts`), not by any index file.

## Figma push/pull, added 2026-09-22

- **`packages/vscode/assets/figma-plugin/{manifest.json, code.js, ui.html, IR.md, README.md}`** — copied byte-for-byte from `figma-plugin/` at commit `f2e649efb2be`, unmodified. This is open-design's own "OD Figma Import" Figma development plugin: a small (4-file, no-build-step), Apache-2.0-licensed, dependency-free Plugin API script that rebuilds a `.od-figma.json` capture into real Figma layers. Vendored verbatim (not adapted) because the new `packages/vscode/src/webview/dom/figmaCapture.ts` capture *producer* is written to stay byte-for-byte structurally compatible with `IR.md`'s documented schema — the plugin needs no changes to consume captures produced by this extension instead of the OD Clipper.
- **`packages/vscode/src/webview/dom/figmaCapture.ts`**'s `captureFigmaIr()` is adapted from `clipper/capture.js`'s `buildFigmaIr()` (same commit) — the DOM/CSSOM-walking logic (`getComputedStyle`, `getBoundingClientRect`, `Range`-based text geometry, the color/shadow/radius/border parsing helpers) is a close port, retargeted to walk this extension's own artifact preview iframe (`iframeDoc`/`iframeDoc.defaultView`) instead of a live top-level browser tab, and to leave non-`data:` image references as raw (non-absolutized) reference strings for the extension host to resolve against the entry file's own directory afterward, rather than deduping into a shared cross-origin fetch queue the way the original (running inside a browser extension, fetching real remote pages) needs to.
- **`packages/core/src/workspace/figmaCapture.ts`**'s `FigmaCaptureDocument` types are hand-transcribed from `IR.md`'s documented JSON shape (not copy-pasted code — there is no upstream TypeScript type for this format to port from).

## Visual design tokens, added 2026-09-19 — see `openspec/changes/archive/2026-09-19-open-design-visual-language/design.md`

`src/extension/webviews/openDesignTheme.ts`'s color/radius/shadow/typography values are **hand-transcribed** (not copy-pasted CSS, but the same numbers) from upstream's `apps/web/src/styles/{tokens.css,base.css,primitives.css}`, `apps/web/src/styles/viewer/{core.css,memory.css}`, and `apps/web/src/styles/home/plugin-marketplace-demo.css` — read directly, not guessed. Also vendored: `assets/fonts/AlbertSans-VariableFont_wght.ttf`, copied byte-for-byte from `apps/web/public/fonts/AlbertSans-VariableFont_wght.ttf`. Albert Sans is a Google Font distributed under the **SIL Open Font License 1.1** (open-design itself bundles/self-hosts it under the same license, not a custom commercial font) — freely redistributable and embeddable; no attribution string is required in the UI, but this notice records where the copy came from. Only the regular (non-italic) variable-weight file was vendored; open-design also ships an italic variant, not needed here.

## Export formats, added 2026-09-25

`artifactManifest.ts`'s `ALLOWED_EXPORTS` gained `png`, `jpeg` and `pptx`: the raster and deck formats this project's export pipeline produces (`src/export/`). Upstream's allow-list has no such values because its desktop app never records them in a manifest. Which formats each kind advertises is decided by `src/export/exportFormats.ts` (not ported), which replaced three host-local copies of upstream's `['html', 'pdf', 'zip']`-style lists. Legacy manifests listing `zip` still validate.

## Deck export, added 2026-09-25 (see `openspec/changes/deck-pptx-pdf-export/`)

Adapted from upstream at commit `1b47e60bd466` (Apache-2.0). Each file carries a header naming its origin:

- **`src/export/deck/selectors.ts`**: selector constants from `apps/desktop/src/main/deck-capture.ts`. Divergence: `HIDE_CHROME_SELECTOR` adds `.nav-hint`, a keyboard-hint bar several vendored decks place outside their slides.
- **`src/export/deck/pageScripts.ts`**: `countRealSlides`, `prepareDeckStage`, `pinDeckStage`, `measureSlide`, `showSlide`, `restackActiveSlide`, `restoreActiveSlideCapture` (nested) and `showAllSlides` from the same file. Divergences:
  - Each function is **self-contained**. Upstream composes siblings by name at call time, which breaks once a bundler minifies names; `pageScripts.test.ts` checks both the compiled and the esbuild-minified output for free identifiers.
  - Selectors are passed in as arguments.
  - `prepareDeckStage` also forces lazy images eager.
  - `restackActiveSlide` falls back from `Element.moveBefore` to `insertBefore`/`appendChild` on older browsers and reports it.
  - Types are `any` so no DOM lib types leak into the rest of core.
- **`src/export/deck/deckStageFallback.ts`**: the `<deck-stage>` fallback script from `packages/contracts/src/runtime/deck-stage-fallback.ts`, extracted verbatim. Divergences:
  - protocol constants are inlined;
  - injection goes before the last `</body>` instead of upstream's ~900-line HTML scanner;
  - it's skipped when the page already loads a `deck-stage` runtime script.
- **`src/export/deck/assemble.ts`**: `resolvePptxConstructor`, `buildScreenshotPptx` → `assemblePptx` and `buildScreenshotPdf` → `assemblePdf` from `apps/daemon/src/deck-export.ts`. Unchanged apart from the PDF title and producer metadata.
- **`src/export/deck/captureDeck.ts`**: the capture loop, adapted from `renderDeckSlides` for puppeteer. Divergences:
  - clipped `page.screenshot` replaces Electron `capturePage` and CDP;
  - a compressed-size heuristic flags blank slides, replacing upstream's bitmap scan;
  - the page-versus-deck decision also consults the manifest `kind` and an `od:deck:*` source skill.
- **Not ported:** editable PPTX (`dom-to-pptx` plus its normalization passes), stitched whole-deck images, and upstream's Electron window and IPC plumbing.
