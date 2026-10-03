import * as vscode from 'vscode';
import { publishArtifact, type PublishedInput } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';

interface PublishArtifactInput {
  entryPath: string;
  provider?: string;
  badge?: boolean;
  published?: PublishedInput;
}

// Builds the local `site` bundle and composes publish instructions, or records
// a finished deploy. Never runs a deploy itself: like ShareToCommunityTool,
// the model does the outward-facing step with its own terminal tool, under
// the user's own CLI login, after an explicit yes.
export class PublishArtifactTool implements vscode.LanguageModelTool<PublishArtifactInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PublishArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const { entryPath, published, provider } = options.input;
    if (published) return { invocationMessage: `Recording the published link for ${entryPath}` };
    return { invocationMessage: `Preparing ${entryPath} for publishing${provider ? ` (${provider})` : ''}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PublishArtifactInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const badgeSetting = vscode.workspace.getConfiguration('openDesign').get<boolean>('share.badge', true);
    const result = await publishArtifact({ ...options.input, workspaceRoot: getWorkspaceRoot(), badgeSetting });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result.text)]);
  }
}
