import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { exportDesignSystemForClaude, resolveActiveDesignSystem, writeArtifactManifest } from '@feimacode/open-design-agent-kit-core';
import { vscodeActiveDesignSystemStore } from '../workspace/activeDesignSystem';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface ExportDesignSystemInput {
  designSystemId?: string;
  by?: string;
}

// export_open_design_design_system (openspec connect-brand-design-systems):
// Claude Design's project/ files, an own brand's assets and a registered brand.html.
export class ExportDesignSystemTool implements vscode.LanguageModelTool<ExportDesignSystemInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ExportDesignSystemInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Exporting design system ${options.input.designSystemId ?? '(active)'} for Claude Design` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ExportDesignSystemInput>): Promise<vscode.LanguageModelToolResult> {
    const text = (value: string) => new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
    const resolution = await resolveActiveDesignSystem(options.input.designSystemId?.trim() || undefined, vscodeActiveDesignSystemStore, (id) => this.contentIndex.getDesignSystem(id));
    if (resolution.unknownExplicitId) return text(`No design system "${resolution.unknownExplicitId}". list_open_design_design_systems lists them.`);
    const { designSystemId: id, designSystem: detail } = resolution;
    if (!id || !detail) return text('"designSystemId" is required (no design system is active). list_open_design_design_systems lists them.');
    try {
      const workspaceRoot = getWorkspaceRoot();
      const result = await exportDesignSystemForClaude({ workspaceRoot, outputDir: getOutputDirectory(), detail, by: options.input.by });
      await writeArtifactManifest({ workspaceRoot, entryPath: result.brandPage, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: `${detail.name}: brand`, designSystemId: id } });
      return text(JSON.stringify({ ...result, next: 'Claude Design imports the project/ folder as a Design System. brand.html is the page to look at.' }, null, 2));
    } catch (err) {
      return text(err instanceof Error ? err.message : String(err));
    }
  }
}
