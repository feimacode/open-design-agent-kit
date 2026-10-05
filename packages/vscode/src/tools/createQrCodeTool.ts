import * as vscode from 'vscode';
import { createArtifactQrCode, formatQrCodeResult, type QrErrorCorrection } from '@feimacode/open-design-agent-kit-core';
import { getWorkspaceRoot } from '../workspace/artifactWriter';

interface CreateQrCodeInput {
  entryPath: string;
  text: string;
  name?: string;
  errorCorrection?: QrErrorCorrection;
  margin?: number;
}

export class CreateQrCodeTool implements vscode.LanguageModelTool<CreateQrCodeInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CreateQrCodeInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Creating a QR code for ${options.input.text}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<CreateQrCodeInput>): Promise<vscode.LanguageModelToolResult> {
    const result = await createArtifactQrCode({ ...options.input, workspaceRoot: getWorkspaceRoot() });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatQrCodeResult(result))]);
  }
}
