import * as vscode from 'vscode';
import { preparePullFigmaFrame } from '@feimacode/open-design-agent-kit-core';
import { getFigmaToken } from '../workspace/figmaTokenStore';
import { getOutputDirectory } from '../workspace/artifactWriter';

interface PullFigmaFrameInput {
  figmaUrl: string;
  designSystemId?: string;
}

// Composes instructions only — never writes the artifact itself. Figma's MCP
// server comes first; the token (from vscode.SecretStorage) is optional
// (openspec connect-figma). Shared logic: core's preparePullFigmaFrame.
export class PullFigmaFrameTool implements vscode.LanguageModelTool<PullFigmaFrameInput> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PullFigmaFrameInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Pulling the Figma frame "${options.input.figmaUrl}"` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<PullFigmaFrameInput>): Promise<vscode.LanguageModelToolResult> {
    const text = await preparePullFigmaFrame({
      figmaUrl: options.input.figmaUrl,
      designSystemId: options.input.designSystemId,
      token: await getFigmaToken(this.context),
      outputDir: getOutputDirectory(),
      tokenSetupHint: 'run the "Open Design: Set Figma Access Token" command and paste a personal access token from Figma → Settings → Personal access tokens',
    });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
}
