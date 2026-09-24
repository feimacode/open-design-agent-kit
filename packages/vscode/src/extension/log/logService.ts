import * as vscode from 'vscode';
import { ILogService, LogLevel, LogServiceImpl } from './common/logService';
import { ConsoleLogTarget, VSCodeLogTarget } from './vscode/logService';

export type { ILogService, ILogTarget } from './common/logService';
export { LogLevel } from './common/logService';

/**
 * Writes to a real "Open Design Tools" channel in the Output panel — a
 * `LogOutputChannel` (not a plain `OutputChannel`) so it gets VS Code's
 * native timestamps and its own Log Level filter in the Output panel's
 * dropdown, same as first-party extensions. Warnings/errors are also
 * mirrored to the extension host's debug console for visibility while
 * running in the Extension Development Host.
 */
export function createLogService(context: vscode.ExtensionContext): ILogService {
  const channel = vscode.window.createOutputChannel('Open Design Tools', { log: true });
  context.subscriptions.push(channel);
  return new LogServiceImpl([new VSCodeLogTarget(channel), new ConsoleLogTarget('[Open Design] ', LogLevel.Error)]);
}
