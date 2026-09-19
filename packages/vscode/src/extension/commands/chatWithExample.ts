import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import type { ILogService } from '../log/logService';

// Mirrors remixAndOpen.ts's resolveSkillId / previewExampleCommand.ts's.
function resolveSkillId(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'kind' in arg && (arg as { kind: string }).kind === 'example') {
    return (arg as unknown as { entry: { id: string } }).entry.id;
  }
  return undefined;
}

/**
 * Mirrors open-design's own Gallery: clicking an example there populates
 * the chat composer with its prompt (pinned skill reference + brief text)
 * — nothing is generated or written until the user actually sends it. This
 * is the VS Code chat equivalent: a prefilled, still-editable message via
 * `workbench.action.chat.open`, naming the skillId so the model can call
 * remix_open_design_example/prepare_open_design_brief directly rather than
 * having to search for it. Writes nothing itself, same non-destructive
 * "just browsing" guarantee as the read-only preview panel.
 */
export async function chatWithExample(contentIndex: ContentIndex, skillId: string, log: ILogService): Promise<void> {
  const skill = await contentIndex.getSkill(skillId);
  if (!skill) {
    log.warn(`chatWithExample: unknown skillId "${skillId}"`);
    return;
  }

  const brief = skill.examplePrompt ? ` ${skill.examplePrompt}` : '';
  const query = `Use the OpenDesign skill "${skillId}" (${skill.name}).${brief}`;

  log.info(`chatWithExample: prefilling chat for ${skillId}`);
  await vscode.commands.executeCommand('workbench.action.chat.open', { query, isPartialQuery: true });
}

export function registerChatWithExampleCommand(context: vscode.ExtensionContext, contentIndex: ContentIndex, log: ILogService): void {
  const disposable = vscode.commands.registerCommand('openDesign.chatWithExample', async (arg: unknown) => {
    log.info('Command: openDesign.chatWithExample');
    const skillId = resolveSkillId(arg);
    if (!skillId) {
      log.warn('chatWithExample: could not resolve a skillId from the command argument');
      return;
    }
    await chatWithExample(contentIndex, skillId, log);
  });
  context.subscriptions.push(disposable);
}
