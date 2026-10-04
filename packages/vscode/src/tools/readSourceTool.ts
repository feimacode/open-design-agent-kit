import * as vscode from 'vscode';
import { readSourceTool } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory } from '../workspace/artifactWriter';

interface ReadSourceInput {
  path: string;
}

// Thin adapter over core's read_open_design_source (openspec add-deck-from-source).
export class ReadSourceTool implements vscode.LanguageModelTool<ReadSourceInput> {
  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ReadSourceInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Reading ${options.input.path} as source material` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ReadSourceInput>): Promise<vscode.LanguageModelToolResult> {
    // Reads workspaceFolders directly: core returns a clear "open a folder" message instead of throwing.
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const text = await readSourceTool({ workspaceRoot, outputDir: getOutputDirectory() }, options.input);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
}
