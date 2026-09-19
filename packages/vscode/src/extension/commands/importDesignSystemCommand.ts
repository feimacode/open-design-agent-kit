import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildDesignSystemMarkdown } from '@feimacode/open-design-agent-kit-core';
import { fetchGithubDesignTokens } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot, slugify } from '../../workspace/artifactWriter';
import { setActiveDesignSystemId } from '../../workspace/activeDesignSystem';
import type { ILogService } from '../log/logService';

type SourceKind = 'file' | 'paste' | 'github';

interface SourcePickItem extends vscode.QuickPickItem {
  sourceKind: SourceKind;
}

// Deterministic import — no model/chat involved, unlike every other
// content-producing command in this extension. Meant for "our org already
// has a real design system, import it exactly" rather than "invent one
// from a brief" (create_open_design_design_system, the prior round).
// First multi-step QuickInput wizard in this extension (confirmed via
// research — everything else is a single showQuickPick).
export function registerImportDesignSystemCommand(context: vscode.ExtensionContext, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.importDesignSystem', async () => {
    log.info('Command: openDesign.importDesignSystem');
    await runWizard(log);
  });
  context.subscriptions.push(disposable);
}

async function runWizard(log: ILogService): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'Import Design System — Name',
    prompt: 'What should this design system be called?',
    placeHolder: 'e.g. "Acme Corp"',
    validateInput: (v) => (v.trim() ? undefined : 'A name is required.'),
  });
  if (!name) return;

  const sourcePick = await vscode.window.showQuickPick<SourcePickItem>(
    [
      { sourceKind: 'file', label: '$(file) File on disk', description: 'Pick an existing DESIGN.md, tokens.css/json, or config file' },
      { sourceKind: 'paste', label: '$(edit) Paste content', description: 'Open a scratch editor to paste tokens/DESIGN.md into' },
      { sourceKind: 'github', label: '$(github) GitHub repository', description: 'Fetch a file, or probe common token file locations in a repo' },
    ],
    { title: 'Import Design System — Source', placeHolder: 'Where should this come from?' },
  );
  if (!sourcePick) return;

  const source = await resolveSource(sourcePick.sourceKind, log);
  if (!source) return;

  const category =
    (await vscode.window.showInputBox({
      title: 'Import Design System — Category',
      prompt: 'A short category (optional)',
      placeHolder: 'e.g. "Internal Tools", leave blank for "Custom"',
    })) || 'Custom';

  const slug = slugify(name);
  const entryPath = path.join(getWorkspaceRoot(), getOutputDirectory(), 'design-systems', slug, 'DESIGN.md');
  const markdown = buildDesignSystemMarkdown({ name, category, sourceLabel: source.sourceLabel, rawContent: source.content });

  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(entryPath, markdown, 'utf8');
  log.info(`importDesignSystem: wrote ${entryPath} (source: ${source.sourceLabel})`);

  if (source.warnings.length > 0) {
    log.warn(`importDesignSystem: ${source.warnings.join(' | ')}`);
  }

  const doc = await vscode.workspace.openTextDocument(entryPath);
  await vscode.window.showTextDocument(doc);

  const id = `user:${slug}`;
  const setActive = await vscode.window.showInformationMessage(`Design system "${name}" imported.`, 'Set as Active');
  if (setActive) {
    await setActiveDesignSystemId(id);
    log.info(`importDesignSystem: set active design system to ${id}`);
  }
}

async function resolveSource(kind: SourceKind, log: ILogService): Promise<{ sourceLabel: string; content: string; warnings: string[] } | undefined> {
  if (kind === 'file') {
    const picked = await vscode.window.showOpenDialog({
      title: 'Select a design system file to import',
      canSelectMany: false,
      filters: { 'Design tokens': ['md', 'css', 'json', 'js', 'ts', 'cjs'], 'All files': ['*'] },
    });
    if (!picked || picked.length === 0) return undefined;
    const content = await fs.readFile(picked[0].fsPath, 'utf8');
    return { sourceLabel: picked[0].fsPath, content, warnings: [] };
  }

  if (kind === 'paste') {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'markdown' });
    await vscode.window.showTextDocument(doc);
    const proceed = await vscode.window.showInformationMessage(
      'Paste your existing tokens or DESIGN.md into the new editor, then click Import.',
      'Import',
      'Cancel',
    );
    if (proceed !== 'Import') return undefined;
    const content = doc.getText();
    if (!content.trim()) {
      vscode.window.showWarningMessage('Nothing was pasted — cancelled.');
      return undefined;
    }
    return { sourceLabel: 'pasted content', content, warnings: [] };
  }

  const url = await vscode.window.showInputBox({
    title: 'Import Design System — GitHub',
    prompt: 'A GitHub repository or file URL',
    placeHolder: 'https://github.com/org/repo or https://github.com/org/repo/blob/main/tokens.css',
    validateInput: (v) => (v.trim() ? undefined : 'A URL is required.'),
  });
  if (!url) return undefined;

  const result = await fetchGithubDesignTokens(url.trim());
  if (!result.content.trim()) {
    log.warn(`importDesignSystem: no content fetched from ${url} — ${result.warnings.join(' | ')}`);
    vscode.window.showWarningMessage(`Could not fetch design tokens from that URL. ${result.warnings[0] ?? ''}`.trim());
    return undefined;
  }
  return result;
}
