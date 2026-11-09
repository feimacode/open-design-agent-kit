import * as vscode from 'vscode';
import { checkArtifact, checkCollection, formatCheckResult, formatCollectionCheckResult, type CheckViewport, type ContentIndex, type ReviewView } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface CheckArtifactInput {
  entryPath?: string;
  collectionId?: string;
  viewports?: CheckViewport[];
  slides?: number[];
  maxImages?: number;
  at?: number[];
  views?: ReviewView[] | false;
  states?: boolean;
  editId?: string;
}

export class CheckArtifactTool implements vscode.LanguageModelTool<CheckArtifactInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CheckArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: options.input.collectionId ? `Checking the screens and links of ${options.input.collectionId}` : `Checking how ${options.input.entryPath} renders` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CheckArtifactInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const lookupAspectHint = async (id: string) => (await this.contentIndex.getSkill(id))?.aspectHint;
    if (options.input.collectionId) {
      const rest = { ...options.input };
      delete rest.entryPath;
      const collection = await checkCollection({ ...rest, collectionId: options.input.collectionId, workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory(), browserPath, lookupAspectHint });
      if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Check cancelled.')]);
      const shots = collection.ok ? collection.images.map((i) => vscode.LanguageModelDataPart.image(i.data, i.mime)) : [];
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatCollectionCheckResult(collection)), ...shots]);
    }
    if (!options.input.entryPath) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Pass entryPath, or collectionId to check every screen of a collection and the links between them.')]);
    const result = await checkArtifact({
      ...options.input,
      entryPath: options.input.entryPath,
      workspaceRoot: getWorkspaceRoot(),
      outputDir: getOutputDirectory(),
      browserPath,
      lookupAspectHint,
    });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Check cancelled.')]);
    const images = result.ok ? result.images.map((i) => vscode.LanguageModelDataPart.image(i.data, i.mime)) : [];
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatCheckResult(result)), ...images]);
  }
}
