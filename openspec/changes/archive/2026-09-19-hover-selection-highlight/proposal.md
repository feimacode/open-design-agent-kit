# Hover and selection highlighting in Comment/Edit modes

## Why

The user pointed out that open-design's own editor lets you see what you're about to select before clicking, and shows what's currently selected — we had neither: clicking an element in Comment or Edit mode opened its panel with zero visual feedback beforehand or during. Researched open-design's actual mechanism directly rather than guessing: it has two separate systems, an elaborate edit-mode bridge (`apps/web/src/edit-mode/bridge.ts`) that draws Figma-style alignment/measurement guides between hover and selection, and a simpler comment-mode overlay (`apps/web/src/runtime/srcdoc.ts`'s `injectSelectionBridge`) that's just one positioned box per state — solid blue border + translucent fill, hover 1px, selection 2px. Both read element rects via `getBoundingClientRect()` and relay them to the host via postMessage, because upstream's preview iframe is genuinely cross-origin in production.

## What Changes

- `src/webview/main.ts`: tracks `hoverElement`/`selectedElement` module state. `mouseover`/`mouseout` listeners on the iframe's document (added alongside the existing `click` listener) update `hoverElement`; clicking sets `selectedElement` and clears hover. Since this extension's preview iframe is same-origin `srcdoc` (`allow-same-origin`), no postMessage bridge is needed — `getBoundingClientRect()` is read directly, same technique `commentOverlay.ts`'s `computePinPosition` already uses for comment pins.
- The comment-mode approach (one box, hover-thin/selection-thick) was chosen over the edit-mode bridge's alignment-guide approach as the simpler model that's still a real, visible affordance — not attempting the Figma-style measurement guides.
- `renderPins()` renamed to `renderOverlays()` and extended to draw the hover box and selection box (when present) alongside existing comment pins, in the same `#od-pins` overlay layer.
- Selection persists until its panel closes (Cancel/Save/Add/Remove/× button — all now funnel through a new shared `closePanel()` helper) or the mode changes; both `openCommentInput` and `openEditPanel` clear `selectedElement` on close, matching upstream's click-driven (not Escape-key) deselection model — confirmed via research that upstream has no Escape-to-deselect either.
- While Comment/Edit mode is active, the iframe body's CSS cursor is forced to `pointer` (cleared back to default in View mode) — an ambient "you're in pick mode" signal, matching upstream forcing `cursor: pointer`/`crosshair` on the whole body while its own picker modes are active.
- `html`/`body` and zero-size elements are excluded from highlighting (`isHighlightable()`), matching upstream excluding the root elements from both of its hit-testing loops.
- New CSS: `.od-hover-box`/`.od-select-box` in `artifactEditorProvider.ts`, using the existing `--od-blue` token (close to upstream's own `#1677ff`) rather than a hardcoded upstream hex, for consistency with the rest of the theme.

## Explicit scope cuts vs. upstream

- No Figma-style alignment/measurement guide lines between hover and selection (upstream's edit-mode-only feature).
- No floating tag-name label near the cursor, no breadcrumb/ancestry trail — confirmed via research that upstream doesn't have these either.
- No Escape-to-deselect or arrow-key parent/sibling navigation — confirmed via research that upstream has neither.
- No "free pin" fallback for clicking empty non-element space in Comment mode (upstream drops a pin at the exact click point when there's no annotated ancestor) — out of scope for this round, comments here still require clicking an actual highlightable element.

## Impact

- Modified: `src/webview/main.ts`, `src/extension/customEditors/artifactEditorProvider.ts`, `README.md`, `openspec/specs/open-design-tools/spec.md` (new requirement: Hover and Selection Highlighting in Comment/Edit Modes).
