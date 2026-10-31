import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import {
  chatGptPaths,
  downloadPluginZip,
  installChatGptPlugin,
  marketplaceEntry,
  mergeMarketplace,
  pluginZipUrl,
  uninstallChatGptPlugin,
  unpackZip,
} from '../../chatgptSetup';

function pluginZip(version: string, extra: Record<string, string> = {}): Uint8Array {
  return zipSync({
    'plugin.json': strToU8(JSON.stringify({ name: 'open-design', version })),
    'mcp.json': strToU8('{}'),
    'skills/open-design/SKILL.md': strToU8(`# v${version}`),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}

async function tempHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-chatgpt-home-'));
}

describe('install chatgpt (add-chatgpt-desktop-plugin)', () => {
  it('first install creates the marketplace file and the plugin folder', async () => {
    const paths = chatGptPaths(await tempHome());
    const result = await installChatGptPlugin(pluginZip('0.4.0'), paths);
    assert.strictEqual(result.outcome, 'installed');
    assert.strictEqual(result.marketplace, 'created');
    const market = JSON.parse(await fs.readFile(paths.marketplace, 'utf8'));
    assert.deepStrictEqual(market.plugins, [marketplaceEntry(paths)]);
    assert.strictEqual(market.plugins[0].source.path, './.codex/plugins/open-design');
    assert.strictEqual(await fs.readFile(path.join(paths.pluginDir, 'skills', 'open-design', 'SKILL.md'), 'utf8'), '# v0.4.0');
  });

  it('keeps other plugins and fields, and re-running the same version changes nothing', async () => {
    const paths = chatGptPaths(await tempHome());
    await fs.mkdir(path.dirname(paths.marketplace), { recursive: true });
    const other = { name: 'notes', source: { source: 'local', path: './.codex/plugins/notes' } };
    await fs.writeFile(paths.marketplace, JSON.stringify({ name: 'mine', custom: true, plugins: [other] }));
    assert.strictEqual((await installChatGptPlugin(pluginZip('0.4.0'), paths)).marketplace, 'updated');
    const before = await fs.readFile(paths.marketplace, 'utf8');
    const market = JSON.parse(before);
    assert.strictEqual(market.name, 'mine');
    assert.strictEqual(market.custom, true);
    assert.deepStrictEqual(market.plugins[0], other);
    const again = await installChatGptPlugin(pluginZip('0.4.0'), paths);
    assert.strictEqual(again.outcome, 'unchanged');
    assert.strictEqual(again.marketplace, 'unchanged');
    assert.strictEqual(await fs.readFile(paths.marketplace, 'utf8'), before);
  });

  it('upgrades in place and drops files the new version no longer has', async () => {
    const paths = chatGptPaths(await tempHome());
    await installChatGptPlugin(pluginZip('0.4.0', { 'skills/old/SKILL.md': 'old' }), paths);
    const result = await installChatGptPlugin(pluginZip('0.5.0'), paths);
    assert.strictEqual(result.outcome, 'upgraded');
    assert.strictEqual(result.previousVersion, '0.4.0');
    await assert.rejects(fs.access(path.join(paths.pluginDir, 'skills', 'old')));
    const siblings = await fs.readdir(path.dirname(paths.pluginDir));
    assert.deepStrictEqual(siblings, ['open-design']);
  });

  it('leaves a malformed marketplace file alone', async () => {
    const paths = chatGptPaths(await tempHome());
    await fs.mkdir(path.dirname(paths.marketplace), { recursive: true });
    await fs.writeFile(paths.marketplace, '{ not json');
    assert.strictEqual(await mergeMarketplace(paths), 'malformed');
    assert.strictEqual(await fs.readFile(paths.marketplace, 'utf8'), '{ not json');
  });

  it('refuses a zip that is not the Open Design plugin, keeping what was installed', async () => {
    const paths = chatGptPaths(await tempHome());
    await installChatGptPlugin(pluginZip('0.4.0'), paths);
    const wrong = zipSync({ 'plugin.json': strToU8(JSON.stringify({ name: 'other', version: '1.0.0' })) });
    await assert.rejects(installChatGptPlugin(wrong, paths), /not the Open Design ChatGPT plugin/);
    assert.strictEqual(JSON.parse(await fs.readFile(path.join(paths.pluginDir, 'plugin.json'), 'utf8')).version, '0.4.0');
  });

  it('refuses zip entries that would land outside the plugin folder', async () => {
    const dest = await tempHome();
    await assert.rejects(unpackZip(zipSync({ '../escape.txt': strToU8('x') }), path.join(dest, 'p')), /outside its folder/);
  });

  it('uninstall removes only our folder and entry', async () => {
    const paths = chatGptPaths(await tempHome());
    await installChatGptPlugin(pluginZip('0.4.0'), paths);
    const market = JSON.parse(await fs.readFile(paths.marketplace, 'utf8'));
    market.plugins.push({ name: 'notes' });
    await fs.writeFile(paths.marketplace, JSON.stringify(market));
    assert.deepStrictEqual(await uninstallChatGptPlugin(paths), { folder: 'removed', marketplace: 'removed' });
    assert.deepStrictEqual(JSON.parse(await fs.readFile(paths.marketplace, 'utf8')).plugins, [{ name: 'notes' }]);
    await assert.rejects(fs.access(paths.pluginDir));
  });

  it('downloads the release zip and checks its checksum', async () => {
    const zip = pluginZip('0.4.0');
    const sum = createHash('sha256').update(zip).digest('hex');
    const fake = (body: Uint8Array | string, ok = true) => ({ ok, status: ok ? 200 : 404, arrayBuffer: async () => (typeof body === 'string' ? strToU8(body) : body).buffer, text: async () => String(body) });
    const good = (async (url: string) => (url.endsWith('.sha256') ? fake(`${sum}  open-design-chatgpt-plugin-0.4.0.zip\n`) : fake(zip))) as unknown as typeof fetch;
    assert.deepStrictEqual(await downloadPluginZip('0.4.0', good), zip);
    const bad = (async (url: string) => (url.endsWith('.sha256') ? fake('0'.repeat(64)) : fake(zip))) as unknown as typeof fetch;
    await assert.rejects(downloadPluginZip('0.4.0', bad), /checksum doesn't match/);
    assert.strictEqual(pluginZipUrl('0.4.0'), 'https://github.com/feimacode/open-design-agent-kit/releases/download/v0.4.0/open-design-chatgpt-plugin-0.4.0.zip');
  });
});
