# Visual artifact editor: live preview, comments, WYSIWYG editing, gallery + remix

## Why

Everything built so far only lets a user generate artifacts through chat — there's no way to look at a generated artifact inside VS Code, comment on specific parts of it, directly nudge an element, or start from an existing example instead of a blank slate. open-design's own product has exactly these capabilities (`FileViewer.tsx`'s view/comment/edit modes, and its Community Gallery/Remix feature), so the user asked to explore porting them.

Research this session traced open-design's actual implementation and found two things that made this tractable without the daemon:
1. `FileViewer.tsx` itself (20,000 lines) is not portable — Next.js app chrome deeply coupled to routing/chat/state — but the mechanisms underneath it (`edit-mode/bridge.ts` + `source-patches.ts`, `comments.ts`) are framework-agnostic TypeScript with no React/Next dependency, and a comment is **never applied by a special engine** — it's serialized into the next chat message as an instruction block, which the agent then acts on with its own normal file-editing tools. That's exactly compatible with this extension's existing architecture.
2. Gallery and Remix turned out to be thin layers over the same kind of data already handled (`SKILL.md`-shaped entries under `plugins/_official/examples/*`, each with an actual rendered `example.html`), and Remix's core mechanic — copy an example's HTML into a new file, tell the agent to modify it rather than regenerate from scratch — needs no daemon project database at all.

On the VS Code side: the Custom Editor API (stable) is the right host for a live, editable preview, with `CustomTextEditorProvider` giving free save/undo when a manual edit writes back to the document. The native Comments API was evaluated and rejected for this — it's anchored to text-document line/character ranges only, with no way to visually pin a comment onto a rendered DOM element, which doesn't match how either upstream's or this feature's comments actually work (DOM-element-anchored).

## What Changes

- New **Custom Editor** (`openDesign.artifactEditor`, `priority: "option"` on `**/*.html`) rendering a live sandboxed preview with three toggleable modes: **View**, **Comment** (click an element, pin a note, "Send to chat" hands selected comments to Copilot as a scoped edit instruction), and **Edit** (HTML artifacts only — click an element to change text/color/background/font-size/padding or remove it, written back via `WorkspaceEdit` with full undo support).
- Comments persist as a new `<entry>.comments.json` sidecar (`src/core/workspace/artifactComments.ts`), read back by `get_open_design_artifact`'s new `openComments` field so the model can check pending feedback.
- New **`remix_open_design_example`** tool and **`OpenDesign: Browse Gallery`** command: copy one of ~167 vendored example artifacts into the workspace as a real starting file (`assets/open-design/examples/`, newly vendored from `plugins/_official/examples/*`, capped at 2MB/example), register it, and return instructions telling the model to modify the copy rather than regenerate from scratch.
- `register_open_design_artifact` now auto-opens the new preview editor on success (HTML artifacts); a new `openDesign.openArtifactPreview` command and Explorer context-menu entry open it manually.
- A second esbuild target (`dist/webview/main.js`, browser platform) and a separate `src/webview/tsconfig.json` (DOM lib, no Node types) build the webview's client-side script, since the ported element-finding/patch/comment logic needs `DOMParser`/`document`, unavailable in the Node extension host.

## Capabilities

### New: `open-design-tools` visual editing and gallery

Adds a live, interactive preview surface with comment and WYSIWYG capabilities, plus a browsable gallery of remixable starting artifacts — all layered on the existing tool-based architecture with no daemon, no MCP, and no bespoke UI framework beyond the extension's own webview.

## Impact

- New dependency-free bundle target: `dist/webview/main.js` (IIFE, browser platform) alongside the existing `dist/extension.js` (Node/CJS).
- New vendored content pool: `assets/open-design/examples/` (~8.3MB, 167 entries after a 2MB-per-example size cap excludes 2 outliers).
- Explicit, documented scope cuts vs. upstream (see `design.md`): no deck/multi-slide support in comment/edit modes, no JSX WYSIWYG editing (matches upstream), no freehand annotation, no version history/diff UI, a curated (not full) style-edit property set, no multi-user fields, no "duplicate my own past artifact," Gallery/Remix limited to bundled official examples (no marketplace/community plugin integration).
- No automated test coverage for the webview's browser-context code in this pass — no DOM test harness (jsdom) exists in this repo yet; extension-host logic that's plain Node (`artifactComments.ts`, `remixExample.ts`, the `ContentIndex` examples pool) is unit tested per the existing patterns.
