import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { setActiveDesignSystemId } from '../workspace/activeDesignSystem';

interface SetActiveDesignSystemInput {
  designSystemId?: string;
}

export class SetActiveDesignSystemTool implements vscode.LanguageModelTool<SetActiveDesignSystemInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SetActiveDesignSystemInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { designSystemId } = options.input;

    if (!designSystemId || designSystemId.trim().length === 0) {
      await setActiveDesignSystemId(undefined);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Cleared the active OpenDesign design system.')]);
    }

    const designSystem = await this.contentIndex.getDesignSystem(designSystemId);
    if (!designSystem) {
      const available = (await this.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Unknown designSystemId "${designSystemId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`,
        ),
      ]);
    }

    await setActiveDesignSystemId(designSystemId);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Active OpenDesign design system set to "${designSystemId}" (${designSystem.name}).`),
    ]);
  }
}
