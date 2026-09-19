# Visual refactor: follow open-design's own UI design language

## Why

The three webviews (Artifact Preview editor, Gallery grid, example preview panel) had been styled entirely with `--vscode-*` CSS custom properties — theme-adaptive but generic, indistinguishable from any other extension's webview. The user asked to refactor them to follow open-design's own actual UX design/styling instead.

## What Changes

- New shared module `src/extension/webviews/openDesignTheme.ts`: color/radius/shadow/typography design tokens hand-transcribed (not guessed) from open-design's real stylesheets (`apps/web/src/styles/tokens.css`, `base.css`, `primitives.css`, `viewer/core.css`, `viewer/memory.css`, `home/plugin-marketplace-demo.css`), switched between open-design's own light/dark token sets via the `vscode-dark`/`vscode-light` class VS Code adds to every webview `<body>` automatically — not tied to the user's ambient VS Code theme colors.
- Vendored `assets/fonts/AlbertSans-VariableFont_wght.ttf` (open-design's own brand typeface, SIL OFL-licensed, copied byte-for-byte from its own bundled copy) and a `@font-face` helper in the shared theme module.
- All three webviews (`artifactEditorProvider.ts`/`src/webview/main.ts`, `galleryGridProvider.ts`/`src/webview/gallery/main.ts`, `examplePreviewProvider.ts`/`src/webview/preview/main.ts`) refactored to use the shared tokens and a small set of shared primitive classes (`.od-btn`, `.od-btn-primary`, `.od-tab`, `.od-badge`, `.od-badge-active`, `.od-panel`, `.od-input`/`.od-textarea`).
- Component-specific shapes reproduced from the real product: comment pins render as open-design's actual 42px teardrop (`border-radius: 50% 50% 50% 10px`) in its dedicated terracotta accent (`#d96a46`), not a generic dot; the Gallery grid's cards are frameless (only the thumbnail "plate" carries a border/radius, matching `CommunityTemplatePreview`'s explicit "a shadow with no fill under it reads as a shadow around thin air" reasoning), hover is `translateY(-1px)` only; the edit/comment side panel is a frosted-glass floating surface (`backdrop-filter: blur(20px) saturate(1.8)`) matching `ManualEditPanel`'s floating variant.

## Capabilities

### Modified: `open-design-tools` webview visual design

The three webviews now follow open-design's own visual identity (colors, radii, shadows, typography, component shapes) rather than generic VS Code theming, while remaining dark/light-aware via open-design's own separate token sets.

## Note on spec delta

No `specs/open-design-tools/spec.md` delta is included in this change — every existing requirement's SHALL-level behavior is unchanged (same tools, same messages, same commands, same file-write contract). This is a non-functional (visual-only) change, consistent with how requirements have been scoped throughout this project's spec history: behavior, not pixel-level styling.

## Impact

- New dependency-free asset: `assets/fonts/AlbertSans-VariableFont_wght.ttf` (~128KB).
- No functional/behavioral change — this is styling only. All existing message protocols, commands, and tool contracts are unchanged.
- The Gallery tree view (native `TreeView`) and status bar item are **not** restylable — VS Code owns their rendering entirely. Only the three webviews are in scope.
- Icon system (open-design uses inlined Remix Icon SVGs) was explicitly **not** adopted in this pass — text labels remain. A real, but lower-priority signature compared to color/shape/type; documented as a deliberate cut, not an oversight.
