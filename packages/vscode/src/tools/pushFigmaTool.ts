import * as vscode from 'vscode';
import { prepareFigmaPush } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';

interface PushFigmaInput {
  entryPath: string;
  refresh?: boolean;
}

// Captures the artifact and writes use_figma parts under exports/figma/, then
// returns instructions; Copilot runs them through the user's Figma MCP
// connection after they choose a target file (openspec connect-figma). Never
// contacts Figma itself.
export class PushFigmaTool implements vscode.LanguageModelTool<PushFigmaInput> {
  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<PushFigmaInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Preparing ${options.input.entryPath} for Figma` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<PushFigmaInput>): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const result = await prepareFigmaPush({ ...options.input, workspaceRoot: getWorkspaceRoot(), browserPath });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result.text)]);
  }
}
