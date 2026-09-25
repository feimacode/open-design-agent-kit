import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import {
  composeInstructions,
  findCollectionArtifacts,
  hostOverrideFor,
  resolveActiveDesignSystem,
  selectCraftSections,
  suggestCollectionScreenEntryPath,
} from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot, slugify, suggestEntryPath } from '../workspace/artifactWriter';
import { vscodeActiveDesignSystemStore } from '../workspace/activeDesignSystem';
import { detectExistingApp } from '@feimacode/open-design-agent-kit-core';

interface PrepareBriefInput {
  skillId: string;
  designSystemId?: string;
  brief: string;
  collectionId?: string;
  collectionName?: string;
  screenRole?: string;
  screenTotal?: number;
}

export class PrepareBriefTool implements vscode.LanguageModelTool<PrepareBriefInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PrepareBriefInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { skillId, designSystemId: explicitDesignSystemId, brief, collectionId, collectionName, screenRole, screenTotal } = options.input;

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
    const resolution = await resolveActiveDesignSystem(
      explicitDesignSystemId,
      vscodeActiveDesignSystemStore,
      (id) => this.contentIndex.getDesignSystem(id),
    );
    if (resolution.unknownExplicitId) {
      const available = (await this.contentIndex.listDesignSystems()).map((d) => d.id).slice(0, 20);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Unknown designSystemId "${resolution.unknownExplicitId}". Call list_open_design_design_systems to see available ids. A few available ids: ${available.join(', ')}`,
        ),
      ]);
    }
    const designSystemId = resolution.designSystemId;
    const designSystem = resolution.designSystem;

    const allCraftSections = await this.contentIndex.craftSections();
    const craftSections = selectCraftSections(allCraftSections, designSystem?.craftSuggested);
    // Deliberately reads workspaceFolders directly rather than
    // getWorkspaceRoot() (which throws with no folder open) — this tool has
    // never required an open workspace to compose instructions, and
    // detection must degrade to a no-op, not a new failure mode.
    const existingAppFrameworks = await detectExistingApp(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);

    let suggestedEntryPath: string;
    let collectionContext: Parameters<typeof composeInstructions>[0]['collectionContext'];
    if (collectionId) {
      if (!screenRole) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            'screenRole is required when collectionId is given — a short label for this screen\'s role in the flow, e.g. "splash", "value-prop", "checkout".',
          ),
        ]);
      }
      if (!vscode.workspace.workspaceFolders?.[0]) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('No workspace folder is open. Open a folder in VS Code before generating a design collection.'),
        ]);
      }
      const siblings = await findCollectionArtifacts(getWorkspaceRoot(), getOutputDirectory(), collectionId);
      suggestedEntryPath = suggestCollectionScreenEntryPath(getOutputDirectory(), collectionId, slugify(screenRole));
      collectionContext = {
        collectionName: collectionName ?? collectionId,
        index: siblings.length + 1,
        total: screenTotal ?? siblings.length + 1,
        role: screenRole,
        siblingScreens: siblings.map((s) => ({ role: s.screenRole ?? '?', title: s.title })),
      };
    } else {
      suggestedEntryPath = suggestEntryPath(brief, skill.name);
    }

    const instructions = composeInstructions({
      skillName: skill.name,
      skillBody: skill.body,
      designSystemTitle: designSystem?.name,
      designSystemBody: designSystem?.body,
      craftSections,
      brief,
      suggestedEntryPath,
      existingAppFrameworks,
      collectionContext,
      hostOverride: hostOverrideFor(skill.id, skill.body),
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
