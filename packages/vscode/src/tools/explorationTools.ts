import * as vscode from 'vscode';
import {
  chooseDirection,
  compareExploration,
  detectExistingApp,
  prepareExploration,
  type ChooseDirectionInput,
  type ContentIndex,
  type ExplorationToolContext,
  type PrepareExplorationInput,
} from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory } from '../workspace/artifactWriter';
import { vscodeActiveDesignSystemStore } from '../workspace/activeDesignSystem';

// Thin adapters over core's host-agnostic exploration tools (see
// openspec/changes/add-explorations/design.md, decision 9): they only build
// the context and wrap the returned text.

async function explorationContext(contentIndex: ContentIndex, detectApp: boolean): Promise<ExplorationToolContext> {
  // Deliberately reads workspaceFolders directly rather than getWorkspaceRoot()
  // (which throws): core returns a clear "open a folder" message instead.
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return {
    contentIndex,
    store: vscodeActiveDesignSystemStore,
    workspaceRoot,
    outputDir: getOutputDirectory(),
    existingAppFrameworks: detectApp ? await detectExistingApp(workspaceRoot) : undefined,
    browserPath: vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined,
  };
}

function text(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}

// VS Code shows exploration directions in its own preview editor; the
// comparison page is for an external browser. The model would otherwise try
// Simple Browser on a file:// URL, which VS Code blocks.
const COMPARE_PAGE_NOTE =
  '\n\nIn VS Code, each registered direction opens in the Open Design Artifact Preview, with previous/next buttons to step through the directions. The exploration is also listed in the Open Design Collections view, whose “Open comparison in browser” entry opens the side-by-side comparison page in the user’s own browser: point them there. Do not open it yourself in Simple Browser or via a file:// URL; VS Code blocks that.';

export class PrepareExplorationTool implements vscode.LanguageModelTool<PrepareExplorationInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Planning Open Design directions to explore' };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<PrepareExplorationInput>): Promise<vscode.LanguageModelToolResult> {
    return text(await prepareExploration(await explorationContext(this.contentIndex, true), options.input));
  }
}

export class CompareExplorationTool implements vscode.LanguageModelTool<{ explorationId: string; contactSheet?: boolean }> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<{ explorationId: string; contactSheet?: boolean }>,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: options.input.contactSheet ? 'Comparing directions and rendering a contact sheet' : 'Comparing directions' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ explorationId: string; contactSheet?: boolean }>,
  ): Promise<vscode.LanguageModelToolResult> {
    return text((await compareExploration(await explorationContext(this.contentIndex, false), options.input)) + COMPARE_PAGE_NOTE);
  }
}

export class ChooseDirectionTool implements vscode.LanguageModelTool<ChooseDirectionInput> {
  constructor(private readonly contentIndex: ContentIndex) {}

  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ChooseDirectionInput>): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Taking direction "${options.input.directionId}" forward (${options.input.next})` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<ChooseDirectionInput>): Promise<vscode.LanguageModelToolResult> {
    return text(await chooseDirection(await explorationContext(this.contentIndex, true), options.input));
  }
}

export { COMPARE_PAGE_NOTE };
