#!/usr/bin/env node
// Smoke test for the ChatGPT desktop plugin (openspec add-chatgpt-desktop-plugin):
// unzips it into a temp folder outside this checkout, checks plugin.json, that
// skills/ equals the repo's .agents/skills/, then starts the server the way
// mcp.json says (${PLUGIN_ROOT} replaced, cwd = the plugin folder, as ChatGPT
// does), completes an MCP initialize + tools/list handshake, and checks the
// managed-folder tools are offered (no folder of its own). Proves the plugin
// runs with no repo node_modules, no npx and no network.
//
// Usage: node scripts/test-chatgpt-plugin.mjs <file.zip> [--version <x.y.z>]
import { execFileSync, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 40 * 1024 * 1024;
const REQUIRED_TOOLS = ['list_open_design_skills', 'prepare_open_design_brief', 'register_open_design_artifact', 'use_open_design_managed_workspace', 'write_open_design_file'];

const log = (msg) => console.log(`[test-chatgpt-plugin] ${msg}`);
function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function startServer(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'inherit'] });
  const results = [];
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        results.push(JSON.parse(line));
      } catch {
        // Non-JSON stdout noise.
      }
    }
  });
  let nextId = 1;
  const notify = (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  const request = async (method, params, timeoutMs = 20000) => {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = results.find((r) => r.id === id);
      if (found) return found;
      if (child.exitCode !== null) throw new Error(`the server exited with code ${child.exitCode}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no response to ${method} within ${timeoutMs}ms`);
  };
  return { child, request, notify };
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv[0] && path.resolve(argv[0]);
  assert(file, 'usage: node scripts/test-chatgpt-plugin.mjs <file.zip> [--version <x.y.z>]');
  const versionFlag = argv.indexOf('--version');
  const expectedVersion =
    versionFlag !== -1 ? argv[versionFlag + 1] : JSON.parse(await fs.readFile(path.join(repoRoot, 'packages', 'mcp-server', 'package.json'), 'utf8')).version;

  const { size } = await fs.stat(file);
  assert(size <= MAX_BYTES, `${path.basename(file)} is ${(size / 1024 / 1024).toFixed(1)} MB, over ${MAX_BYTES / 1024 / 1024} MB`);
  log(`size ${(size / 1024 / 1024).toFixed(1)} MB`);

  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'od-chatgpt-plugin-test-'));
  let server;
  try {
    const pluginRoot = path.join(scratch, 'plugin');
    execFileSync('unzip', ['-q', file, '-d', pluginRoot], { stdio: 'inherit' });
    const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, 'plugin.json'), 'utf8'));
    assert(manifest.name === 'open-design', `plugin.json name is ${manifest.name}`);
    assert(manifest.version === expectedVersion, `plugin.json version is ${manifest.version}, not ${expectedVersion}`);
    const onboarding = manifest.extensions?.['com.openai']?.onboardingSkill;
    assert(onboarding && (await fs.stat(path.join(pluginRoot, onboarding)).catch(() => null)), `onboardingSkill ${onboarding} is missing`);
    for (const icon of [manifest.extensions['com.openai'].interface?.composerIcon, manifest.extensions['com.openai'].interface?.logo]) {
      if (icon) assert(await fs.stat(path.join(pluginRoot, icon)).catch(() => null), `icon ${icon} is missing`);
    }
    log(`plugin.json ${manifest.name}@${manifest.version} OK`);

    const ours = await listFiles(path.join(repoRoot, '.agents', 'skills'));
    const theirs = await listFiles(path.join(pluginRoot, 'skills'));
    assert(JSON.stringify(ours) === JSON.stringify(theirs), 'skills/ lists different files from .agents/skills/');
    for (const rel of ours) {
      const [a, b] = await Promise.all([fs.readFile(path.join(repoRoot, '.agents', 'skills', rel)), fs.readFile(path.join(pluginRoot, 'skills', rel))]);
      assert(a.equals(b), `skills/${rel} differs from .agents/skills/${rel}`);
    }
    log(`skills/ matches .agents/skills/ (${ours.length} files)`);

    const mcp = JSON.parse(await fs.readFile(path.join(pluginRoot, 'mcp.json'), 'utf8'));
    const entry = mcp.mcpServers?.['open-design'];
    assert(entry?.type === 'stdio' && entry.command === 'node', 'mcp.json open-design is not a node stdio server');
    const args = entry.args.map((a) => a.replaceAll('${PLUGIN_ROOT}', pluginRoot));

    const home = path.join(scratch, 'home');
    await fs.mkdir(home, { recursive: true });
    const env = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      OPEN_DESIGN_PREVIEW: 'off',
      ...entry.env,
    };
    server = startServer(process.execPath, args, { cwd: pluginRoot, env });

    const init = await server.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt-desktop-smoke-test', version: '0' } });
    assert(init.result?.serverInfo?.name === 'open-design', `unexpected serverInfo: ${JSON.stringify(init)}`);
    assert(init.result.serverInfo.version === expectedVersion, `serverInfo version is ${init.result.serverInfo.version}`);
    server.notify('notifications/initialized');

    const list = await server.request('tools/list', {});
    const names = (list.result?.tools ?? []).map((t) => t.name);
    const missing = REQUIRED_TOOLS.filter((n) => !names.includes(n));
    assert(missing.length === 0, `tools/list is missing ${missing.join(', ')}`);
    log(`tools/list OK (${names.length} tools, managed-folder tools offered)`);

    const skills = await server.request('tools/call', { name: 'list_open_design_skills', arguments: { query: 'poster' } });
    assert(!skills.result?.isError && /poster/i.test(JSON.stringify(skills.result)), 'list_open_design_skills found no poster entries from the bundled content');
    log('bundled content resolves');
    log('PASS');
  } finally {
    server?.child.kill();
    await fs.rm(scratch, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[test-chatgpt-plugin] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
