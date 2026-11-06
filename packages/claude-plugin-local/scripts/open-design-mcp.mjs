#!/usr/bin/env node
// Starts the plugin's MCP server. Claude Code installs the plugin's locked
// dependencies at install time, so the server is normally already in
// node_modules and runs from there. Claude Desktop installs none, so this
// falls back to `npx` with the same pinned version (downloaded once, then
// cached). No dependencies of its own: it has to run before any are installed.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_PACKAGE = '@feimacode/open-design-agent-kit-mcp';
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installed = path.join(pluginRoot, 'node_modules', ...MCP_PACKAGE.split('/'), 'out', 'index.js');

function command() {
  if (existsSync(installed)) return { cmd: process.execPath, args: [installed] };
  const pin = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).dependencies[MCP_PACKAGE];
  return { cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', `${MCP_PACKAGE}@${pin}`] };
}

const { cmd, args } = command();
// OPEN_DESIGN_LAUNCHER tells the server it runs for the plugin, so in Claude
// Desktop it can hand its tools to the Open Design desktop extension when that
// is running too (openspec add-desktop-extension-bundle).
const env = { ...process.env, OPEN_DESIGN_LAUNCHER: 'claude-plugin' };
// Windows can only start npx.cmd through a shell. Node itself starts without
// one: cmd.exe would split an unquoted C:\Program Files\nodejs\node.exe (#66).
const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' && cmd.endsWith('.cmd'), env });
child.on('error', (err) => {
  console.error(`open-design: could not start the MCP server with ${cmd} (${err.message}). Node.js 18 or later must be on PATH.`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
