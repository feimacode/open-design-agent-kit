import * as vscode from 'vscode';
import { exportArtifact, exportCollectionPrototype, formatCollectionPrototypeResult, formatExportResult, resolvePrintHouse, type AssetResolution, type ContentIndex, type ExportFormat, type PasteTarget } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface ExportArtifactInput {
  entryPath: string;
  collectionId?: string;
  format?: ExportFormat;
  quality?: number;
  width?: number;
  height?: number;
  scale?: number;
  selector?: string;
  maxBytes?: number;
  deck?: boolean;
  slides?: number[];
  editable?: boolean;
  badge?: boolean;
  baseUrl?: string;
  embedAssets?: boolean;
  maxResolution?: AssetResolution;
  preset?: string;
  bleed?: number;
  cropMarks?: boolean;
  dpi?: number;
  printHouse?: string;
  checkOnly?: boolean;
  data?: string;
  sheet?: string;
  nameField?: string;
  split?: boolean;
  presets?: string[];
  shapeSheet?: boolean;
  target?: PasteTarget;
  campaignSheet?: boolean;
  transparent?: boolean;
  fps?: number;
  duration?: number;
  loop?: boolean;
}

export class ExportArtifactTool implements vscode.LanguageModelTool<ExportArtifactInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExportArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const { entryPath, format, preset, presets, checkOnly, collectionId } = options.input;
    if (collectionId) return { invocationMessage: `Exporting ${collectionId} as a clickable prototype` };
    if (presets) return { invocationMessage: `${checkOnly ? 'Checking' : 'Exporting'} ${entryPath} at ${presets.join(', ')}` };
    if (checkOnly) return { invocationMessage: `Checking ${entryPath}${preset ? ` as ${preset}` : ''}` };
    return { invocationMessage: `Exporting ${entryPath} to ${preset ?? (format ?? 'png').toUpperCase()}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExportArtifactInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (options.input.collectionId) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatCollectionPrototypeResult(await exportCollectionPrototype(getWorkspaceRoot(), getOutputDirectory(), options.input.collectionId)))]);
    }
    const config = vscode.workspace.getConfiguration('openDesign');
    const browserPath = config.get<string>('export.browserPath', '') || undefined;
    const ffmpegPath = config.get<string>('export.ffmpegPath', '') || undefined;
    const packaging = options.input.format === 'standalone' || options.input.format === 'site';
    const { printHouse: printHouseId, ...input } = options.input;
    delete input.collectionId;
    const house = printHouseId !== undefined ? await resolvePrintHouse(this.contentIndex, printHouseId) : undefined;
    if (house && !house.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(house.error)]);
    const result = await exportArtifact({
      ...input,
      printHouse: house?.printHouse,
      workspaceRoot: getWorkspaceRoot(),
      outputDir: getOutputDirectory(),
      browserPath,
      ...(['mp4', 'webm', 'gif'].includes(options.input.format ?? '') ? { ffmpegPath, isCancelled: () => token.isCancellationRequested } : {}),
      badgeSetting: packaging ? config.get<boolean>('share.badge', true) : undefined,
      lookupAspectHint: async (id) => (await this.contentIndex.getSkill(id))?.aspectHint,
    });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Export cancelled.')]);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatExportResult(result))]);
  }
}
