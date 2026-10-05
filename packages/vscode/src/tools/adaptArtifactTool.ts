import * as vscode from 'vscode';
import { adaptArtifact, formatAdaptResult } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface AdaptArtifactInput {
  entryPath: string;
  formats: string[];
  notes?: string;
}

// Instructions only, like PortToAppCodeTool: the model writes each adaptation
// itself. The one write is the master's collection membership.
export class AdaptArtifactTool implements vscode.LanguageModelTool<AdaptArtifactInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AdaptArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Planning ${options.input.formats?.join(', ')} versions of ${options.input.entryPath}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<AdaptArtifactInput>): Promise<vscode.LanguageModelToolResult> {
    const result = await adaptArtifact({ ...options.input, workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory() });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatAdaptResult(result))]);
  }
}
