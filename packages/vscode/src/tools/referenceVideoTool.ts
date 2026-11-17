import * as vscode from 'vscode';
import { formatReferenceFacts, inspectReferenceVideo } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface ReferenceVideoInput {
  video: string;
}

// Measures a reference video the user attached (core media/referenceVideo.ts,
// openspec add-reference-video-replication): cuts, frames, a contact sheet and
// the soundtrack, so a film is built from measured timing. Files only.
export class ReferenceVideoTool implements vscode.LanguageModelTool<ReferenceVideoInput> {
  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ReferenceVideoInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Reading the reference video ${options.input.video}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ReferenceVideoInput>): Promise<vscode.LanguageModelToolResult> {
    const ffmpegPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.ffmpegPath', '') || undefined;
    const result = await inspectReferenceVideo({ workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory(), video: options.input.video, ffmpegPath });
    if (!result.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result.code === 'link' ? result.error : `Couldn't read the reference video (${result.code}): ${result.error}`)]);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`${formatReferenceFacts(result.facts)}\nreferenceId: ${result.facts.referenceId}. Pass it to #od-prepare-brief and, after building, to #od-check.`),
      vscode.LanguageModelDataPart.image(result.contact, 'image/jpeg'),
    ]);
  }
}
