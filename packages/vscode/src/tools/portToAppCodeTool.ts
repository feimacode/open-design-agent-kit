import * as path from 'node:path';
import * as vscode from 'vscode';
import { getArtifact, getWorkspaceRoot } from '../workspace/artifactWriter';
import { composePortToAppInstructions, suggestTargetComponentPath } from '@feimacode/open-design-agent-kit-core';

interface PortToAppCodeInput {
  entryPath: string;
  targetComponentPath?: string;
  referenceComponentPath?: string;
}

// Composes instructions only — never writes code itself. Same principle as
// prepare_open_design_brief/create_open_design_design_system: the model
// authors the actual (in this case, real app) code with its own
// file-editing tools.
export class PortToAppCodeTool implements vscode.LanguageModelTool<PortToAppCodeInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PortToAppCodeInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Preparing to promote ${options.input.entryPath} into the app's code` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PortToAppCodeInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { entryPath, targetComponentPath: explicitTarget, referenceComponentPath } = options.input;

    const artifact = await getArtifact(entryPath);
    if (!artifact) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`No artifact found at ${entryPath}. It may not have been written yet.`),
      ]);
    }

    const artifactName = typeof artifact.manifest?.title === 'string' ? artifact.manifest.title : path.basename(entryPath, path.extname(entryPath));

    const targetComponentPath = explicitTarget ?? (await suggestTargetComponentPath(getWorkspaceRoot(), artifactName));

    const instructions = composePortToAppInstructions({
      artifactEntryPath: entryPath,
      artifactContent: artifact.entryContent,
      targetComponentPath,
      referenceComponentPath,
    });

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ instructions, suggestedTargetComponentPath: targetComponentPath }, null, 2)),
    ]);
  }
}
