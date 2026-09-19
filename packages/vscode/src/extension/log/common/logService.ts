// Adapted from feima-copilot-llms-extension's logging infrastructure
// (src/extension/platform/log/common/logService.ts) — same target-based
// design (log targets + a common logger implementation, decoupled from any
// specific VS Code API), trimmed to what this extension actually uses.

/** Log levels matching VS Code's LogLevel enum. */
export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

/** A destination a log message can be written to (an output channel, the debug console, telemetry, ...). */
export interface ILogTarget {
  logIt(level: LogLevel, message: string): void;
  show?(preserveFocus?: boolean): void;
}

export interface ILogger {
  trace(message: string): void;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(error: unknown, message?: string): void;
  show(preserveFocus?: boolean): void;

  /** A sub-logger whose messages are prefixed with `[topic]`. */
  createSubLogger(topic: string | readonly string[]): ILogService;

  /** A logger that also writes to an additional target. */
  withExtraTarget(target: ILogTarget): ILogService;
}

export interface ILogService extends ILogger {}

export class LogServiceImpl implements ILogService {
  private readonly logger: LoggerImpl;

  constructor(logTargets: ILogTarget[]) {
    this.logger = new LoggerImpl(logTargets);
  }

  trace(message: string): void {
    this.logger.trace(message);
  }

  debug(message: string): void {
    this.logger.debug(message);
  }

  info(message: string): void {
    this.logger.info(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  error(error: unknown, message?: string): void {
    this.logger.error(error, message);
  }

  show(preserveFocus?: boolean): void {
    this.logger.show(preserveFocus);
  }

  createSubLogger(topic: string | readonly string[]): ILogService {
    return this.logger.createSubLogger(topic);
  }

  withExtraTarget(target: ILogTarget): ILogService {
    return this.logger.withExtraTarget(target);
  }
}

class LoggerImpl implements ILogService {
  constructor(private readonly logTargets: ILogTarget[]) {}

  private logIt(level: LogLevel, message: string): void {
    this.logTargets.forEach((t) => t.logIt(level, message));
  }

  trace(message: string): void {
    this.logIt(LogLevel.Trace, message);
  }

  debug(message: string): void {
    this.logIt(LogLevel.Debug, message);
  }

  info(message: string): void {
    this.logIt(LogLevel.Info, message);
  }

  warn(message: string): void {
    this.logIt(LogLevel.Warning, message);
  }

  error(error: unknown, message?: string): void {
    const errorMessage = collectErrorMessages(error) + (message ? `: ${message}` : '');
    this.logIt(LogLevel.Error, errorMessage);
  }

  show(preserveFocus?: boolean): void {
    this.logTargets.forEach((t) => t.show?.(preserveFocus));
  }

  createSubLogger(topic: string | readonly string[]): ILogService {
    return new SubLogger(this, topic);
  }

  withExtraTarget(target: ILogTarget): ILogService {
    return new LoggerWithExtraTargets(this, [target]);
  }
}

/** Prefixes every message with `[topic]`, chainable to build up e.g. `[Tools][remix]`. */
class SubLogger implements ILogService {
  private readonly prefix: string;

  constructor(
    private readonly parent: ILogService,
    topic: string | readonly string[],
    existingPrefix?: string,
  ) {
    const topics = Array.isArray(topic) ? topic : [topic];
    const newPrefix = topics.map((t) => `[${t}]`).join('');
    this.prefix = existingPrefix ? existingPrefix + newPrefix : newPrefix;
  }

  private prefixMessage(message: string): string {
    return `${this.prefix} ${message}`;
  }

  trace(message: string): void {
    this.parent.trace(this.prefixMessage(message));
  }

  debug(message: string): void {
    this.parent.debug(this.prefixMessage(message));
  }

  info(message: string): void {
    this.parent.info(this.prefixMessage(message));
  }

  warn(message: string): void {
    this.parent.warn(this.prefixMessage(message));
  }

  error(error: unknown, message?: string): void {
    this.parent.error(error, message ? this.prefixMessage(message) : this.prefix);
  }

  show(preserveFocus?: boolean): void {
    this.parent.show(preserveFocus);
  }

  createSubLogger(topic: string | readonly string[]): ILogService {
    return new SubLogger(this.parent, topic, this.prefix);
  }

  withExtraTarget(target: ILogTarget): ILogService {
    return new LoggerWithExtraTargets(this, [target], this.prefix);
  }
}

class LoggerWithExtraTargets implements ILogService {
  constructor(
    private readonly parent: ILogService,
    private readonly extraTargets: readonly ILogTarget[],
    private readonly prefix: string = '',
  ) {}

  private notifyExtraTargets(level: LogLevel, message: string): void {
    const prefixedMessage = this.prefix ? `${this.prefix} ${message}` : message;
    for (const target of this.extraTargets) {
      try {
        target.logIt(level, prefixedMessage);
      } catch {
        // Extra targets must never affect primary logging.
      }
    }
  }

  trace(message: string): void {
    this.notifyExtraTargets(LogLevel.Trace, message);
    this.parent.trace(message);
  }

  debug(message: string): void {
    this.notifyExtraTargets(LogLevel.Debug, message);
    this.parent.debug(message);
  }

  info(message: string): void {
    this.notifyExtraTargets(LogLevel.Info, message);
    this.parent.info(message);
  }

  warn(message: string): void {
    this.notifyExtraTargets(LogLevel.Warning, message);
    this.parent.warn(message);
  }

  error(error: unknown, message?: string): void {
    this.notifyExtraTargets(LogLevel.Error, collectErrorMessages(error) + (message ? `: ${message}` : ''));
    this.parent.error(error, message);
  }

  show(preserveFocus?: boolean): void {
    this.parent.show(preserveFocus);
    for (const target of this.extraTargets) {
      try {
        target.show?.(preserveFocus);
      } catch {
        // Extra targets must never affect primary logging.
      }
    }
  }

  createSubLogger(topic: string | readonly string[]): ILogService {
    const topics = Array.isArray(topic) ? topic : [topic];
    const newPrefix = this.prefix + topics.map((t) => `[${t}]`).join('');
    return new LoggerWithExtraTargets(this.parent.createSubLogger(topic), this.extraTargets, newPrefix);
  }

  withExtraTarget(target: ILogTarget): ILogService {
    return new LoggerWithExtraTargets(this.parent, [...this.extraTargets, target], this.prefix);
  }
}

/** Recursively unrolls an Error's `.cause` chain and any `.errors` (AggregateError) into one multi-line message. */
function collectErrorMessages(e: unknown): string {
  const seen = new Set<unknown>();

  function collect(value: unknown, indent: string): string {
    if (!value || !['object', 'string'].includes(typeof value) || seen.has(value)) return '';
    seen.add(value);

    const v = value as { stack?: unknown; message?: unknown; code?: unknown; cause?: unknown; errors?: unknown; toString?: () => string };
    const raw = typeof value === 'string' ? value : v.stack ?? v.message ?? v.code ?? v.toString?.() ?? '';
    const messageStr = typeof raw === 'string' ? raw : String(raw ?? '');

    return [
      messageStr
        ? `${messageStr
            .split('\n')
            .map((line) => `${indent}${line}`)
            .join('\n')}\n`
        : '',
      collect(v.cause, indent + '  '),
      ...(Array.isArray(v.errors) ? v.errors.map((inner) => collect(inner, indent + '  ')) : []),
    ].join('');
  }

  return collect(e, '').trim();
}
