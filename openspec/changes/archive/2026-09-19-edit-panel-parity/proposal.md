# Edit panel: closer parity with open-design's own ManualEditPanel

## Why

After the previous round fixed the cross-realm `instanceof` bug that made Edit mode inert, the user tried it and said it's "still not the same level of the original open design editor" and asked to borrow from the original project. Researched `apps/web/src/components/ManualEditPanel.tsx` (1261 lines) directly in `/home/iven/tools/open-design` to see exactly what the real editor offers, rather than guessing: element-kind-aware content fields (image/link/container/text each get different inputs), a much larger style section (typography, box model with independent per-side padding/margin, border, opacity), a floating panel with a header/body/footer shape, undo/redo, a design-token reference strip, drag-to-reposition, and a richer patch model (`set-link`, `set-image`, `set-outer-html`, `set-attributes`, `set-token`, `set-full-source` beyond `set-text`/`set-style`/`remove-element`).

## What Changes

- `src/webview/dom/sourcePatches.ts`: `ManualEditPatch` gains `set-link` (text+href), `set-image` (src+alt), `set-outer-html` (raw HTML replace for container elements); `CuratedStyles` expands from 4 properties to 20 (opacity, font family/weight, line height, letter spacing, text align, border radius/color/width/style, and per-side padding/margin instead of one shared `padding` value).
- `src/webview/main.ts`: `openEditPanel` is now element-kind-aware (`classifyEditKind`: image/link/container/text, by tag and whether the element has child elements) — each kind gets its own Content section fields, matching upstream's `ContentInspector`. The Style section is rebuilt with paired-row and per-side quad-row layouts for the expanded property set. The panel gained a header (element description + close button) and a redesigned footer (Remove on the left, Cancel/Save on the right), and `openCommentInput` was restructured to the same header/body/footer shape for visual consistency and to simplify the CSS to one shared panel layout.
- `src/extension/customEditors/artifactEditorProvider.ts`: panel CSS widened (300px → 340px, scrollable body, `max-height`) and rebuilt for the new header/body/footer/row-pair/row-quad structure.

## Explicit scope cuts vs. upstream (flagged, not silently dropped)

- No flex-layout controls (direction/justify/gap/align-items) — upstream disables these unless the element `isLayoutContainer`, which needs container-detection logic this extension doesn't have yet.
- No design-token reference strip — upstream sources it from a live codebase scan of the project's own design-token files; no equivalent index exists here.
- No drag-to-reposition (upstream's free-drag `transform` editing via canvas pointer events).
- No in-panel undo/redo history stack — every patch here is still written through `vscode.workspace.applyEdit`, so VS Code's own document undo (Ctrl+Z) already covers each committed change; a separate history stack would duplicate that.
- No image upload (local file picker) — image editing is URL + alt text only, no asset-copy flow.
- No `set-attributes`/`set-token`/`set-full-source` patch kinds — not needed without the token-reference strip or multi-target editing upstream uses them for.

## Impact

- Modified: `src/webview/dom/sourcePatches.ts`, `src/webview/main.ts`, `src/extension/customEditors/artifactEditorProvider.ts`, `README.md`, `openspec/specs/open-design-tools/spec.md` (Direct WYSIWYG Editing requirement updated + new scenario).
