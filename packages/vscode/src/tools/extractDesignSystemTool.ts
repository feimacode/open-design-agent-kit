import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractSite, formatExtractSiteResult, type ExtractionTheme } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface ExtractDesignSystemInput {
  url: string;
  extraUrls?: string[];
  theme?: ExtractionTheme;
  content?: boolean;
  localizeImages?: boolean;
}

// Renders the site and measures it (core siteExtraction.ts); writes only the
// evidence bundle under <output>/.extract/<site>/, never DESIGN.md or
// tokens.css, which the model writes from the returned draft.
export class ExtractDesignSystemTool implements vscode.LanguageModelTool<ExtractDesignSystemInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExtractDesignSystemInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Measuring the design system of ${options.input.url}`,
      confirmationMessages: {
        title: 'Open a website',
        message: new vscode.MarkdownString(`Open **${options.input.url}**${options.input.extraUrls?.length ? ` and ${options.input.extraUrls.length} more page(s)` : ''} in a headless browser to measure its colours, fonts and spacing${options.input.content ? ' and copy its content' : ''}?`),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExtractDesignSystemInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const workspaceRoot = getWorkspaceRoot();
    const { url, extraUrls, theme, content, localizeImages } = options.input;
    if (localizeImages && !content) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Invalid arguments: localizeImages needs content: true.')]);
    const result = await extractSite({ url, extraUrls, theme, content: content === true, localizeImages: localizeImages === true, workspaceRoot, outputDir: getOutputDirectory(), browserPath });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Extraction cancelled.')]);
    if (result.status === 'invalid-args') return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Invalid arguments: ${result.error}`)]);
    const shot = result.screenshots.find((s) => s.endsWith('desktop.png')) ?? result.blocked.find((b) => b.screenshot)?.screenshot;
    const image = shot ? await fs.readFile(path.join(workspaceRoot, shot)).catch(() => undefined) : undefined;
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(formatExtractSiteResult(result)),
      ...(image ? [vscode.LanguageModelDataPart.image(image, 'image/png')] : []),
    ]);
  }
}
