import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { brandRefreshDiff, extractFromSources, extractSite, formatExtractSiteResult, formatRefreshResult, refreshUrls, validateSources, type ContentIndex, type ExtractionSource, type ExtractionTheme, type ExtractSiteResult } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface ExtractDesignSystemInput {
  url?: string;
  extraUrls?: string[];
  theme?: ExtractionTheme;
  content?: boolean;
  localizeImages?: boolean;
  /** A saved design system to compare with (openspec connect-brand-design-systems). */
  compareTo?: string;
  /** Screenshots, CSS, page source, brand guides, PowerPoint templates (openspec add-brand-from-screenshot-or-css). */
  sources?: unknown;
}

// Renders the site and measures it (core siteExtraction.ts); writes only the
// evidence bundle under <output>/.extract/<site>/, never DESIGN.md or
// tokens.css, which the model writes from the returned draft.
export class ExtractDesignSystemTool implements vscode.LanguageModelTool<ExtractDesignSystemInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExtractDesignSystemInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    if (!options.input.url && !options.input.compareTo && Array.isArray(options.input.sources)) {
      return { invocationMessage: `Drafting a design system from ${options.input.sources.length} source(s)` };
    }
    return {
      invocationMessage: options.input.url ? `Measuring the design system of ${options.input.url}` : `Measuring ${options.input.compareTo ?? 'the site'} again`,
      confirmationMessages: {
        title: 'Open a website',
        message: new vscode.MarkdownString(`Open **${options.input.url ?? `the site ${options.input.compareTo ?? ''} was saved from`}**${options.input.extraUrls?.length ? ` and ${options.input.extraUrls.length} more page(s)` : ''} in a headless browser to measure its colours, fonts and spacing${options.input.content ? ' and copy its content' : ''}?`),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExtractDesignSystemInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const workspaceRoot = getWorkspaceRoot();
    const { theme, content, localizeImages } = options.input;
    let { url, extraUrls } = options.input;
    const text = (value: string) => new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
    if (localizeImages && !content) return text('Invalid arguments: localizeImages needs content: true.');
    const compareTo = options.input.compareTo?.trim() || undefined;
    const previous = compareTo ? await this.contentIndex.getDesignSystem(compareTo) : undefined;
    if (compareTo) {
      const urls = refreshUrls(previous, compareTo);
      if (!urls.ok) return text(`Invalid arguments: ${urls.error}`);
      if (!url?.trim()) {
        url = urls.url;
        extraUrls = extraUrls ?? urls.extraUrls;
      }
    }
    let sources: ExtractionSource[] | undefined;
    if (options.input.sources !== undefined) {
      const checked = validateSources(options.input.sources);
      if (!checked.ok) return text(`Invalid arguments: ${checked.error}`);
      sources = checked.sources.length ? checked.sources : undefined;
    }
    if (!url?.trim() && sources) {
      if (content) return text('Invalid arguments: content needs a url.');
      const drafted = await extractFromSources({ workspaceRoot, outputDir: getOutputDirectory(), sources });
      return this.output(workspaceRoot, drafted, formatExtractSiteResult(drafted));
    }
    if (!url?.trim()) return text('Invalid arguments: url is required (or compareTo naming a saved design system, or sources).');
    const measured = await extractSite({ url, extraUrls, theme, content: content === true, localizeImages: localizeImages === true, workspaceRoot, outputDir: getOutputDirectory(), browserPath });
    if (token.isCancellationRequested) return text('Extraction cancelled.');
    if (measured.status === 'invalid-args') return text(`Invalid arguments: ${measured.error}`);
    const result = sources && 'bundleDir' in measured ? await extractFromSources({ workspaceRoot, outputDir: getOutputDirectory(), sources, urlResult: measured }) : measured;
    return this.output(
      workspaceRoot,
      result,
      compareTo && previous ? formatRefreshResult(formatExtractSiteResult(result), await brandRefreshDiff(workspaceRoot, previous, result)) : formatExtractSiteResult(result),
    );
  }

  private async output(workspaceRoot: string, result: ExtractSiteResult, body: string): Promise<vscode.LanguageModelToolResult> {
    if (result.status === 'invalid-args') return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Invalid arguments: ${result.error}`)]);
    const shot = result.screenshots.find((s) => s.endsWith('desktop.png')) ?? result.screenshots.find((s) => /source-\d+\.png$/.test(s)) ?? result.blocked.find((b) => b.screenshot)?.screenshot;
    const image = shot ? await fs.readFile(path.join(workspaceRoot, shot)).catch(() => undefined) : undefined;
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(body), ...(image ? [vscode.LanguageModelDataPart.image(image, 'image/png')] : [])]);
  }
}
