import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import {
  ownBrandHint,
  composeInstructions,
  latestFlowPlan,
  resolveBriefFlow,
  prepareBaseScreen,
  loadRedesignContext,
  type RedesignContext,
  composeComponentVocabularySection,
  findCollectionArtifacts,
  resolveBriefCanvas,
  hostOverrideFor,
  resolveBriefSources,
  resolveActiveDesignSystem,
  resolveCraftSections,
  craftRequirementsFor,
  suggestCollectionScreenEntryPath,
  validateBriefDecisions,
  loadRecentDesigns,
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
  flow?: unknown;
  baseScreen?: string;
  screenTotal?: number;
  sources?: string[];
  format?: string;
  fluid?: boolean;
  answers?: Record<string, string>;
  assumptions?: string[];
  redesign?: unknown;
}

export class PrepareBriefTool implements vscode.LanguageModelTool<PrepareBriefInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PrepareBriefInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { skillId, designSystemId: explicitDesignSystemId, brief, collectionId, collectionName, screenRole, screenTotal, flow, baseScreen: baseScreenInput, sources: sourcePaths, format, fluid, answers, assumptions, redesign: redesignInput } = options.input;

    const decisions = validateBriefDecisions(answers, assumptions);
    if (!decisions.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(decisions.error)]);

    const canvas = resolveBriefCanvas(format, fluid);
    if ('error' in canvas) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(canvas.error)]);
    const canvasFormat = canvas.format;

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
    const craftSections = resolveCraftSections(allCraftSections, craftRequirementsFor(skill, designSystem));
    // Deliberately reads workspaceFolders directly rather than
    // getWorkspaceRoot() (which throws with no folder open) — this tool has
    // never required an open workspace to compose instructions, and
    // detection must degrade to a no-op, not a new failure mode.
    const existingAppFrameworks = await detectExistingApp(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);

    let suggestedEntryPath: string;
    let collectionContext: Parameters<typeof composeInstructions>[0]['collectionContext'];
    let flowContext: Parameters<typeof composeInstructions>[0]['flowContext'];
    let flowNote: string | undefined;
    if (flow !== undefined && !collectionId) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('flow needs collectionId: a flow plan belongs to a collection of screens.')]);
    }
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
      const resolvedFlow = resolveBriefFlow(flow, latestFlowPlan(siblings), screenRole, suggestedEntryPath);
      if (!resolvedFlow.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(resolvedFlow.error)]);
      flowContext = resolvedFlow.context;
      flowNote = resolvedFlow.note;
    } else {
      suggestedEntryPath = suggestEntryPath(brief, skill.name);
    }

    const sources = await resolveBriefSources({
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      outputDir: getOutputDirectory(),
      sourcePaths,
      skillId: skill.id,
      skillMode: skill.mode,
      suggestedEntryPath,
    });
    if (!sources.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(sources.error)]);

    let baseScreen: { path: string; from: string } | undefined;
    if (baseScreenInput) {
      if (!vscode.workspace.workspaceFolders?.[0]) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('baseScreen needs an open workspace folder.')]);
      const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
      const base = await prepareBaseScreen({ workspaceRoot: getWorkspaceRoot(), outputDir: getOutputDirectory(), entryPath: suggestedEntryPath, baseScreen: baseScreenInput, browserPath });
      if (!base.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(base.error)]);
      baseScreen = base;
    }
    let redesign: RedesignContext | undefined;
    if (redesignInput !== undefined) {
      if (!vscode.workspace.workspaceFolders?.[0]) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('redesign needs an open workspace folder.')]);
      const loaded = await loadRedesignContext(getWorkspaceRoot(), getOutputDirectory(), redesignInput);
      if (!loaded.ok) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(loaded.error)]);
      redesign = loaded.context;
    }
    const recentDesigns = await loadRecentDesigns(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, { collectionId, entryPath: suggestedEntryPath });
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
      flowContext,
      componentVocabulary: designSystem?.appComponents ? composeComponentVocabularySection(designSystem.appComponents) : undefined,
      baseScreen,
      redesign,
      hostOverride: hostOverrideFor(skill.id, skill.body),
      sourceContext: sources.context,
      canvasFormat,
      fluid: canvas.fluid,
      decisions: decisions.decisions,
      recentDesigns,
    });

    const payload = {
      instructions,
      suggestedEntryPath,
      suggestedKind: 'html',
      format: canvasFormat?.id,
      fluid: canvasFormat ? canvas.fluid : undefined,
      designSystemId: designSystem ? designSystemId : undefined,
      designSystemName: designSystem?.name,
      designSystemHint: designSystem
        ? undefined
        : "No design system was used. If the user wants a look but hasn't named one, call recommend_open_design_design_systems with what you know about the design, then prepare the brief again with the chosen designSystemId.",
      brandHint: ownBrandHint(await this.contentIndex.ownBrandDesignSystems(), designSystem),
      outlinePath: sources.context?.outlinePath,
      sources: sources.context?.sources.map((s) => ({ path: s.path, markdownPath: s.markdownPath, kind: s.kind })),
      flowScreenId: flowContext?.screenId,
      flowNote,
      baseScreenPath: baseScreen?.path,
      redesign: redesign ? { contentPath: redesign.contentPath, auditPath: redesign.auditPath, findings: redesign.findings.map((f) => f.id), concept: !redesign.owned } : undefined,
    };

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
