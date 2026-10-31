// `install chatgpt` / `uninstall chatgpt` (openspec add-chatgpt-desktop-plugin):
// puts the ChatGPT desktop plugin into the personal plugin folder and lists it
// in the personal marketplace file the ChatGPT desktop app reads. Unlike
// `init`, this writes in the user's home folder, so it's its own command and
// prints every path it touches.
//
// OpenAI's layout: ~/.agents/plugins/marketplace.json lists plugins whose
// `source.path` is relative to the marketplace root (the home folder), starts
// with ./ and stays inside it; ./.codex/plugins/<name> is the personal pattern.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { unzipSync } from 'fflate';

export const PLUGIN_NAME = 'open-design';
export const RELEASE_BASE_URL = 'https://github.com/feimacode/open-design-agent-kit/releases/download';

export interface ChatGptPaths {
  home: string;
  marketplace: string;
  pluginDir: string;
  /** The marketplace entry's source.path: relative to the home folder. */
  sourcePath: string;
}

export function chatGptPaths(home = os.homedir()): ChatGptPaths {
  return {
    home,
    marketplace: path.join(home, '.agents', 'plugins', 'marketplace.json'),
    pluginDir: path.join(home, '.codex', 'plugins', PLUGIN_NAME),
    sourcePath: `./.codex/plugins/${PLUGIN_NAME}`,
  };
}

export function pluginZipName(version: string): string {
  return `open-design-chatgpt-plugin-${version}.zip`;
}

export function pluginZipUrl(version: string): string {
  return `${RELEASE_BASE_URL}/v${version}/${pluginZipName(version)}`;
}

export function marketplaceEntry(paths: ChatGptPaths): Record<string, unknown> {
  return {
    name: PLUGIN_NAME,
    source: { source: 'local', path: paths.sourcePath },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Design',
  };
}

export type MarketplaceOutcome = 'created' | 'updated' | 'unchanged' | 'malformed';

interface Marketplace {
  name?: string;
  interface?: { displayName?: string };
  plugins?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

async function readMarketplace(file: string): Promise<{ exists: boolean; data?: Marketplace }> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
    throw err;
  }
  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { exists: true };
    const plugins = (data as Marketplace).plugins;
    if (plugins !== undefined && !Array.isArray(plugins)) return { exists: true };
    return { exists: true, data: data as Marketplace };
  } catch {
    return { exists: true };
  }
}

/** Adds or replaces the open-design entry, keeping everything else. A malformed file is left alone. */
export async function mergeMarketplace(paths: ChatGptPaths): Promise<MarketplaceOutcome> {
  const { exists, data } = await readMarketplace(paths.marketplace);
  if (exists && !data) return 'malformed';
  const entry = marketplaceEntry(paths);
  const next: Marketplace = data ? { ...data } : { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
  const plugins = [...(next.plugins ?? [])];
  const index = plugins.findIndex((p) => p?.name === PLUGIN_NAME);
  if (index >= 0 && JSON.stringify(plugins[index]) === JSON.stringify(entry)) return 'unchanged';
  if (index >= 0) plugins[index] = entry;
  else plugins.push(entry);
  next.plugins = plugins;
  await fs.mkdir(path.dirname(paths.marketplace), { recursive: true });
  await fs.writeFile(paths.marketplace, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return exists ? 'updated' : 'created';
}

/** Removes only the open-design entry. */
export async function removeFromMarketplace(paths: ChatGptPaths): Promise<'removed' | 'absent' | 'malformed'> {
  const { exists, data } = await readMarketplace(paths.marketplace);
  if (!exists) return 'absent';
  if (!data) return 'malformed';
  const plugins = data.plugins ?? [];
  const kept = plugins.filter((p) => p?.name !== PLUGIN_NAME);
  if (kept.length === plugins.length) return 'absent';
  await fs.writeFile(paths.marketplace, `${JSON.stringify({ ...data, plugins: kept }, null, 2)}\n`, 'utf8');
  return 'removed';
}

/** The plugin version currently unpacked, from its plugin.json. */
export async function installedVersion(paths: ChatGptPaths): Promise<string | undefined> {
  try {
    return (JSON.parse(await fs.readFile(path.join(paths.pluginDir, 'plugin.json'), 'utf8')) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/** Unpacks the zip's files into dest; refuses entries that would land outside it. */
export async function unpackZip(zip: Uint8Array, dest: string): Promise<void> {
  const files = unzipSync(zip);
  const root = path.resolve(dest);
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`The plugin zip has an entry outside its folder: ${name}`);
    if (name.endsWith('/')) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

export interface InstallResult {
  version: string;
  previousVersion?: string;
  outcome: 'installed' | 'upgraded' | 'reinstalled' | 'unchanged';
  marketplace: MarketplaceOutcome;
  paths: ChatGptPaths;
}

/**
 * Replaces the plugin folder with the zip's contents (unpacked beside it, then
 * swapped in, so a failed unpack never leaves half a plugin) and lists it in
 * the marketplace file.
 */
export async function installChatGptPlugin(zip: Uint8Array, paths: ChatGptPaths): Promise<InstallResult> {
  const staging = `${paths.pluginDir}.new-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  let version: string;
  try {
    await unpackZip(zip, staging);
    const manifest = JSON.parse(await fs.readFile(path.join(staging, 'plugin.json'), 'utf8')) as { name?: string; version?: string };
    if (manifest.name !== PLUGIN_NAME || !manifest.version) throw new Error('This zip is not the Open Design ChatGPT plugin (plugin.json name is not open-design).');
    version = manifest.version;
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true });
    throw err;
  }

  const previousVersion = await installedVersion(paths);
  const same = previousVersion === version && (await sameTree(staging, paths.pluginDir));
  if (same) {
    await fs.rm(staging, { recursive: true, force: true });
  } else {
    const old = `${paths.pluginDir}.old-${process.pid}`;
    await fs.rm(old, { recursive: true, force: true });
    const hadOld = await exists(paths.pluginDir);
    if (hadOld) await fs.rename(paths.pluginDir, old);
    await fs.rename(staging, paths.pluginDir);
    if (hadOld) await fs.rm(old, { recursive: true, force: true });
  }
  const marketplace = await mergeMarketplace(paths);
  const outcome = same ? 'unchanged' : previousVersion === undefined ? 'installed' : previousVersion === version ? 'reinstalled' : 'upgraded';
  return { version, previousVersion, outcome, marketplace, paths };
}

export async function uninstallChatGptPlugin(paths: ChatGptPaths): Promise<{ folder: 'removed' | 'absent'; marketplace: 'removed' | 'absent' | 'malformed' }> {
  const folder = (await exists(paths.pluginDir)) ? 'removed' : 'absent';
  await fs.rm(paths.pluginDir, { recursive: true, force: true });
  return { folder, marketplace: await removeFromMarketplace(paths) };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function treeHash(dir: string): Promise<string | undefined> {
  if (!(await exists(dir))) return undefined;
  const hash = createHash('sha256');
  const walk = async (d: string): Promise<void> => {
    for (const entry of (await fs.readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      hash.update(path.relative(dir, full));
      if (entry.isDirectory()) await walk(full);
      else hash.update(await fs.readFile(full));
    }
  };
  await walk(dir);
  return hash.digest('hex');
}

async function sameTree(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([treeHash(a), treeHash(b)]);
  return ha !== undefined && ha === hb;
}

/** Downloads the release zip for `version` and checks it against the release's .sha256 file. */
export async function downloadPluginZip(version: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const url = pluginZipUrl(version);
  const [zipRes, sumRes] = await Promise.all([fetchImpl(url), fetchImpl(`${url}.sha256`)]);
  if (!zipRes.ok) throw new Error(`Could not download ${url} (HTTP ${zipRes.status}). Download it yourself and run: install chatgpt --from <file.zip>`);
  const zip = new Uint8Array(await zipRes.arrayBuffer());
  if (!sumRes.ok) throw new Error(`Could not download the checksum ${url}.sha256 (HTTP ${sumRes.status}); not installing an unchecked file.`);
  const expected = (await sumRes.text()).trim().split(/\s+/)[0]?.toLowerCase();
  const actual = createHash('sha256').update(zip).digest('hex');
  if (!expected || expected !== actual) throw new Error(`The downloaded plugin's checksum doesn't match ${url}.sha256; not installing it.`);
  return zip;
}

export function malformedMarketplaceHelp(paths: ChatGptPaths): string {
  return `${paths.marketplace} isn't valid JSON, so it was left unchanged. Add this entry to its "plugins" list yourself:\n\n${JSON.stringify(marketplaceEntry(paths), null, 2)}`;
}
