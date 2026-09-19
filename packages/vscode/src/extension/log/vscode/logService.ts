// Adapted from feima-copilot-llms-extension's
// src/extension/platform/log/vscode/logService.ts.

import * as vscode from 'vscode';
import { ILogTarget, LogLevel } from '../common/logService';

/** Writes to a real VS Code Output panel channel — a `LogOutputChannel` gets native timestamps and a level filter for free. */
export class VSCodeLogTarget implements ILogTarget {
  constructor(private readonly channel: vscode.LogOutputChannel) {}

  logIt(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.Trace:
        this.channel.trace(message);
        break;
      case LogLevel.Debug:
        this.channel.debug(message);
        break;
      case LogLevel.Info:
        this.channel.info(message);
        break;
      case LogLevel.Warning:
        this.channel.warn(message);
        break;
      case LogLevel.Error:
        this.channel.error(message);
        break;
    }
  }

  show(preserveFocus?: boolean): void {
    this.channel.show(preserveFocus);
  }
}

/** Mirrors warnings/errors (only, by default) to the extension host's own debug console — useful while running in the Extension Development Host. */
export class ConsoleLogTarget implements ILogTarget {
  constructor(
    private readonly prefix?: string,
    private readonly minLogLevel: LogLevel = LogLevel.Warning,
  ) {}

  logIt(level: LogLevel, message: string): void {
    const prefixedMessage = this.prefix ? `${this.prefix}${message}` : message;
    if (level === LogLevel.Error) {
      console.error(prefixedMessage);
    } else if (level === LogLevel.Warning) {
      console.warn(prefixedMessage);
    } else if (level >= this.minLogLevel) {
      console.log(prefixedMessage);
    }
  }
}
