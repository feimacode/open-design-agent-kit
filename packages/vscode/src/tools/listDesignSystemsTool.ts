import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getActiveDesignSystemId } from '../workspace/activeDesignSystem';

interface ListDesignSystemsInput {
  query?: string;
  category?: string;
}

export class ListDesignSystemsTool implements vscode.LanguageModelTool<ListDesignSystemsInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListDesignSystemsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const designSystems = await this.contentIndex.listDesignSystems(options.input.query, options.input.category);
    const activeId = getActiveDesignSystemId();
    const payload = designSystems.map((ds) => ({
      id: ds.id,
      name: ds.name,
      summary: ds.summary,
      category: ds.category,
      source: ds.source,
      active: ds.id === activeId,
    }));
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
