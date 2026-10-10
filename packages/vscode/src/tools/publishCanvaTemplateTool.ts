import * as vscode from 'vscode';
import { getArtifact } from '../workspace/artifactWriter';
import { composePublishCanvaTemplateInstructions } from '@feimacode/open-design-agent-kit-core';

interface PublishCanvaTemplateInput {
  entryPath: string;
}

// Composes instructions only — never writes files, never talks to Canva.
// The model exports, then imports through the user's Canva MCP connector when
// one is connected (openspec connect-canva-publish), or hands the file over
// for Canva's manual import.
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
    const metadata = artifact.manifest?.metadata as Record<string, unknown> | undefined;
    const manifestFormat = typeof metadata?.format === 'string' ? metadata.format : undefined;

    const instructions = composePublishCanvaTemplateInstructions({
      artifactEntryPath: entryPath,
      artifactContent: artifact.entryContent,
      manifestTitle,
      manifestKind,
      manifestFormat,
    });

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(instructions)]);
  }
}
