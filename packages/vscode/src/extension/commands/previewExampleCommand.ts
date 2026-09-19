import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';
import { ExamplePreviewProvider } from '../webviews/examplePreviewProvider';

// Mirrors remixAndOpen.ts's resolveSkillId: a tree item's own `command`
// binding passes a plain skillId string, but this command may also be
// invoked with the tree element itself in other contexts.
function resolveSkillId(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'kind' in arg && (arg as { kind: string }).kind === 'example') {
    return (arg as unknown as { entry: { id: string } }).entry.id;
  }
  return undefined;
}

export function registerPreviewExampleCommand(
  context: vscode.ExtensionContext,
  contentIndex: ContentIndex,
  assetsRoot: string,
  log: ILogService,
): void {
  const disposable = vscode.commands.registerCommand('openDesign.previewExample', (arg: unknown) => {
    log.info('Command: openDesign.previewExample');
    const skillId = resolveSkillId(arg);
    if (!skillId) {
      log.warn('previewExample: could not resolve a skillId from the command argument');
      return;
    }
    ExamplePreviewProvider.show(context, contentIndex, assetsRoot, skillId, log);
  });
  context.subscriptions.push(disposable);
}
