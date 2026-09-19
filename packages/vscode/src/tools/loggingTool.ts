import * as vscode from 'vscode';
import type { ILogService } from '../extension/log/logService';

/**
 * Wraps any languageModelTool so every invocation is written to the
 * "OpenDesign Tools" Output panel channel — a single instrumentation point
 * rather than adding logging calls inside each of the 7 tool classes.
 * Failures are logged (with the full error, including any `.cause` chain)
 * and then rethrown unchanged, so VS Code's own tool-error handling still
 * applies.
 */
export class LoggingTool<T> implements vscode.LanguageModelTool<T> {
  private readonly log: ILogService;

  constructor(
    name: string,
    private readonly inner: vscode.LanguageModelTool<T>,
    parentLog: ILogService,
  ) {
    this.log = parentLog.createSubLogger(name);
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<T>,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    return this.inner.prepareInvocation?.(options, token);
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<T>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    this.log.debug(`invoke ${JSON.stringify(options.input)}`);
    try {
      const result = await this.inner.invoke(options, token);
      if (!result) throw new Error('Tool returned no result');
      this.log.debug('invoke ok');
      return result;
    } catch (err) {
      this.log.error(err, 'invoke threw');
      throw err;
    }
  }
}
