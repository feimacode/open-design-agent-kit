import * as vscode from 'vscode';
import { getArtifact } from '../workspace/artifactWriter';
import { composePublishCanvaTemplateInstructions } from '@feimacode/open-design-agent-kit-core';

interface PublishCanvaTemplateInput {
  entryPath: string;
}

// Composes instructions only — never writes files, never talks to Canva.
// Same principle as ShareToCommunityTool/PortToAppCodeTool: the model calls
// export_open_design_artifact itself, then hands the result to the user for
// Canva's own (manual, account-gated) import and publish steps.
export class PublishCanvaTemplateTool implements vscode.LanguageModelTool<PublishCanvaTemplateInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PublishCanvaTemplateInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Preparing ${options.input.entryPath} for Canva` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PublishCanvaTemplateInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { entryPath } = options.input;

    const artifact = await getArtifact(entryPath);
    if (!artifact) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`No artifact found at ${entryPath}. It may not have been written yet.`),
      ]);
    }

    const manifestTitle = typeof artifact.manifest?.title === 'string' ? artifact.manifest.title : undefined;
    const manifestKind = typeof artifact.manifest?.kind === 'string' ? artifact.manifest.kind : undefined;

    const instructions = composePublishCanvaTemplateInstructions({
      artifactEntryPath: entryPath,
      artifactContent: artifact.entryContent,
      manifestTitle,
      manifestKind,
    });

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(instructions)]);
  }
}
