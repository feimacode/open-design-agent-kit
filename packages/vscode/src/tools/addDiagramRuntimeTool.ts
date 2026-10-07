import * as vscode from 'vscode';
import { addDiagramRuntime, formatAddDiagramRuntimeResult } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';

interface AddDiagramRuntimeInput {
  entryPath: string;
}

export class AddDiagramRuntimeTool implements vscode.LanguageModelTool<AddDiagramRuntimeInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AddDiagramRuntimeInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Adding the diagram runtime to ${options.input.entryPath}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<AddDiagramRuntimeInput>): Promise<vscode.LanguageModelToolResult> {
    const result = await addDiagramRuntime({ ...options.input, workspaceRoot: getWorkspaceRoot() });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatAddDiagramRuntimeResult(result))]);
  }
}
