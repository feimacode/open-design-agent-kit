# Real Output-panel logging, ported from feima-copilot-llms-extension

## Why

The user asked for logging written out to VS Code's Output panel, pointing at `feima-copilot-llms-extension`'s logging implementation (`src/extension/platform/log/{common,vscode}/logService.ts`) as the reference. This extension already had a minimal `ILogService` (a plain `vscode.OutputChannel` wrapper with `info`/`warn`/`error`/`createSubLogger`), but it lacked what the reference has: a real `LogOutputChannel` (native timestamps + a Log Level filter dropdown in the Output panel, matching first-party extensions), `trace`/`debug` levels, recursive error-cause unrolling, and — most importantly — was barely called anywhere (just activation + "tool registered" lines), so the Output panel had almost nothing useful in it during the last several rounds of live debugging.

## What Changes

- Ported feima's target-based architecture: `src/extension/log/common/logService.ts` (`LogLevel` enum, `ILogTarget`, `ILogService`, `LogServiceImpl`/`SubLogger`/`LoggerWithExtraTargets`, recursive `collectErrorMessages` for `Error.cause`/`AggregateError.errors`) + `src/extension/log/vscode/logService.ts` (`VSCodeLogTarget` wrapping a `LogOutputChannel`, `ConsoleLogTarget` mirroring warnings/errors to the debug console).
- `createLogService()` (`src/extension/log/logService.ts`) now creates the output channel via `vscode.window.createOutputChannel('OpenDesign Tools', { log: true })` — a `LogOutputChannel`, not a plain one — and wires both targets.
- New `src/tools/loggingTool.ts`: a `LoggingTool<T>` wrapper around any `vscode.LanguageModelTool`, logging every invocation's input (debug level) and outcome (`invoke ok` / `invoke threw`, with the full error) to a sub-logger scoped to that tool's name. `registerTools.ts` now wraps all 7 tools with it at registration time — one instrumentation point instead of adding logging calls inside each tool class individually.

## Impact

- New files: `src/extension/log/common/logService.ts`, `src/extension/log/vscode/logService.ts`, `src/tools/loggingTool.ts`.
- Modified: `src/extension/log/logService.ts` (rewritten, same `createLogService`/`ILogService` export surface — existing consumers, `artifactEditorProvider.ts` and `registerTools.ts`, needed no changes), `src/tools/registerTools.ts`.
- No spec delta — logging is an implementation/observability detail, not a user-facing capability with SHALL-level behavior.
