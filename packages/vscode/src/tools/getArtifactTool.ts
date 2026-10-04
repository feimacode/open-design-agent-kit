import * as vscode from 'vscode';
import { getArtifact, getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';
import { findStaleSources, readArtifactComments, recordedSources } from '@feimacode/open-design-agent-kit-core';

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
    const recorded = recordedSources(result.manifest);
    const payload = {
      manifest: result.manifest,
      supportingFiles: result.supportingFiles,
      entryContent: result.entryContent,
      openComments,
      staleSources: recorded.length > 0 ? await findStaleSources(getWorkspaceRoot(), getOutputDirectory(), recorded) : undefined,
    };
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
