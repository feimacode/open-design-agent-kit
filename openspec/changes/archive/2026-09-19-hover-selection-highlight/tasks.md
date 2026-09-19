# Tasks: hover-selection-highlight

## 1. Research

- [x] Read open-design's actual hover/selection mechanism directly — found two systems (`edit-mode/bridge.ts`'s alignment-guide overlay, `runtime/srcdoc.ts`'s simpler comment-mode box overlay) and chose the simpler one as the port target, with reasoning recorded in `design.md`-equivalent (proposal's "Why")
- [x] Confirmed via research: no Escape-to-deselect, no arrow-key navigation, no floating tag-name label, no breadcrumb — so none of these were mistakenly treated as missing scope

## 2. State and event wiring

- [x] `hoverElement`/`selectedElement` module state in `main.ts`
- [x] `mouseover`/`mouseout` listeners added alongside the existing `click` listener in the iframe's `load` handler
- [x] `onIframeClick` sets `selectedElement`, clears `hoverElement`
- [x] `isHighlightable()` excludes `html`/`body` and zero-size elements
- [x] `updatePickCursor()` forces `cursor: pointer` on the iframe body in Comment/Edit mode, clears it in View mode; called on mode switch and on iframe `load`

## 3. Rendering

- [x] `highlightBox()` — positions a box in host coordinates via `iframe.getBoundingClientRect()` + element `getBoundingClientRect()`, same technique as `commentOverlay.ts`'s `computePinPosition`
- [x] `renderPins()` renamed to `renderOverlays()`, extended to draw hover box + selection box alongside existing comment pins; all prior call sites updated (mode switch, iframe load, `commitPatch`, send-to-chat)
- [x] CSS: `.od-hover-box` (1px solid `--od-blue`, translucent fill) / `.od-select-box` (2px, stronger fill) in `artifactEditorProvider.ts`

## 4. Selection lifecycle

- [x] New shared `closePanel()` helper (hide panel + clear `selectedElement` + re-render) used by both `openCommentInput` and `openEditPanel`'s close/cancel/save/remove handlers, replacing each panel's own local close logic
- [x] `source-updated`/`init` message handler clears stale `hoverElement`/`selectedElement` references before replacing the iframe document (the old element references belong to a document about to be discarded)

## 5. Documentation

- [x] README's Custom editor bullet updated with hover/selection behavior
- [x] `openspec/specs/open-design-tools/spec.md`: new requirement "Hover and Selection Highlighting in Comment/Edit Modes" with two scenarios
- [x] `openspec validate --specs --strict` — clean

## 6. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed `od-hover-box`/`od-select-box` present in both `dist/webview/main.js` and `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — hover elements in Comment/Edit mode and confirm the thin outline follows the pointer, click one and confirm a thicker persistent outline appears and stays until the panel closes. Same documented, recurring gap as every prior change in this repo.
