import * as vscode from 'vscode';
import type { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getActiveDesignSystemId, onActiveDesignSystemChanged } from '../../workspace/activeDesignSystem';
import type { ILogService } from '../log/logService';

export function registerActiveDesignSystemStatusBarItem(context: vscode.ExtensionContext, contentIndex: ContentIndex, log: ILogService): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'openDesign.browseDesignSystems';
  context.subscriptions.push(item);

  // Was previously un-instrumented and had no error handling: if
  // `contentIndex.getDesignSystem` threw (e.g. a stale/corrupt setting), the
  // `void refresh()` below would silently drop the rejection and the item
  // would never call `.show()` — invisible, with no signal anywhere why.
  const refresh = async () => {
    try {
      const activeId = getActiveDesignSystemId();
      if (!activeId) {
        item.text = '$(symbol-color) No design system';
        item.tooltip = 'OpenDesign: no active design system — click to pick one';
        item.show();
        return;
      }
      const designSystem = await contentIndex.getDesignSystem(activeId);
      if (!designSystem) {
        item.text = '$(symbol-color) No design system';
        item.tooltip = `OpenDesign: active design system "${activeId}" was not found (stale setting) — click to pick one`;
        item.show();
        return;
      }
      item.text = `$(symbol-color) ${designSystem.name}`;
      item.tooltip = `OpenDesign: active design system — click to change`;
      item.show();
      log.debug(`Status bar: showing active design system "${activeId}"`);
    } catch (err) {
      log.error(err, 'Status bar: failed to refresh active design system item');
    }
  };

  context.subscriptions.push(onActiveDesignSystemChanged(() => void refresh()));
  void refresh();
}
