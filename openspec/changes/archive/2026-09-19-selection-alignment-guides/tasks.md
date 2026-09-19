# Tasks: selection-alignment-guides

## 1. Implementation

- [x] Refactored `highlightBox()` to take a pre-computed rect; extracted `hostRectOf()` for the iframe-rect + element-rect computation (previously inline)
- [x] `selectionGuides(rect)` — four dashed lines (top/bottom edges full-width, left/right edges full-height) spanning the preview stage's bounds
- [x] `renderOverlays()` draws guides + selection box for `selectedElement` only (not hover), guides drawn before the box so the box's border sits visually on top
- [x] CSS: `.od-guide-line`/`.od-guide-h`/`.od-guide-v` (1px dashed, `--od-blue` accent, translucent)

## 2. Documentation

- [x] README's WYSIWYG section mentions the alignment guides
- [x] `openspec/specs/open-design-tools/spec.md`: extended "Hover and Selection Highlighting" requirement text + selected-element scenario for guide lines; also added a scenario formalizing the uniform-hit-testing guarantee from the immediately-prior pointer-events fix (same requirement, not previously captured at SHALL-level)
- [x] `openspec validate --specs --strict` — clean

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed `od-guide-line`/`selectionGuides` in `dist/webview/main.js` and `od-guide-h`/`od-guide-v` CSS in `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — select an element in Comment/Edit mode and confirm four dashed guide lines extend from its edges across the canvas. Same documented, recurring gap as every prior change in this repo.
