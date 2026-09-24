import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';
import { performRemix } from '../workspace/remixOrchestrator';

interface RemixExampleInput {
  skillId: string;
}

export class RemixExampleTool implements vscode.LanguageModelTool<RemixExampleInput> {
  constructor(
    private readonly contentIndex: ContentIndex,
    private readonly assetsRoot: string,
    private readonly communityContentDir?: string,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RemixExampleInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Remixing Open Design example ${options.input.skillId}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemixExampleInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const outcome = await performRemix(this.contentIndex, this.assetsRoot, options.input.skillId, this.communityContentDir);
    if (!outcome.ok) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(outcome.error)]);
    }

    const { entryPath, instructions, manifest } = outcome.result;
    vscode.commands
      .executeCommand('openDesign.openArtifactPreview', vscode.Uri.file(path.join(getWorkspaceRoot(), entryPath)))
      .then(undefined, () => undefined);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ entryPath, instructions, manifest }, null, 2)),
    ]);
  }
}
