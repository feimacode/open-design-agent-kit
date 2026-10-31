import * as assert from 'node:assert';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultWorkspaceProblem, getDefaultWorkspace, getFigmaToken, settingFromEnv } from '../../env';
import { mkdtempSync } from 'node:fs';
import { extensionLockPath, holdExtensionLock, readLiveExtensionLock, shouldDeferToExtension, watchExtensionLock } from '../../extensionLock';
import { getManagedRoot, managedFolderName, openManagedWorkspace, writeManagedFile } from '../../managedWorkspace';
import { hasNoFolderOfItsOwn, initialWorkspace, needsFolderFromAgent, rootsMayReplace, workspaceGuardMessage } from '../../workspace';

const tmp = (prefix: string) => fs.mkdtemp(path.join(os.tmpdir(), prefix));

describe('settingFromEnv', () => {
  it('treats empty values and unexpanded ${user_config.*} placeholders as unset', () => {
    assert.strictEqual(settingFromEnv(undefined), undefined);
    assert.strictEqual(settingFromEnv('  '), undefined);
    assert.strictEqual(settingFromEnv('${user_config.figma_token}'), undefined);
    assert.strictEqual(settingFromEnv(' ${user_config.workspace} '), undefined);
    assert.strictEqual(settingFromEnv(' figd_x '), 'figd_x');
  });

  it('lets getFigmaToken fall back to the token file when the setting is a placeholder', async () => {
    const configHome = await tmp('od-config-');
    await fs.mkdir(path.join(configHome, 'open-design'), { recursive: true });
    await fs.writeFile(path.join(configHome, 'open-design', 'figma-token'), 'figd_file\n');
    assert.strictEqual(getFigmaToken({ XDG_CONFIG_HOME: configHome, OPEN_DESIGN_FIGMA_TOKEN: '${user_config.figma_token}' } as NodeJS.ProcessEnv), 'figd_file');
    assert.strictEqual(getFigmaToken({ XDG_CONFIG_HOME: configHome, OPEN_DESIGN_FIGMA_TOKEN: 'figd_form' } as NodeJS.ProcessEnv), 'figd_form');
  });
});

describe('getDefaultWorkspace', () => {
  it('returns an existing absolute folder only', async () => {
    const dir = await tmp('od-default-');
    assert.strictEqual(getDefaultWorkspace({ OPEN_DESIGN_DEFAULT_WORKSPACE: dir } as NodeJS.ProcessEnv), dir);
    assert.strictEqual(getDefaultWorkspace({ OPEN_DESIGN_DEFAULT_WORKSPACE: path.join(dir, 'missing') } as NodeJS.ProcessEnv), undefined);
    assert.strictEqual(getDefaultWorkspace({ OPEN_DESIGN_DEFAULT_WORKSPACE: 'relative' } as NodeJS.ProcessEnv), undefined);
    assert.strictEqual(getDefaultWorkspace({ OPEN_DESIGN_DEFAULT_WORKSPACE: '${user_config.workspace}' } as NodeJS.ProcessEnv), undefined);
    assert.strictEqual(getDefaultWorkspace({} as NodeJS.ProcessEnv), undefined);
  });
});

describe('workspace precedence', () => {
  it('starts from OPEN_DESIGN_WORKSPACE_ROOT, then the default folder, then the cwd', () => {
    assert.deepStrictEqual(initialWorkspace({ override: '/o', defaultWorkspace: '/d', cwd: '/c' }), { root: '/o', source: 'override' });
    assert.deepStrictEqual(initialWorkspace({ defaultWorkspace: '/d', cwd: '/c' }), { root: '/d', source: 'default' });
    assert.deepStrictEqual(initialWorkspace({ cwd: '/c' }), { root: '/c', source: 'cwd' });
  });

  it('lets MCP roots replace the default and the cwd, never an agent-set folder or the override', () => {
    assert.strictEqual(rootsMayReplace('default'), true);
    assert.strictEqual(rootsMayReplace('cwd'), true);
    assert.strictEqual(rootsMayReplace('roots'), true);
    assert.strictEqual(rootsMayReplace('agent'), false);
    assert.strictEqual(rootsMayReplace('managed'), false);
    assert.strictEqual(rootsMayReplace('override'), false);
  });
});

describe('home-folder guard', () => {
  const home = path.resolve('/home/me');

  it('refuses in the home folder, from the default and from an extension\'s cwd, until the agent names a folder', () => {
    assert.strictEqual(needsFolderFromAgent({ root: home, source: 'cwd', desktopExtension: false, home }), true);
    assert.strictEqual(needsFolderFromAgent({ root: home, source: 'roots', desktopExtension: false, home }), true);
    assert.strictEqual(needsFolderFromAgent({ root: '/Users/a/Designs', source: 'default', desktopExtension: false, home }), true);
    assert.strictEqual(needsFolderFromAgent({ root: '/Applications/Claude.app', source: 'cwd', desktopExtension: true, home }), true);
    assert.strictEqual(needsFolderFromAgent({ root: '/work/project', source: 'cwd', desktopExtension: false, home }), false);
    assert.strictEqual(needsFolderFromAgent({ root: home, source: 'agent', desktopExtension: false, home }), false);
    assert.strictEqual(needsFolderFromAgent({ root: '/Users/a/Designs', source: 'managed', desktopExtension: true, home }), false);
    assert.strictEqual(needsFolderFromAgent({ root: home, source: 'override', desktopExtension: false, home }), false);
  });

  it('names the default folder and set_open_design_workspace when the root came from the default', () => {
    const text = workspaceGuardMessage({ root: '/Users/a/Designs', source: 'default', toolName: 'prepare_open_design_brief', managedToolListed: false, managedRoot: '/Users/a/Designs' });
    assert.match(text, /\/Users\/a\/Designs/);
    assert.match(text, /set_open_design_workspace/);
    assert.match(text, /call prepare_open_design_brief again/);
    assert.doesNotMatch(text, /use_open_design_managed_workspace/);
  });

  it('names use_open_design_managed_workspace when the chat may have no folder', () => {
    const text = workspaceGuardMessage({ root: os.homedir(), source: 'cwd', toolName: 'prepare_open_design_brief', managedToolListed: true, managedRoot: '/home/me/Open Design' });
    assert.match(text, /set_open_design_workspace/);
    assert.match(text, /use_open_design_managed_workspace/);
    assert.match(text, /write_open_design_file/);
  });

  it('starts with a sentence the agent can relay to the user as is', () => {
    for (const source of ['default', 'cwd'] as const) {
      const text = workspaceGuardMessage({ root: os.homedir(), source, toolName: 'prepare_open_design_brief', managedToolListed: false, managedRoot: '/home/me/Open Design' });
      assert.ok(text.startsWith('I need a folder to save your designs in. '), text);
    }
  });
});

describe('folderless listing rule', () => {
  const home = path.resolve('/home/me');
  it('applies only with no override, no roots, and the home folder or an extension as the cwd', () => {
    assert.strictEqual(hasNoFolderOfItsOwn({ hadRoots: false, cwd: home, desktopExtension: false, home }), true);
    assert.strictEqual(hasNoFolderOfItsOwn({ hadRoots: false, cwd: '/', desktopExtension: true, home }), true);
    assert.strictEqual(hasNoFolderOfItsOwn({ hadRoots: false, cwd: '/work/project', desktopExtension: false, home }), false);
    assert.strictEqual(hasNoFolderOfItsOwn({ hadRoots: true, cwd: home, desktopExtension: false, home }), false);
    assert.strictEqual(hasNoFolderOfItsOwn({ override: '/x', hadRoots: false, cwd: home, desktopExtension: true, home }), false);
  });
});

describe('desktop extension lock', () => {
  it('counts a lock only while its process is alive', async () => {
    const env = { XDG_CONFIG_HOME: await tmp('od-lock-') } as NodeJS.ProcessEnv;
    const lockPath = extensionLockPath(env);
    assert.strictEqual(readLiveExtensionLock(lockPath), undefined);
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, version: '0.3.0', startedAt: 'now' }));
    assert.strictEqual(readLiveExtensionLock(lockPath)?.pid, process.pid);
    assert.strictEqual(readLiveExtensionLock(lockPath, () => false), undefined);
    await fs.writeFile(lockPath, 'not json');
    assert.strictEqual(readLiveExtensionLock(lockPath), undefined);
  });

  it('is held by a running extension server and gone after it exits', async () => {
    const configHome = await tmp('od-lock-');
    const lockPath = path.join(configHome, 'open-design', 'desktop-extension.lock');
    const script = `const { holdExtensionLock } = require(${JSON.stringify(path.resolve(__dirname, '../../extensionLock.ts'))}); holdExtensionLock(${JSON.stringify(lockPath)}, '0.3.0'); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ['--require', require.resolve('tsx/cjs'), '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve) => child.stdout.once('data', () => resolve()));
    assert.strictEqual(readLiveExtensionLock(lockPath)?.pid, child.pid);
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await assert.rejects(fs.access(lockPath));
  });

  it('removes only its own lock', async () => {
    const lockPath = path.join(await tmp('od-lock-'), 'desktop-extension.lock');
    const release = holdExtensionLock(lockPath, '0.3.0');
    await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid + 1, version: 'x', startedAt: 'now' }));
    release();
    await fs.access(lockPath);
  });

  it('defers only a plugin-launched server, for a client other than Claude Code, while the lock is live', () => {
    assert.strictEqual(shouldDeferToExtension({ pluginLaunched: true, clientName: 'claude-ai', lockIsLive: true }), true);
    assert.strictEqual(shouldDeferToExtension({ pluginLaunched: true, clientName: 'claude-code', lockIsLive: true }), false);
    assert.strictEqual(shouldDeferToExtension({ pluginLaunched: true, clientName: 'claude-ai', lockIsLive: false }), false);
    assert.strictEqual(shouldDeferToExtension({ pluginLaunched: false, clientName: 'claude-ai', lockIsLive: true }), false);
  });

  it('reports when a lock appears and goes away', async function () {
    this.timeout(5000);
    const lockPath = path.join(await tmp('od-lock-'), 'open-design', 'desktop-extension.lock');
    const changes: boolean[] = [];
    const watcher = watchExtensionLock(lockPath, (live) => changes.push(live));
    const until = async (n: number) => {
      for (let i = 0; i < 100 && changes.length < n; i++) await new Promise((r) => setTimeout(r, 20));
    };
    await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, version: 'x', startedAt: 'now' }));
    await until(1);
    await fs.unlink(lockPath);
    await until(2);
    watcher?.close();
    assert.deepStrictEqual(changes, [true, false]);
  });
});

describe('managed workspace', () => {
  it('uses OPEN_DESIGN_MANAGED_ROOT, else the default design folder, else Documents/Open Design, else ~/Open Design', async () => {
    const dir = await tmp('od-managed-');
    assert.strictEqual(getManagedRoot({ OPEN_DESIGN_MANAGED_ROOT: dir } as NodeJS.ProcessEnv), dir);
    assert.strictEqual(getManagedRoot({ OPEN_DESIGN_DEFAULT_WORKSPACE: dir } as NodeJS.ProcessEnv), dir);
    const home = await tmp('od-home-');
    assert.strictEqual(getManagedRoot({} as NodeJS.ProcessEnv, home), path.join(home, 'Open Design'));
    await fs.mkdir(path.join(home, 'Documents'));
    assert.strictEqual(getManagedRoot({} as NodeJS.ProcessEnv, home), path.join(home, 'Documents', 'Open Design'));
  });

  it('names folders by slug and refuses a name with nothing to slug', () => {
    assert.strictEqual(managedFolderName('Coffee poster'), 'coffee-poster');
    assert.strictEqual(managedFolderName('  Café — Menu!  '), 'cafe-menu');
    assert.throws(() => managedFolderName(''), /name is required/);
    assert.throws(() => managedFolderName('!!!'), /no letters or digits/);
  });

  it('makes the managed root the workspace with a folder per design, and reopens it without removing anything', async () => {
    const managedRoot = await tmp('od-managed-');
    const first = await openManagedWorkspace('Coffee poster', managedRoot, []);
    assert.deepStrictEqual(first, { root: managedRoot, designFolder: path.join(managedRoot, 'coffee-poster'), slug: 'coffee-poster', created: true, legacy: false });
    await fs.writeFile(path.join(first.designFolder, 'keep.txt'), 'x');
    const again = await openManagedWorkspace('coffee poster', managedRoot, []);
    assert.strictEqual(again.created, false);
    assert.strictEqual(await fs.readFile(path.join(again.designFolder, 'keep.txt'), 'utf8'), 'x');
  });

  it('reopens a per-design folder from an earlier release where it is, under the old root too', async () => {
    const managedRoot = await tmp('od-managed-');
    const oldRoot = await tmp('od-old-');
    const legacy = path.join(oldRoot, 'coffee-poster', '.open-design', 'coffee-poster');
    await fs.mkdir(legacy, { recursive: true });
    await fs.writeFile(path.join(legacy, 'coffee-poster.html.artifact.json'), '{}');
    const opened = await openManagedWorkspace('Coffee poster', managedRoot, [oldRoot]);
    assert.deepStrictEqual(opened, { root: path.join(oldRoot, 'coffee-poster'), designFolder: path.join(oldRoot, 'coffee-poster'), slug: 'coffee-poster', created: false, legacy: true });
    await assert.rejects(fs.access(path.join(managedRoot, 'coffee-poster')));
  });
});

describe('writeManagedFile', () => {
  const outputDir = '.open-design';
  const ws = () => tmp('od-write-');

  it('writes the bytes unchanged and reports their size and SHA-256', async () => {
    const workspaceRoot = await ws();
    const html = '<!doctype html><title>Coffee</title>\n<p>Ünïcode ☕</p>\n';
    const written = await writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/coffee-poster/coffee-poster.html', content: html });
    assert.strictEqual(written.path, '.open-design/coffee-poster/coffee-poster.html');
    assert.strictEqual(await fs.readFile(written.absolutePath, 'utf8'), html);
    assert.strictEqual(written.bytes, Buffer.byteLength(html));
    assert.match(written.sha256, /^[0-9a-f]{64}$/);
  });

  it('writes base64 images byte for byte and asks for base64 for binary types', async () => {
    const workspaceRoot = await ws();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
    const written = await writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/p/assets/a.png', content: png.toString('base64'), encoding: 'base64' });
    assert.deepStrictEqual(await fs.readFile(written.absolutePath), png);
    await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/p/assets/b.png', content: 'x' }), /base64/);
    await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/p/assets/c.png', content: '%%%', encoding: 'base64' }), /not valid base64/);
  });

  it('refuses paths outside the output directory', async () => {
    const workspaceRoot = await ws();
    for (const p of ['../../.bashrc', '.bashrc', 'notes/a.html', '/etc/passwd', 'C:\\\\x.html', '.open-design/../x.html', '.open-design']) {
      await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: p, content: 'x' }), /outside|absolute|design file type/, p);
    }
    assert.deepStrictEqual(await fs.readdir(workspaceRoot).then((e) => e.filter((n) => n !== '.open-design')), []);
  });

  it('refuses a symlink that leads out of the output directory', async () => {
    const workspaceRoot = await ws();
    const outside = await tmp('od-outside-');
    await fs.mkdir(path.join(workspaceRoot, outputDir), { recursive: true });
    await fs.symlink(outside, path.join(workspaceRoot, outputDir, 'link'), 'dir');
    await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/link/a.html', content: 'x' }), /through a link/);
    assert.deepStrictEqual(await fs.readdir(outside), []);
  });

  it('refuses files other tools own', async () => {
    const workspaceRoot = await ws();
    const cases: Array<[string, RegExp]> = [
      ['.open-design/p/p.html.artifact.json', /register_open_design_artifact/],
      ['.open-design/p/p.html.comments.json', /comments/],
      ['.open-design/config.json', /set_active_design_system/],
      ['.open-design/p/exports/p.png', /export_open_design_artifact/],
      ['.open-design/.checks/run/a.png', /check_open_design_artifact/],
    ];
    for (const [p, message] of cases) await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: p, content: 'eA==', encoding: 'base64' }), message, p);
  });

  it('refuses other file types and files over 5 MiB', async () => {
    const workspaceRoot = await ws();
    await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/p/run.sh', content: 'x' }), /isn't a design file type/);
    await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/p/p', content: 'x' }), /isn't a design file type/);
    const big = Buffer.alloc(6 * 1024 * 1024).toString('base64');
    await assert.rejects(writeManagedFile({ workspaceRoot, outputDir, path: '.open-design/p/big.png', content: big, encoding: 'base64' }), /5 MiB/);
    await assert.rejects(fs.access(path.join(workspaceRoot, '.open-design', 'p', 'big.png')));
  });
});

describe('defaultWorkspaceProblem', () => {
  it('says why a set default folder was not used, and nothing when it is unset or usable', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'od-default-'));
    assert.strictEqual(defaultWorkspaceProblem({} as NodeJS.ProcessEnv), undefined);
    assert.strictEqual(defaultWorkspaceProblem({ OPEN_DESIGN_DEFAULT_WORKSPACE: '${user_config.workspace}' } as NodeJS.ProcessEnv), undefined);
    assert.strictEqual(defaultWorkspaceProblem({ OPEN_DESIGN_DEFAULT_WORKSPACE: dir } as NodeJS.ProcessEnv), undefined);
    assert.match(defaultWorkspaceProblem({ OPEN_DESIGN_DEFAULT_WORKSPACE: 'designs' } as NodeJS.ProcessEnv) ?? '', /isn't an absolute path/);
    assert.match(defaultWorkspaceProblem({ OPEN_DESIGN_DEFAULT_WORKSPACE: path.join(dir, 'missing') } as NodeJS.ProcessEnv) ?? '', /doesn't exist/);
  });

  it('is named in the folder guard', () => {
    const message = workspaceGuardMessage({ root: 'C:\\Windows\\system32', source: 'cwd', toolName: 'prepare_open_design_brief', managedToolListed: true, managedRoot: 'C:\\Users\\x\\Documents\\Open Design', defaultProblem: "the Default design folder setting, D:\\Designs, doesn't exist" });
    assert.match(message, /It didn't use the default folder: the Default design folder setting, D:\\Designs, doesn't exist\./);
  });
});
