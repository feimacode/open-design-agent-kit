import * as vscode from 'vscode';
import { compareBeforeAfter, formatBeforeAfterResult } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface BeforeAfterInput {
  entryPath?: string;
  collectionId?: string;
  summary?: unknown;
}

// Writes a redesign's before/after page beside it (core beforeAfter.ts): the
// base screens beside fresh captures, the audit's problems re-checked on the
// design, the copy edits and cited summary lines.
export class BeforeAfterTool implements vscode.LanguageModelTool<BeforeAfterInput> {
  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<BeforeAfterInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Comparing ${options.input.collectionId ?? options.input.entryPath ?? 'the redesign'} before and after` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<BeforeAfterInput>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const { entryPath, collectionId, summary } = options.input;
    const result = await compareBeforeAfter({ workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory(), entryPath, collectionId, summary, browserPath });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Comparison cancelled.')]);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatBeforeAfterResult(result))]);
  }
}
