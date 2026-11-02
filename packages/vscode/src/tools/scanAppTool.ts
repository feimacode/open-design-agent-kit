import * as vscode from 'vscode';
import { formatAppScanResult, scanApp, type AppComponentsFile, type ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface ScanAppInput {
  root?: string;
  name?: string;
}

/** The app's tokens, components and screens, for designs that reuse them (openspec add-design-from-app). Read-only. */
export class ScanAppTool implements vscode.LanguageModelTool<ScanAppInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ScanAppInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Reading the app's tokens and components${options.input.root ? ` in ${options.input.root}` : ''}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ScanAppInput>): Promise<vscode.LanguageModelToolResult> {
    const profile = await scanApp(getWorkspaceRoot(), options.input.root ?? '.');
    let saved: { id: string; file: AppComponentsFile } | undefined;
    for (const summary of await this.contentIndex.listDesignSystems()) {
      if (!summary.id.startsWith('user:')) continue;
      const file = (await this.contentIndex.getDesignSystem(summary.id))?.appComponents;
      if (file && file.root === profile.root) saved = { id: summary.id, file };
    }
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatAppScanResult(profile, { outputDir: getOutputDirectory(), name: options.input.name, saved }))]);
  }
}
