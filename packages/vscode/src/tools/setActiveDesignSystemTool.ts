import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { setActiveDesignSystem } from '@feimacode/open-design-agent-kit-core';
import { vscodeActiveDesignSystemStore } from '../workspace/activeDesignSystem';

interface SetActiveDesignSystemInput {
  designSystemId?: string;
}

export class SetActiveDesignSystemTool implements vscode.LanguageModelTool<SetActiveDesignSystemInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SetActiveDesignSystemInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { designSystemId } = options.input;

    const result = await setActiveDesignSystem(designSystemId, vscodeActiveDesignSystemStore, (id) =>
      this.contentIndex.getDesignSystem(id),
    );

    if (result.outcome === 'cleared') {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Cleared the active Open Design design system.')]);
    }

    if (result.outcome === 'unknown') {
      const available = (await this.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Unknown designSystemId "${result.unknownId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`,
        ),
      ]);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Active Open Design design system set to "${designSystemId}" (${result.designSystem.name}).`),
    ]);
  }
}
