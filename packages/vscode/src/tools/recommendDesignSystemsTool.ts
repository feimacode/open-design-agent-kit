import * as vscode from 'vscode';
import { resolveLike, type ContentIndex, type DesignProfile } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';
import { getActiveDesignSystemId } from '../workspace/activeDesignSystem';

type RecommendDesignSystemsInput = DesignProfile & { limit?: number; like?: string };

/** Ranks design systems against a design profile (openspec add-design-system-matching). Never changes the active one. */
export class RecommendDesignSystemsTool implements vscode.LanguageModelTool<RecommendDesignSystemsInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RecommendDesignSystemsInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { limit, like, ...profile } = options.input;
    let likeTokens: { tokens: Map<string, string> | Record<string, string>; id?: string } | undefined;
    if (typeof like === 'string' && like.trim()) {
      let workspaceRoot: string | undefined;
      try {
        workspaceRoot = getWorkspaceRoot();
      } catch {
        workspaceRoot = undefined; // no folder open: only design system ids can be named
      }
      const resolved = workspaceRoot
        ? await resolveLike(this.contentIndex, workspaceRoot, getOutputDirectory(), like)
        : await this.contentIndex.designSystemTokens(like.trim()).then((tokens) => (tokens ? { ok: true as const, tokens, id: like.trim() } : { ok: false as const, error: `No design system "${like}".` }));
      if (!resolved.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Invalid arguments: ${resolved.error}`)]);
      likeTokens = { tokens: resolved.tokens, id: resolved.id };
    }
    const result = await this.contentIndex.recommendDesignSystems(profile, limit, likeTokens);
    const payload = { ...result, activeDesignSystemId: getActiveDesignSystemId() };
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
