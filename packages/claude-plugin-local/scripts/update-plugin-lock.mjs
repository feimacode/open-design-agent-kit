#!/usr/bin/env node
// Claude Code installs a plugin's own dependencies at install time
// (`npm ci --ignore-scripts --workspaces=false` in the plugin root), and the
// Claude plugin directory requires that lockfile for its Verified badge. The
// MCP server is therefore pinned in package.json + package-lock.json here and
// launched from node_modules by .mcp.json's scripts/open-design-mcp.mjs. Claude
// Desktop installs no plugin dependencies, so that launcher falls back to npx
// with the same pin there.
//
// Inside this monorepo npm only maintains the root workspace lockfile, so
// this script resolves a standalone package-lock.json in a temp copy of the
// plugin's package.json and copies it back.
//
//   node scripts/update-plugin-lock.mjs          regenerate package-lock.json
//   node scripts/update-plugin-lock.mjs --check  fail if pin, lockfile and .mcp.json disagree
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_PACKAGE = '@feimacode/open-design-agent-kit-mcp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(pluginRoot, 'package.json');
const lockPath = path.join(pluginRoot, 'package-lock.json');
const mcpJsonPath = path.join(pluginRoot, '.mcp.json');

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

async function check() {
  const problems = [];
  const pkg = await readJson(packageJsonPath);
  const pin = pkg.dependencies?.[MCP_PACKAGE];
  if (!pin || !/^\d+\.\d+\.\d+$/.test(pin)) {
    problems.push(`package.json must pin ${MCP_PACKAGE} to an exact version (found ${pin ?? 'nothing'})`);
  }

  let lock;
  try {
    lock = await readJson(lockPath);
  } catch {
    problems.push('package-lock.json is missing — run `npm run update-lock`');
  }
  if (lock) {
    const locked = lock.packages?.[`node_modules/${MCP_PACKAGE}`]?.version;
    const lockedPin = lock.packages?.['']?.dependencies?.[MCP_PACKAGE];
    if (locked !== pin || lockedPin !== pin) {
      problems.push(`package-lock.json resolves ${MCP_PACKAGE} to ${locked ?? 'nothing'}, package.json pins ${pin} — run \`npm run update-lock\``);
    }
  }

  const server = (await readJson(mcpJsonPath)).mcpServers?.['open-design'];
  const launcher = '${CLAUDE_PLUGIN_ROOT}/scripts/open-design-mcp.mjs';
  if (server?.command !== 'node' || server?.args?.[0] !== launcher) {
    problems.push(`.mcp.json must start the server through its launcher: node ${launcher}`);
  }
  // Claude Desktop won't start a plugin server whose config refers to a plugin setting.
  if (JSON.stringify(server ?? {}).includes('${user_config.')) {
    problems.push('.mcp.json must not use ${user_config.*}: Claude Desktop refuses to start the server');
  }
  // claude.ai rejects a plugin that ships a top-level bin/ directory when it syncs the marketplace.
  if (await fs.stat(path.join(pluginRoot, 'bin')).then(() => true, () => false)) {
    problems.push('the plugin must not have a top-level bin/ directory: claude.ai refuses to sync it');
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exit(1);
  }
  console.log(`✓ Claude plugin MCP server locked at ${MCP_PACKAGE}@${pin}`);
}

async function update() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'od-claude-plugin-lock-'));
  try {
    await fs.copyFile(packageJsonPath, path.join(tmp, 'package.json'));
    execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: tmp,
      stdio: 'inherit',
    });
    await fs.copyFile(path.join(tmp, 'package-lock.json'), lockPath);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  await check();
}

await (process.argv.includes('--check') ? check() : update());
