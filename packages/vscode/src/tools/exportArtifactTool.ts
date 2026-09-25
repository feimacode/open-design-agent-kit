import * as vscode from 'vscode';
import { exportArtifact, formatExportResult, type ContentIndex, type ExportFormat } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';

interface ExportArtifactInput {
  entryPath: string;
  format?: ExportFormat;
  quality?: number;
  width?: number;
  height?: number;
  scale?: number;
  selector?: string;
  maxBytes?: number;
  deck?: boolean;
  slides?: number[];
}

export class ExportArtifactTool implements vscode.LanguageModelTool<ExportArtifactInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExportArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Exporting ${options.input.entryPath} to ${(options.input.format ?? 'png').toUpperCase()}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExportArtifactInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const result = await exportArtifact({
      ...options.input,
      workspaceRoot: getWorkspaceRoot(),
      browserPath,
      lookupAspectHint: async (id) => (await this.contentIndex.getSkill(id))?.aspectHint,
    });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Export cancelled.')]);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatExportResult(result))]);
  }
}
