import * as vscode from 'vscode';
import { listSkillsPayload, type ContentIndex, type ListSkillsInput } from '@feimacode/open-design-agent-kit-core';

export class ListSkillsTool implements vscode.LanguageModelTool<ListSkillsInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListSkillsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const payload = await listSkillsPayload(this.contentIndex, options.input);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
