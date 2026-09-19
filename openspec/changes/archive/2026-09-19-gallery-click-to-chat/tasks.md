# Tasks: gallery-click-to-chat

## 1. Chat-prefill command

- [x] `src/extension/commands/chatWithExample.ts` — `chatWithExample(contentIndex, skillId)` builds a query naming the skill id + example prompt and calls `workbench.action.chat.open({ query, isPartialQuery: true })`; `registerChatWithExampleCommand()` registers `openDesign.chatWithExample`, resolving either a plain string or a `{kind:'example', entry:{id}}` tree-node arg
- [x] Wired into `src/extension/extension.ts`'s `activate()`

## 2. Tree view

- [x] `galleryTreeProvider.ts`: item's default `command` changed to `openDesign.chatWithExample`
- [x] `package.json`: `view/item/context` now has two inline entries (Preview `inline@1`, Remix `inline@2`) instead of one; `openDesign.previewExample` given an icon (`$(eye)`); new `openDesign.chatWithExample` command entry (icon `$(comment-discussion)`), hidden from the Command Palette (`when: "false"`)

## 3. Grid view

- [x] `src/webview/gallery/main.ts`: card markup restructured — `.og-actions` row holds a Remix button and a Preview text-link (both `stopPropagation()`-guarded); the card's own click now posts `open-chat`
- [x] `galleryGridProvider.ts`: imports `chatWithExample`, handles `case 'open-chat'`
- [x] CSS: `.og-actions`, `.og-preview-link` added; `.og-remix-btn` no longer `align-self: flex-start` (now a flex-row sibling)

## 4. QuickPick

- [x] Left unchanged, deliberately — documented in `design.md` as an open question to surface to the user, not silently resolved

## 5. Verify

- [x] `npm run typecheck` (both projects) — clean
- [x] `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — all four bundles produced (`extension.js`, `webview/{main,gallery,preview}.js`)
- [x] Sanity-checked `package.json` parses, `openDesign.chatWithExample` command/icon/menu entries present and correctly hidden from the palette, `view/item/context` has both inline entries
- [x] `grep`-verified the compiled bundles: `openDesign.chatWithExample` present in `dist/extension.js`, `open-chat`/`og-preview-link` present in `dist/webview/gallery.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host. Same documented, recurring gap as every prior change in this repo (no `@vscode/test-electron` integration suite yet).
