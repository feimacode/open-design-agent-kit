import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { composeInstructions, selectCraftSections } from '@feimacode/open-design-agent-kit-core';
import { suggestEntryPath } from '../workspace/artifactWriter';
import { getActiveDesignSystemId, setActiveDesignSystemId } from '../workspace/activeDesignSystem';
import { detectExistingApp } from '@feimacode/open-design-agent-kit-core';

interface PrepareBriefInput {
  skillId: string;
  designSystemId?: string;
  brief: string;
}

export class PrepareBriefTool implements vscode.LanguageModelTool<PrepareBriefInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PrepareBriefInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { skillId, designSystemId: explicitDesignSystemId, brief } = options.input;

    const skill = await this.contentIndex.getSkill(skillId);
    if (!skill) {
      const available = (await this.contentIndex.listSkills()).map((s) => s.id).slice(0, 20);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Unknown skillId "${skillId}". Call list_open_design_skills to see available ids. A few available ids: ${available.join(', ')}`,
        ),
      ]);
    }

    // designSystemId is optional: an explicit one wins and becomes the new
    // active design system (sticky across future requests, mirroring how a
    // person actually works — pick a look once, keep it until changed). If
    // omitted, fall back to whatever is currently active. A stale/invalid
    // active setting (e.g. hand-edited to a typo) is treated as "none" —
    // silently, so it doesn't block every future generation until fixed.
    let designSystemId = explicitDesignSystemId;
    let designSystem: Awaited<ReturnType<ContentIndex['getDesignSystem']>> | undefined;

    if (designSystemId) {
      designSystem = await this.contentIndex.getDesignSystem(designSystemId);
      if (!designSystem) {
        const available = (await this.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `Unknown designSystemId "${designSystemId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`,
          ),
        ]);
      }
      await setActiveDesignSystemId(designSystemId);
    } else {
      const activeId = getActiveDesignSystemId();
      if (activeId) {
        designSystem = await this.contentIndex.getDesignSystem(activeId);
        designSystemId = designSystem ? activeId : undefined;
      }
    }

    const allCraftSections = await this.contentIndex.craftSections();
    const craftSections = selectCraftSections(allCraftSections, designSystem?.craftSuggested);
    const suggestedEntryPath = suggestEntryPath(brief, skill.name);
    // Deliberately reads workspaceFolders directly rather than
    // getWorkspaceRoot() (which throws with no folder open) — this tool has
    // never required an open workspace to compose instructions, and
    // detection must degrade to a no-op, not a new failure mode.
    const existingAppFrameworks = await detectExistingApp(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);

    const instructions = composeInstructions({
      skillName: skill.name,
      skillBody: skill.body,
      designSystemTitle: designSystem?.name,
      designSystemBody: designSystem?.body,
      craftSections,
      brief,
      suggestedEntryPath,
      existingAppFrameworks,
    });

    const payload = {
      instructions,
      suggestedEntryPath,
      suggestedKind: 'html',
      designSystemId: designSystem ? designSystemId : undefined,
      designSystemName: designSystem?.name,
    };

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
