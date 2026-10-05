import * as vscode from 'vscode';
import { exportArtifact, formatExportResult, type ContentIndex, type ExportFormat } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';

interface ExportArtifactInput {
  entryPath: string;
  format?: ExportFormat;
  quality?: number;
  width?: number;
  height?: number;
  scale?: number;
  selector?: string;
  maxBytes?: number;
  deck?: boolean;
  slides?: number[];
  badge?: boolean;
  baseUrl?: string;
  preset?: string;
  bleed?: number;
  cropMarks?: boolean;
  checkOnly?: boolean;
  data?: string;
  sheet?: string;
  nameField?: string;
  split?: boolean;
  presets?: string[];
  shapeSheet?: boolean;
}

export class ExportArtifactTool implements vscode.LanguageModelTool<ExportArtifactInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExportArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const { entryPath, format, preset, presets, checkOnly } = options.input;
    if (presets) return { invocationMessage: `${checkOnly ? 'Checking' : 'Exporting'} ${entryPath} at ${presets.join(', ')}` };
    if (checkOnly) return { invocationMessage: `Checking ${entryPath}${preset ? ` as ${preset}` : ''}` };
    return { invocationMessage: `Exporting ${entryPath} to ${preset ?? (format ?? 'png').toUpperCase()}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExportArtifactInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const config = vscode.workspace.getConfiguration('openDesign');
    const browserPath = config.get<string>('export.browserPath', '') || undefined;
    const packaging = options.input.format === 'standalone' || options.input.format === 'site';
    const result = await exportArtifact({
      ...options.input,
      workspaceRoot: getWorkspaceRoot(),
      browserPath,
      badgeSetting: packaging ? config.get<boolean>('share.badge', true) : undefined,
      lookupAspectHint: async (id) => (await this.contentIndex.getSkill(id))?.aspectHint,
    });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Export cancelled.')]);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatExportResult(result))]);
  }
}
