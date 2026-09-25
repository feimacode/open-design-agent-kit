import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { extractBrandEvidence } from '@feimacode/open-design-agent-kit-core';
import { composeCustomDesignSystemInstructions, composeDesignSystemTokensInstructions } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, slugify } from '../workspace/artifactWriter';

interface CreateCustomDesignSystemInput {
  name?: string;
  brief?: string;
  sourceUrl?: string;
  existingDesignSystemId?: string;
}

// Composes instructions only — never writes DESIGN.md or tokens.css itself,
// same principle as prepare_open_design_brief. If sourceUrl is given, does a
// lightweight, no-daemon color/font/favicon extraction (brandExtraction.ts)
// and hands the result to the model as evidence to incorporate, not as
// something it already wrote. With existingDesignSystemId, composes
// tokens-only instructions for an existing custom design system instead
// (the preview's "Generate tokens.css" action prefills a chat request for
// exactly this).
export class CreateCustomDesignSystemTool implements vscode.LanguageModelTool<CreateCustomDesignSystemInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CreateCustomDesignSystemInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const { existingDesignSystemId, name } = options.input;
    return {
      invocationMessage: existingDesignSystemId
        ? `Preparing tokens.css for design system "${existingDesignSystemId}"`
        : `Preparing a custom design system "${name ?? ''}"`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateCustomDesignSystemInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { name, brief, sourceUrl, existingDesignSystemId } = options.input;
    const text = (value: string) => new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);

    if (existingDesignSystemId) {
      const id = existingDesignSystemId.trim();
      const result = composeDesignSystemTokensInstructions(id, await this.contentIndex.getDesignSystem(id), getOutputDirectory());
      if (!result.ok) return text(result.error);
      return text(JSON.stringify({ instructions: result.instructions, suggestedEntryPath: result.suggestedEntryPath, id: result.id }, null, 2));
    }

    if (!name?.trim() || !brief?.trim()) {
      return text('Both "name" and "brief" are required to create a new design system (or pass "existingDesignSystemId" to write only tokens.css for an existing custom one).');
    }

    const slug = slugify(name);
    const id = `user:${slug}`;
    const suggestedEntryPath = path.posix.join(getOutputDirectory(), 'design-systems', slug, 'DESIGN.md');

    const evidence = sourceUrl ? await extractBrandEvidence(sourceUrl) : undefined;

    const instructions = composeCustomDesignSystemInstructions({ name, brief, suggestedEntryPath, id, evidence });

    return text(JSON.stringify({ instructions, suggestedEntryPath, id }, null, 2));
  }
}
