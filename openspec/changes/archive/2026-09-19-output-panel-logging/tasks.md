# Tasks: output-panel-logging

## 1. Port the reference architecture

- [x] `src/extension/log/common/logService.ts` — `LogLevel`, `ILogTarget`, `ILogService`, `LogServiceImpl`, `SubLogger` (bracketed `[topic]` prefixing, chainable), `LoggerWithExtraTargets`, recursive `collectErrorMessages` — adapted from feima's file, `error()`'s first param kept as `unknown` (broader than feima's `string | Error`) since our existing call sites already pass caught `unknown` values
- [x] `src/extension/log/vscode/logService.ts` — `VSCodeLogTarget` (wraps a `LogOutputChannel`'s native `trace/debug/info/warn/error`), `ConsoleLogTarget` (mirrors warnings/errors, and anything at/above a configurable level, to the debug console)

## 2. Rewire the entry point

- [x] `src/extension/log/logService.ts`: `createLogService()` now creates `vscode.window.createOutputChannel('OpenDesign Tools', { log: true })` (a `LogOutputChannel`) and wires `[VSCodeLogTarget, ConsoleLogTarget]`; re-exports `ILogService`/`ILogTarget`/`LogLevel` so existing imports (`'../log/logService'` in `artifactEditorProvider.ts`, `registerTools.ts`) needed no changes
- [x] Dropped `vscode.Disposable` from `ILogService` (no call site ever called `log.dispose()`; channel disposal already went through `context.subscriptions.push(channel)` directly, matching feima's simpler design)

## 3. Actually generate log output (the point of having a channel)

- [x] New `src/tools/loggingTool.ts`: `LoggingTool<T>` wraps any `vscode.LanguageModelTool`, logs `invoke <input JSON>` at debug level, `invoke ok` or `invoke threw` (full error via `collectErrorMessages`) at completion, using a sub-logger scoped to the tool's registered name (e.g. `[remix_open_design_example]`)
- [x] `registerTools.ts`: all 7 tools now registered wrapped in `LoggingTool`, one instrumentation point rather than editing each tool class

## 4. Verify

- [x] `npm run typecheck` — caught and fixed a real type error: `LoggingTool.invoke`'s return type didn't account for `vscode.LanguageModelTool.invoke`'s `ProviderResult<T>` (which allows `undefined`/`null`) — fixed by throwing if the inner tool returns nothing, keeping the wrapper's own return type a real `Promise<LanguageModelToolResult>`
- [x] `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed `"OpenDesign Tools"` channel name and the `LoggingTool`/`invoke ok`/`invoke threw` strings present in `dist/extension.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — open the "OpenDesign Tools" Output channel, run a tool call, confirm entries appear with timestamps and the Log Level dropdown works. Same documented, recurring gap as every prior change in this repo.
