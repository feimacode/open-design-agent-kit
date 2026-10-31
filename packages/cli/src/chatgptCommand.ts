import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { chatGptPaths, downloadPluginZip, installChatGptPlugin, malformedMarketplaceHelp, pluginZipUrl, uninstallChatGptPlugin, type ChatGptPaths } from './chatgptSetup';
import { cliVersion } from './packageVersion';

function unknownApp(app: string): number {
  console.error(`Error: unknown app "${app}". Supported: chatgpt.`);
  return 1;
}

export async function runInstallChatGpt(app: string, options: { from?: string }, paths: ChatGptPaths = chatGptPaths()): Promise<number> {
  if (app !== 'chatgpt') return unknownApp(app);
  try {
    let zip: Uint8Array;
    if (options.from) {
      zip = new Uint8Array(await fs.readFile(path.resolve(options.from)));
      console.log(`Using ${path.resolve(options.from)}`);
    } else {
      console.log(`Downloading ${pluginZipUrl(cliVersion())}`);
      zip = await downloadPluginZip(cliVersion());
    }
    const result = await installChatGptPlugin(zip, paths);
    const what =
      result.outcome === 'unchanged'
        ? `Open Design ${result.version} was already installed; nothing changed in`
        : result.outcome === 'upgraded'
          ? `Upgraded Open Design ${result.previousVersion} to ${result.version} in`
          : `Installed Open Design ${result.version} in`;
    console.log(`${what} ${paths.pluginDir}`);
    if (result.marketplace === 'malformed') {
      console.log(malformedMarketplaceHelp(paths));
    } else {
      console.log(`${result.marketplace === 'unchanged' ? 'Kept' : result.marketplace === 'created' ? 'Created' : 'Updated'} ${paths.marketplace}`);
    }
    console.log(
      '\nNext: quit and reopen the ChatGPT desktop app, open Plugins, and turn on Open Design under Personal. Then, in Work or Codex, ask for a design ("make a poster for our Saturday jazz night"). Designs are saved in Documents/Open Design. Node.js 18 or later must be installed.',
    );
    return 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

export async function runUninstallChatGpt(app: string, paths: ChatGptPaths = chatGptPaths()): Promise<number> {
  if (app !== 'chatgpt') return unknownApp(app);
  try {
    const result = await uninstallChatGptPlugin(paths);
    console.log(result.folder === 'removed' ? `Removed ${paths.pluginDir}` : `${paths.pluginDir} wasn't there`);
    if (result.marketplace === 'malformed') console.log(`${paths.marketplace} isn't valid JSON, so it was left unchanged; remove the "open-design" entry yourself.`);
    else console.log(result.marketplace === 'removed' ? `Removed the open-design entry from ${paths.marketplace}` : `No open-design entry in ${paths.marketplace}`);
    console.log('Restart the ChatGPT desktop app to finish. Your designs in Documents/Open Design are kept.');
    return 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
