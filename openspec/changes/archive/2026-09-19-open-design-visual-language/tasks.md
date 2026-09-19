# Tasks: open-design-visual-language

## 1. Research

- [x] Research open-design's actual design tokens (colors, typography, spacing, radius, shadows) by reading its real stylesheets directly — `apps/web/src/styles/{tokens.css,base.css,primitives.css}`, `viewer/{core.css,memory.css}`, `home/plugin-marketplace-demo.css`, plus `PreviewDrawOverlay.tsx`'s inline styles
- [x] Confirmed the actual brand font (Albert Sans, self-hosted variable font) exists as a real file in the open-design checkout and is freely redistributable (SIL OFL 1.1)

## 2. Shared theme module

- [x] `src/extension/webviews/openDesignTheme.ts` — `OD_TOKENS_CSS` (light + `body.vscode-dark` token sets, shared primitive classes), `odFontFaceCss()` helper
- [x] Vendored `assets/fonts/AlbertSans-VariableFont_wght.ttf` (regular weight only, italic not needed)
- [x] Documented which specific values were directly sourced vs. reasonably inferred (dark-mode text tiers, dark-mode brand-ink, dark-mode shadow opacities) — see `design.md`

## 3. Applied to all three webviews

- [x] `artifactEditorProvider.ts`/`src/webview/main.ts`: flat toolbar (matching FileViewer's own "no border, no blur" treatment, with a hairline exception since this webview lacks OD's own surrounding page chrome), mode tabs restyled as `.od-tab`, comment pins reproduced as open-design's actual 42px teardrop shape in its dedicated terracotta accent, edit/comment panel restyled as a frosted-glass floating surface matching `ManualEditPanel`'s floating variant
- [x] `galleryGridProvider.ts`/`src/webview/gallery/main.ts`: frameless cards (only the thumbnail "plate" carries border/radius), category chips restyled as `.od-badge`/`.od-badge-active` (brand-green ink-on-tint for the active state, matching open-design's documented chip pattern), thumbnail aspect-ratio corrected to 16:9 (from an approximate 8:5) to match `CommunityTemplatePreview`'s own ratio, hover changed to `translateY(-1px)` only (no added shadow)
- [x] `examplePreviewProvider.ts`/`src/webview/preview/main.ts`: same flat-toolbar treatment, primary Remix button restyled as `.od-btn-primary`

## 4. Verify

- [x] `npm run typecheck` (both projects), `npm run lint`, `npm run test:unit` (41 passing, unchanged — this is a styling-only change, no new pure-logic modules), `npm run compile` — all three webview bundles build
- [x] Confirmed the new tokens/font-face/pin-color are present in the compiled `dist/extension.js` via `grep`
- [ ] **Not performed**: visual verification in a live Extension Development Host — same documented gap as every prior change in this repo, but especially relevant here since this change is *entirely* visual and has no automated way to confirm it actually looks right.
