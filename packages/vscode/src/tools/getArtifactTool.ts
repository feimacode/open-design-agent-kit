import * as vscode from 'vscode';
import { getArtifact, getWorkspaceRoot } from '../workspace/artifactWriter';
import { readArtifactComments } from '@feimacode/open-design-agent-kit-core';

interface GetArtifactInput {
  entryPath: string;
}

export class GetArtifactTool implements vscode.LanguageModelTool<GetArtifactInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetArtifactInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { entryPath } = options.input;
    const result = await getArtifact(entryPath);
    if (!result) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`No artifact found at ${entryPath}. It may not have been written yet.`),
      ]);
    }
    const comments = await readArtifactComments(getWorkspaceRoot(), entryPath);
    const openComments = comments.filter((c) => c.status === 'open');
    const payload = {
      manifest: result.manifest,
      supportingFiles: result.supportingFiles,
      entryContent: result.entryContent,
      openComments,
    };
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
