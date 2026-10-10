import * as vscode from 'vscode';
import { formatIntegrations, type ContentIndex, type ListIntegrationsInput } from '@feimacode/open-design-agent-kit-core';

// Read-only lookup of trusted third-party MCP servers (openspec
// add-integration-registry). Returns text only: Copilot installs nothing
// through this tool; it runs the returned steps itself after the user agrees.
export class ListIntegrationsTool implements vscode.LanguageModelTool<ListIntegrationsInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListIntegrationsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const registry = await this.contentIndex.getIntegrationRegistry();
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatIntegrations(registry, options.input ?? {}, 'vscode'))]);
  }
}
