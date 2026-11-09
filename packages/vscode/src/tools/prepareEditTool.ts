import * as vscode from 'vscode';
import { formatPrepareEditResult, prepareEdit, type ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface PrepareEditInput {
  entryPath: string;
  verb?: string;
  scope?: unknown;
  notes?: string;
  undo?: string;
}

// A steering edit (core steeringEdits.ts): marks and snapshots one part of the
// design and returns the instructions; the model makes the edit and checks it
// with the editId. With undo, restores the snapshot.
export class PrepareEditTool implements vscode.LanguageModelTool<PrepareEditInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<PrepareEditInput>): Promise<vscode.PreparedToolInvocation> {
    const { undo, verb, entryPath } = options.input;
    return { invocationMessage: undo ? `Undoing edit ${undo} on ${entryPath}` : `Preparing a ${verb ?? 'steering'} edit on ${entryPath}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<PrepareEditInput>): Promise<vscode.LanguageModelToolResult> {
    const verbsDoc = (await this.contentIndex.craftSections()).find((c) => c.id === 'steering-verbs')?.body;
    const result = await prepareEdit({ ...options.input, workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory(), verbsDoc });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatPrepareEditResult(result))]);
  }
}
