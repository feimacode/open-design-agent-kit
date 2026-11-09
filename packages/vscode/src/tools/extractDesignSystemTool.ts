import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { brandRefreshDiff, composeFigmaReadInstructions, extractFromSources, extractSite, formatExtractSiteResult, formatRefreshResult, parseFigmaUrl, refreshUrls, validateSources, withNearestDesignSystems, type ContentIndex, type ExtractionSource, type ExtractionTheme, type ExtractSiteResult } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';
import { getFigmaToken } from '../workspace/figmaTokenStore';

interface ExtractDesignSystemInput {
  url?: string;
  extraUrls?: string[];
  theme?: ExtractionTheme;
  content?: boolean;
  localizeImages?: boolean;
  /** With no extraUrls: also measure up to 3 pages from the home page's navigation (default true). */
  discover?: boolean;
  /** A saved design system to compare with (openspec connect-brand-design-systems). */
  compareTo?: string;
  /** Screenshots, CSS, page source, brand guides, PowerPoint templates (openspec add-brand-from-screenshot-or-css). */
  sources?: unknown;
}

// Renders the site and measures it (core siteExtraction.ts); writes only the
// evidence bundle under <output>/.extract/<site>/, never DESIGN.md or
// tokens.css, which the model writes from the returned draft.
export class ExtractDesignSystemTool implements vscode.LanguageModelTool<ExtractDesignSystemInput> {
  constructor(
    private readonly contentIndex: ContentIndex,
    private readonly context: vscode.ExtensionContext,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExtractDesignSystemInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const sources = options.input.sources;
    if (Array.isArray(sources) && sources.some((s) => s && typeof s === 'object' && (s as { kind?: string }).kind === 'figma')) {
      return { invocationMessage: 'Drafting a design system from a Figma file' };
    }
    if (!options.input.url && !options.input.compareTo && Array.isArray(sources)) {
      return { invocationMessage: `Drafting a design system from ${sources.length} source(s)` };
    }
    if (options.input.url && parseFigmaUrl(options.input.url)) {
      return { invocationMessage: `Working out what to read from ${options.input.url}` };
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
    const { theme, content, localizeImages, discover } = options.input;
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
    const figmaSource = sources?.some((s) => s.kind === 'figma') === true;
    if (url?.trim()) {
      // A Figma link: the editor agent reads the file with Figma's connector and calls back with a figma source. Nothing contacts Figma here.
      const link = url.trim();
      const ref = parseFigmaUrl(link);
      // With any sources (a figma source, or the screenshot the read steps fall back to), draft from them instead of asking again.
      if (ref && !sources) {
        const result: ExtractSiteResult = {
          status: 'needs-figma-read',
          fileKey: ref.fileKey,
          nodeId: ref.nodeId,
          link,
          instructions: composeFigmaReadInstructions({ link, ref, tokenConfigured: Boolean(await getFigmaToken(this.context)) }),
          notes: [],
        };
        return this.output(workspaceRoot, result, formatExtractSiteResult(result));
      }
      if (figmaSource && !ref) return text('Invalid arguments: url with a figma source must be the same Figma link or left out: the tool does not open a website when drafting from a Figma file.');
    }
    if (sources && (figmaSource || !url?.trim() || parseFigmaUrl(url.trim()))) {
      if (content) return text('Invalid arguments: content needs a url.');
      const drafted = await withNearestDesignSystems(
        await extractFromSources({ workspaceRoot, outputDir: getOutputDirectory(), sources, figmaToken: figmaSource ? await getFigmaToken(this.context) : undefined }),
        this.contentIndex,
      );
      return this.output(workspaceRoot, drafted, formatExtractSiteResult(drafted));
    }
    if (!url?.trim()) return text('Invalid arguments: url is required (or compareTo naming a saved design system, or sources).');
    const measured = await extractSite({ url, extraUrls, theme, content: content === true, localizeImages: localizeImages === true, discover: discover ?? (compareTo ? false : undefined), workspaceRoot, outputDir: getOutputDirectory(), browserPath });
    if (token.isCancellationRequested) return text('Extraction cancelled.');
    if (measured.status === 'invalid-args') return text(`Invalid arguments: ${measured.error}`);
    const result = await withNearestDesignSystems(sources && 'bundleDir' in measured ? await extractFromSources({ workspaceRoot, outputDir: getOutputDirectory(), sources, urlResult: measured }) : measured, this.contentIndex);
    return this.output(
      workspaceRoot,
      result,
      compareTo && previous ? formatRefreshResult(formatExtractSiteResult(result), await brandRefreshDiff(workspaceRoot, previous, result)) : formatExtractSiteResult(result),
    );
  }

  private async output(workspaceRoot: string, result: ExtractSiteResult, body: string): Promise<vscode.LanguageModelToolResult> {
    if (result.status === 'invalid-args') return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Invalid arguments: ${result.error}`)]);
    if (result.status === 'needs-figma-read') return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(body)]);
    const shot = result.screenshots.find((s) => s.endsWith('desktop.png')) ?? result.screenshots.find((s) => /source-\d+\.png$/.test(s)) ?? result.blocked.find((b) => b.screenshot)?.screenshot;
    const image = shot ? await fs.readFile(path.join(workspaceRoot, shot)).catch(() => undefined) : undefined;
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(body), ...(image ? [vscode.LanguageModelDataPart.image(image, 'image/png')] : [])]);
  }
}
