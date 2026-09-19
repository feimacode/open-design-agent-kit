import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractBrandEvidence } from '@feimacode/open-design-agent-kit-core';
import { composeCustomDesignSystemInstructions } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, slugify } from '../workspace/artifactWriter';

interface CreateCustomDesignSystemInput {
  name: string;
  brief: string;
  sourceUrl?: string;
}

// Composes instructions only — never writes the DESIGN.md itself, same
// principle as prepare_open_design_brief. If sourceUrl is given, does a
// lightweight, no-daemon color/font/favicon extraction (brandExtraction.ts)
// and hands the result to the model as evidence to incorporate, not as
// something it already wrote.
export class CreateCustomDesignSystemTool implements vscode.LanguageModelTool<CreateCustomDesignSystemInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CreateCustomDesignSystemInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Preparing a custom design system "${options.input.name}"` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateCustomDesignSystemInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { name, brief, sourceUrl } = options.input;
    const slug = slugify(name);
    const id = `user:${slug}`;
    const suggestedEntryPath = path.posix.join(getOutputDirectory(), 'design-systems', slug, 'DESIGN.md');

    const evidence = sourceUrl ? await extractBrandEvidence(sourceUrl) : undefined;

    const instructions = composeCustomDesignSystemInstructions({ name, brief, suggestedEntryPath, id, evidence });

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ instructions, suggestedEntryPath, id }, null, 2)),
    ]);
  }
}
