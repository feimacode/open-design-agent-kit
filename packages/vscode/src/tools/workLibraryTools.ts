import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { formatImportWorkResult, formatLibrary, importWork, saveProject, saveTarget } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';
import { getFigmaToken } from '../workspace/figmaTokenStore';

// The work library tools (openspec add-work-library): the designer's
// projects, facts and images, entered once for every portfolio output.

function browserPath(): string | undefined {
  return vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
}

const text = (t: string) => new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(t)]);

export class SaveProjectTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, unknown>>): Promise<vscode.PreparedToolInvocation> {
    const project = options.input.project as { title?: string; slug?: string } | undefined;
    return { invocationMessage: `Saving ${project?.title ?? project?.slug ?? 'the work library'}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    if (typeof input.style === 'string' && input.style.trim() && !(await this.contentIndex.getDesignSystem(input.style.trim()))) {
      return text(`Nothing was saved: there is no design system "${input.style.trim()}". Pick one from list_open_design_design_systems, or build one first.`);
    }
    const result = await saveProject({
      workspaceRoot: getWorkspaceRoot(),
      outputDir: getOutputDirectory(),
      owner: input.owner,
      style: typeof input.style === 'string' ? input.style : undefined,
      order: input.order,
      project: input.project,
      assets: input.assets,
      browserPath: browserPath(),
    });
    return text(result.text);
  }
}

export class GetLibraryTool implements vscode.LanguageModelTool<{ project?: string }> {
  async prepareInvocation(): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Reading the work library' };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<{ project?: string }>): Promise<vscode.LanguageModelToolResult> {
    return text(await formatLibrary(getWorkspaceRoot(), getOutputDirectory(), options.input.project?.trim() || undefined));
  }
}

export class ImportWorkTool implements vscode.LanguageModelTool<{ project: string; sources: unknown[] }> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<{ project: string; sources: unknown[] }>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Importing ${Array.isArray(options.input.sources) ? options.input.sources.length : 0} item(s) into ${options.input.project}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<{ project: string; sources: unknown[] }>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const result = await importWork({
      workspaceRoot: getWorkspaceRoot(),
      outputDir: getOutputDirectory(),
      project: String(options.input.project ?? '').trim(),
      sources: options.input.sources,
      browserPath: browserPath(),
      figmaToken: await getFigmaToken(this.context),
    });
    if (token.isCancellationRequested) return text('Import cancelled.');
    const images = result.imported.flatMap((i) => (i.preview ? [vscode.LanguageModelDataPart.image(i.preview.data, i.preview.mime)] : [])).slice(0, 6);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatImportWorkResult(result)), ...images]);
  }
}

export class SaveTargetTool implements vscode.LanguageModelTool<{ target: unknown }> {
  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<{ target: unknown }>): Promise<vscode.PreparedToolInvocation> {
    const t = options.input.target as { name?: string; slug?: string } | undefined;
    return { invocationMessage: `Saving the portfolio version ${t?.name ?? t?.slug ?? ''}`.trim() };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<{ target: unknown }>): Promise<vscode.LanguageModelToolResult> {
    return text((await saveTarget({ workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory(), target: options.input.target })).text);
  }
}
