# Tasks: status-bar-error-handling

## 1. Investigate

- [x] User report: active-design-system status bar item missing
- [x] Confirmed `activeDesignSystemStatusBarItem.ts` untouched this session; confirmed `extension.ts`'s registration order is unaffected by recent edits (called 3rd, before anything touched this session)
- [x] Found the one real gap: this file was deliberately excluded from the prior round's instrumentation, and its `refresh()` had no error handling — a thrown `contentIndex.getDesignSystem()` would silently drop before `item.show()`, leaving the item created-but-invisible with no signal anywhere

## 2. Fix

- [x] `registerActiveDesignSystemStatusBarItem` takes `log: ILogService`; `refresh()` wrapped in try/catch logging the real error on failure
- [x] `extension.ts` threads `log` into the call

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed the new error-log string present in `dist/extension.js`
- [ ] **Root cause not confirmed** — this is a defensive fix (adds visibility for next time), not a proven fix for what the user saw. Asked them to reload and check the Output panel if the item is still missing.
