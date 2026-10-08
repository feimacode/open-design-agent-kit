import * as vscode from 'vscode';
import { checkArtifact, formatCheckResult, type CheckViewport, type ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface CheckArtifactInput {
  entryPath: string;
  viewports?: CheckViewport[];
  slides?: number[];
  maxImages?: number;
  at?: number[];
}

export class CheckArtifactTool implements vscode.LanguageModelTool<CheckArtifactInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CheckArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Checking how ${options.input.entryPath} renders` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CheckArtifactInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const result = await checkArtifact({
      ...options.input,
      workspaceRoot: getWorkspaceRoot(),
      outputDir: getOutputDirectory(),
      browserPath,
      lookupAspectHint: async (id) => (await this.contentIndex.getSkill(id))?.aspectHint,
    });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Check cancelled.')]);
    const images = result.ok ? result.images.map((i) => vscode.LanguageModelDataPart.image(i.data, i.mime)) : [];
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatCheckResult(result)), ...images]);
  }
}
