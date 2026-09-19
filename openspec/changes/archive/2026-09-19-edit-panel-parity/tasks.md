# Tasks: edit-panel-parity

## 1. Research

- [x] Read `apps/web/src/components/ManualEditPanel.tsx` directly (not guessed) to catalogue its real controls, layout, contextual behavior, visual details, and patch model — see subagent report in session transcript
- [x] Decided what to port vs. cut, with explicit reasoning per cut (flex layout, token reference strip, drag-to-reposition, in-panel undo/redo, image upload, extra patch kinds)

## 2. Patch model

- [x] `sourcePatches.ts`: added `set-link`, `set-image`, `set-outer-html` to `ManualEditPatch`; expanded `CuratedStyles` from 4 to 20 properties (opacity, font family/weight, line height, letter spacing, text align, border radius/color/width/style, per-side padding × 4, per-side margin × 4)
- [x] `applyPatch()` handles the three new patch kinds; `set-outer-html` relies on the pre-filled textarea carrying the element's own `data-od-id` so a later patch can still find the (replaced) node

## 3. Panel UI

- [x] `classifyEditKind()` — image (IMG tag) / link (A tag) / container (has element children) / text (fallback)
- [x] `contentSectionHtml()` — per-kind content fields (image: URL+alt; link: text+href; container: raw HTML; text: text)
- [x] `styleSectionHtml()` — paired rows (color/background, font-size/weight, line-height/letter-spacing, font-family/text-align, border-radius/opacity, border-color/width) + border-style + quad rows for padding and margin
- [x] Panel header (element description via `describeElement()`, close button) and footer (Remove left, Cancel/Save right)
- [x] `openCommentInput` restructured to the same header/body/footer shape for consistency and to let the CSS share one panel layout

## 4. CSS

- [x] `artifactEditorProvider.ts`: `.od-panel` widened to 340px with `max-height`/`overflow: hidden`; new `.od-panel-header`/`.od-panel-body`/`.od-panel-footer`/`.od-row-pair`/`.od-row-quad`/`.od-color-input` rules; removed the now-unused `.od-panel-title`/`.od-panel-actions`/`.od-secondary` (dead CSS, confirmed via grep before removing)

## 5. Documentation

- [x] README's Custom editor bullet and "Preview, comments, and WYSIWYG editing" section updated with the new field set and explicit scope-cut list
- [x] `openspec/specs/open-design-tools/spec.md`: "Direct WYSIWYG Editing for HTML Artifacts" requirement rewritten for the expanded property set; new scenario for kind-aware content fields
- [x] `openspec validate --specs --strict` — clean

## 6. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed `set-link`/`set-image`/`set-outer-html` in `dist/webview/main.js` and the new panel CSS classes in `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — click an image, a link, a container, and plain text in Edit mode and confirm each shows its own content fields; adjust several style fields and confirm Save writes them all back correctly. Same documented, recurring gap as every prior change in this repo.
