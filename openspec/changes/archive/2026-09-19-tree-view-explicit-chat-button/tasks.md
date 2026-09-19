# Tasks: tree-view-explicit-chat-button

## 1. Add the inline button

- [x] `package.json`: `view/item/context` gains `openDesign.chatWithExample` at `inline@1` (Preview and Remix shifted to `inline@2`/`inline@3`)
- [x] Confirmed no code change needed: `registerChatWithExampleCommand`'s `resolveSkillId()` already handles the context-menu tree-node argument shape; the command's icon and command-palette-hidden entry already existed

## 2. Document

- [x] README's tree view bullet updated to mention the explicit "Use in Chat" icon alongside click
- [x] `openspec/specs/open-design-tools/spec.md`: new scenario "An explicit 'Use in Chat' inline action does the same as a click"

## 3. Verify

- [x] `node -e` parse check on `package.json`'s `view/item/context` — correct order and `when` clauses
- [x] `npm run typecheck`, `npm run lint` — clean (no source changes, manifest-only)
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `openspec validate --specs --strict` — clean
- [ ] **Not performed**: manual verification in a live Extension Development Host — confirm the third inline icon appears on tree items and behaves the same as clicking. Same documented, recurring gap as every prior change in this repo.
