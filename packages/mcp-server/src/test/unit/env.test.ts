import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { figmaTokenFilePath, getFigmaToken, isChatGptPlugin, isFolderlessAppHost, isHomeFolder, isPluginLaunched, launcherHost, workspaceRootFromArg, workspaceRootFromClientRoots } from '../../env';

describe('workspaceRootFromClientRoots', () => {
  const project = path.resolve('/tmp/od-project');

  it('returns the first file:// root as a path', () => {
    const other = path.resolve('/tmp/od-other');
    assert.strictEqual(
      workspaceRootFromClientRoots([{ uri: pathToFileURL(project).href }, { uri: pathToFileURL(other).href }]),
      project,
    );
  });

  it('skips roots that are not file URIs', () => {
    assert.strictEqual(
      workspaceRootFromClientRoots([{ uri: 'vscode-remote://ssh/home/me' }, { uri: pathToFileURL(project).href }]),
      project,
    );
  });

  it('returns undefined when no root is usable', () => {
    assert.strictEqual(workspaceRootFromClientRoots([]), undefined);
    assert.strictEqual(workspaceRootFromClientRoots([{ uri: 'https://example.com' }]), undefined);
  });
});

describe('workspaceRootFromArg', () => {
  it('accepts an existing absolute folder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ws-'));
    assert.strictEqual(workspaceRootFromArg(`${dir}/`), dir);
  });

  it('rejects a missing value, a relative path and a missing folder', () => {
    assert.throws(() => workspaceRootFromArg(undefined), /path is required/);
    assert.throws(() => workspaceRootFromArg('od-test'), /not an absolute path/);
    assert.throws(() => workspaceRootFromArg(path.resolve('/sessions/od-missing/mnt/od-test')), /connectedFolders/);
  });
});

describe('isHomeFolder', () => {
  it('matches only the home folder itself', () => {
    const home = path.resolve('/home/me');
    assert.strictEqual(isHomeFolder(`${home}/`, home), true);
    assert.strictEqual(isHomeFolder(path.join(home, 'project'), home), false);
  });
});

describe('getFigmaToken', () => {
  it('prefers the env var, then the token file, then nothing', async () => {
    const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'od-config-'));
    const env = { XDG_CONFIG_HOME: configHome } as NodeJS.ProcessEnv;
    assert.strictEqual(getFigmaToken(env), undefined);
    await fs.mkdir(path.dirname(figmaTokenFilePath(env)), { recursive: true });
    await fs.writeFile(figmaTokenFilePath(env), 'figd_file\n');
    assert.strictEqual(getFigmaToken(env), 'figd_file');
    assert.strictEqual(getFigmaToken({ ...env, OPEN_DESIGN_FIGMA_TOKEN: ' figd_env ' }), 'figd_env');
  });
});

describe('launcher host (add-chatgpt-desktop-plugin)', () => {
  it('tells the Claude plugin, the ChatGPT plugin and neither apart', () => {
    assert.strictEqual(launcherHost({ OPEN_DESIGN_LAUNCHER: 'claude-plugin' }), 'claude');
    assert.strictEqual(launcherHost({ OPEN_DESIGN_LAUNCHER: ' chatgpt-plugin ' }), 'chatgpt');
    assert.strictEqual(launcherHost({}), undefined);
  });

  it('keeps the Claude-only plugin check (desktop extension hand-off) off for ChatGPT', () => {
    assert.strictEqual(isPluginLaunched({ OPEN_DESIGN_LAUNCHER: 'chatgpt-plugin' }), false);
    assert.strictEqual(isChatGptPlugin({ OPEN_DESIGN_LAUNCHER: 'chatgpt-plugin' }), true);
  });

  it('treats the ChatGPT plugin and the desktop extension as hosts with no folder of their own', () => {
    assert.strictEqual(isFolderlessAppHost({ OPEN_DESIGN_LAUNCHER: 'chatgpt-plugin' }), true);
    assert.strictEqual(isFolderlessAppHost({ OPEN_DESIGN_HOST: 'claude-desktop-extension' }), true);
    assert.strictEqual(isFolderlessAppHost({ OPEN_DESIGN_LAUNCHER: 'claude-plugin' }), false);
  });
});
