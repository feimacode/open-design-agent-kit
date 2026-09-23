import * as vscode from 'vscode';
import { getArtifact } from '../workspace/artifactWriter';
import { composeShareToCommunityInstructions } from '@feimacode/open-design-agent-kit-core';

interface ShareToCommunityInput {
  entryPath: string;
}

// Composes instructions only — never writes files, never runs a command
// itself. Same principle as PortToAppCodeTool: the model does the actual
// scaffolding (with its own file-editing tools) and, only once the user has
// explicitly confirmed, the actual publish (with its own terminal tool).
export class ShareToCommunityTool implements vscode.LanguageModelTool<ShareToCommunityInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ShareToCommunityInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Preparing to share ${options.input.entryPath} to the community` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ShareToCommunityInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { entryPath } = options.input;

    const artifact = await getArtifact(entryPath);
    if (!artifact) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`No artifact found at ${entryPath}. It may not have been written yet.`),
      ]);
    }

    const manifestTitle = typeof artifact.manifest?.title === 'string' ? artifact.manifest.title : undefined;

    const instructions = composeShareToCommunityInstructions({
      artifactEntryPath: entryPath,
      artifactContent: artifact.entryContent,
      manifestTitle,
    });

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(instructions)]);
  }
}
