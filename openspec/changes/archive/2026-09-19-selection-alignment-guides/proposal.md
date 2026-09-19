# Selection alignment guides ("grid")

## Why

The user asked for a grid to appear when selecting an element. This maps directly onto a feature already researched (and explicitly deferred) in the twentieth/twenty-first rounds: upstream's edit-mode bridge draws crosshair reference guide lines from the selected element's edges across the canvas, alongside live gap/measurement labels between hover and selection — flagged at the time as "no Figma-style alignment/measurement guide lines... upstream's edit-mode-only feature" to keep the initial hover/selection port simple. This round ports the guide-line part of that (not the live measurement labels, which need continuous hover-vs-selection gap computation — a bigger addition than what was asked for).

## What Changes

- `src/webview/main.ts`: new `selectionGuides()` builds four dashed line elements from the selected element's top/bottom/left/right edges, spanning the full width/height of the preview stage (the iframe's own bounds, not the whole webview window). Drawn in `renderOverlays()` only for the selected element (not on hover), positioned beneath the selection box so the box's own border reads cleanly on top.
- `highlightBox()` was refactored to take a pre-computed rect (`hostRectOf()`, extracted from its old iframe-rect-lookup body) so the same rect can be reused for both the selection box and its guide lines without recomputing `getBoundingClientRect()` twice.
- New CSS: `.od-guide-line`/`.od-guide-h`/`.od-guide-v` in `artifactEditorProvider.ts` — 1px dashed lines in the same `--od-blue` accent already used for hover/selection boxes.
- Also formalized, in the same spec requirement, the guarantee restored by the immediately-prior `fix-hover-selection-pointer-events` change (highlighting/hit-testing works uniformly across all elements, not just ones the artifact's own CSS treats as interactive) — that round fixed the behavior but didn't yet have a SHALL-level scenario for it; added here since both touch the same requirement text.

## Explicit scope cut

- No live gap/measurement distance labels between the hovered and selected element (upstream's actual Figma-style spacing-inspector behavior) — this round is the static reference-line "grid" only, which is what was asked for; the dynamic measurement labels would need continuous recomputation on every hover move and are a meaningfully bigger feature.

## Impact

- Modified: `src/webview/main.ts`, `src/extension/customEditors/artifactEditorProvider.ts`, `README.md`, `openspec/specs/open-design-tools/spec.md` (extended the Hover and Selection Highlighting requirement + one new scenario for uniform hit-testing).
