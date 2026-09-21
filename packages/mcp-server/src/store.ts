import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ActiveDesignSystemStore } from '@feimacode/open-design-agent-kit-core';

interface ConfigFile {
  activeDesignSystemId?: string;
}

/**
 * The MCP server's equivalent of VS Code's `openDesign.activeDesignSystemId`
 * workspace setting: a small local JSON file, since there's no editor
 * settings store to lean on here. Lives under `.open-design/` (not the
 * configurable output directory) so it survives independent of where
 * generated artifacts happen to be configured to land.
 */
export function createFileActiveDesignSystemStore(workspaceRoot: string): ActiveDesignSystemStore {
  const configPath = path.join(workspaceRoot, '.open-design', 'config.json');

  async function readConfig(): Promise<ConfigFile> {
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as ConfigFile) : {};
    } catch {
      return {};
    }
  }

  return {
    async get() {
      const config = await readConfig();
      const value = config.activeDesignSystemId?.trim();
      return value ? value : undefined;
    },
    async set(id) {
      const config = await readConfig();
      if (id && id.trim().length > 0) {
        config.activeDesignSystemId = id.trim();
      } else {
        delete config.activeDesignSystemId;
      }
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    },
  };
}
