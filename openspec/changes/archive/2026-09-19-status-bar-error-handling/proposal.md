# Status bar item: add error handling and logging (investigating "missing" report)

## Why

The user reported the active-design-system status bar item is missing. `activeDesignSystemStatusBarItem.ts` was untouched by any recent change and its registration wiring in `extension.ts` (called early, 3rd line of `activate()`) is intact — no evidence of a code regression found via static inspection.

However, this file was the one entry point deliberately left un-instrumented in the prior `instrument-key-entry-points` round (judged as "passive rendering," not a "key entry"). Its `refresh()` function had no `try`/`catch` at all: `void refresh()` silently drops any rejection (e.g. from `contentIndex.getDesignSystem()` throwing on a stale/corrupt active-design-system setting or a content-load failure), and since `item.show()` sits after the point that could throw, a thrown error means the item is created but never shown — invisible, with zero signal anywhere about why.

## What Changes

- `registerActiveDesignSystemStatusBarItem` now takes `log: ILogService` and wraps `refresh()`'s body in `try`/`catch`, logging the real error (via the shared `collectErrorMessages`) on failure instead of silently dropping it.
- `extension.ts` threads `log` into this call.

## Impact

- Modified: `src/extension/statusBar/activeDesignSystemStatusBarItem.ts`, `src/extension/extension.ts`.
- This makes the failure (if any) diagnosable via the Output panel on the next occurrence — it does not by itself confirm or rule out a specific root cause, since none was reproduced locally. Asked the user to reload and check the "OpenDesign Tools" Output channel if the item is still missing after this fix.
