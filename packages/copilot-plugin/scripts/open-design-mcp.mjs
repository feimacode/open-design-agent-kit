#!/usr/bin/env node
// Starts the Open Design MCP server for GitHub Copilot. Copilot installs no
// plugin dependencies, so this runs the pinned server with `npx` (downloaded
// once, then cached). The server runs on this computer and saves designs in
// the workspace folder. No dependencies of its own.
import { spawn } from 'node:child_process';

// Pinned by scripts/build-copilot-plugin.mjs from packages/claude-plugin-local/package.json.
const MCP_VERSION = '0.4.0';
const MCP_PACKAGE = '@feimacode/open-design-agent-kit-mcp';

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['-y', `${MCP_PACKAGE}@${MCP_VERSION}`];
// Windows can only start npx.cmd through a shell.
const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('error', (err) => {
  console.error(`open-design: could not start the MCP server with ${cmd} (${err.message}). Node.js 18 or later must be on PATH.`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
