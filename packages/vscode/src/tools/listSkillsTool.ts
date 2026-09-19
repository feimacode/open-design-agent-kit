import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';

interface ListSkillsInput {
  query?: string;
  mode?: string;
}

export class ListSkillsTool implements vscode.LanguageModelTool<ListSkillsInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListSkillsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const skills = await this.contentIndex.listSkills(options.input.query, options.input.mode);
    const payload = skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      triggers: s.triggers,
      category: s.category,
      mode: s.mode,
      source: s.source,
      examplePrompt: s.examplePrompt,
    }));
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
