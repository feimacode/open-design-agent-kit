import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  composePullFigmaInstructions,
  fetchFigmaFrameImage,
  fetchFigmaNode,
  FigmaApiError,
  parseFigmaUrl,
  summarizeFigmaNode,
} from '@feimacode/open-design-agent-kit-core';
import { getFigmaToken } from '../workspace/figmaTokenStore';
import { getOutputDirectory, slugify } from '../workspace/artifactWriter';

interface PullFigmaFrameInput {
  figmaUrl: string;
  designSystemId?: string;
}

// Composes instructions only — never writes the artifact itself, same
// principle as every other content-producing tool in this extension. Mirrors
// the MCP server's pullFigmaFrame handler (packages/mcp-server/src/tools.ts)
// exactly, except the Figma token comes from vscode.SecretStorage instead of
// an environment variable.
export class PullFigmaFrameTool implements vscode.LanguageModelTool<PullFigmaFrameInput> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PullFigmaFrameInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Pulling the Figma frame "${options.input.figmaUrl}"` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<PullFigmaFrameInput>): Promise<vscode.LanguageModelToolResult> {
    const { figmaUrl, designSystemId } = options.input;

    const token = await getFigmaToken(this.context);
    if (!token) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          'No Figma access token is set. Run the "OpenDesign: Set Figma Access Token" command (paste a personal access token from Figma → Settings → Personal access tokens), then try again.',
        ),
      ]);
    }

    const ref = parseFigmaUrl(figmaUrl);
    if (!ref) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`"${figmaUrl}" does not look like a Figma file/design URL.`)]);
    }

    let node;
    try {
      node = await fetchFigmaNode(token, ref);
    } catch (err) {
      const message = err instanceof FigmaApiError ? err.message : `Failed to fetch the Figma frame: ${err instanceof Error ? err.message : String(err)}`;
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(message)]);
    }

    const frameSummary = summarizeFigmaNode(node);
    const imageUrl = await fetchFigmaFrameImage(token, ref.fileKey, ref.nodeId!);
    const slug = slugify(node.name);
    const suggestedEntryPath = path.posix.join(getOutputDirectory(), 'figma', `${slug}.html`);

    const instructions = composePullFigmaInstructions({
      frameSummary,
      frameName: node.name,
      imageUrl,
      designSystemId,
      suggestedEntryPath,
    });

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ instructions, suggestedEntryPath }, null, 2)),
    ]);
  }
}
