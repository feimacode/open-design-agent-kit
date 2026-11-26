#!/usr/bin/env node
// Starts the plugin's MCP server. Claude Code installs the plugin's locked
// dependencies at install time, so the server is normally already in
// node_modules and runs from there. Claude Desktop installs none, so this
// falls back to `npx` with the same pinned version (downloaded once, then
// cached). No dependencies of its own: it has to run before any are installed.
//
// If the server can't start (no npx, no network to the npm registry, an old
// Node), the launcher answers the MCP handshake itself with one tool that
// explains what went wrong, so the chat can tell the user instead of showing a
// connector that failed to connect and no tools.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_PACKAGE = '@feimacode/open-design-agent-kit-mcp';
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installed = path.join(pluginRoot, 'node_modules', ...MCP_PACKAGE.split('/'), 'out', 'index.js');
const isWindows = process.platform === 'win32';

/** npm's own npx script beside this Node, so npx works when it isn't on PATH (GUI apps often get a short PATH). */
export function npxBesideNode(execPath = process.execPath, platform = process.platform, exists = existsSync) {
  const dir = path.dirname(execPath);
  const candidates = platform === 'win32'
    ? [path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')]
    : [path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'), path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')];
  return candidates.find((p) => exists(p));
}

function command() {
  if (existsSync(installed)) return { cmd: process.execPath, args: [installed], how: 'installed' };
  const pin = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).dependencies[MCP_PACKAGE];
  const spec = `${MCP_PACKAGE}@${pin}`;
  const npxCli = npxBesideNode();
  if (npxCli) return { cmd: process.execPath, args: [npxCli, '-y', '--prefer-offline', spec], how: 'npx', spec };
  return { cmd: isWindows ? 'npx.cmd' : 'npx', args: ['-y', '--prefer-offline', spec], how: 'npx', spec };
}

/** Plain-language reasons and fixes for a server that didn't start, from the launcher's own checks and the server's last output. */
export function diagnose({ nodeVersion = process.versions.node, how, spec, spawnError, exitCode, stderrTail = '' }) {
  const reasons = [];
  const major = Number(nodeVersion.split('.')[0]);
  if (major < 18) reasons.push(`This computer's Node.js is ${nodeVersion}; Open Design needs Node.js 18 or later.`);
  if (spawnError?.code === 'ENOENT') reasons.push('npx (part of Node.js) was not found, so the Open Design server could not be downloaded.');
  else if (spawnError) reasons.push(`The server could not be started (${spawnError.message}).`);
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|proxy|registry\.npmjs\.org|E403|403 Forbidden/i.test(stderrTail)) {
    reasons.push('The npm registry (registry.npmjs.org) could not be reached to download the server. This happens in a sandbox or on a network without that access.');
  }
  if (!reasons.length) reasons.push(`The server stopped before it was ready${exitCode !== undefined && exitCode !== null ? ` (exit code ${exitCode})` : ''}.`);
  const fixes = [
    'Install Node.js 18 or later from https://nodejs.org, then quit and reopen Claude.',
    how === 'npx' ? `Or run \`npx -y ${spec}\` once in a terminal with internet access, so the server is cached, then reopen Claude.` : undefined,
    'Or install "Open Design Hosted" from the same marketplace instead (and uninstall this one): it needs no Node.js and nothing on this computer.',
  ].filter(Boolean);
  return { reasons, fixes };
}

export function setupHelpText(d, stderrTail) {
  return [
    'Open Design could not start its server on this computer, so its design tools are not available in this chat.',
    '',
    'Why:',
    ...d.reasons.map((r) => `- ${r}`),
    '',
    'What the user can do:',
    ...d.fixes.map((f) => `- ${f}`),
    ...(stderrTail.trim() ? ['', 'Last lines the server printed:', stderrTail.trim()] : []),
  ].join('\n');
}

const HELP_TOOL = 'open_design_setup_help';

/** A minimal stdio MCP server that explains why the real one didn't start. Replays requests the client already sent. */
function serveSetupHelp(text, pending) {
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const tool = {
    name: HELP_TOOL,
    description: `Open Design's server could not start on this computer. Call this to learn why and what the user can do, and tell the user. ${text.split('\n').slice(2, 4).join(' ')}`,
    inputSchema: { type: 'object', properties: {} },
  };
  const handle = (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id === undefined || msg.id === null || !msg.method) return;
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'open-design', version: 'setup-help' },
        instructions: text,
      } });
    } else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: [tool] } });
    else if (msg.method === 'tools/call') send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }], isError: msg.params?.name !== HELP_TOOL } });
    else if (msg.method === 'ping') send({ jsonrpc: '2.0', id: msg.id, result: {} });
    else if (msg.method === 'prompts/list') send({ jsonrpc: '2.0', id: msg.id, result: { prompts: [] } });
    else if (msg.method === 'resources/list') send({ jsonrpc: '2.0', id: msg.id, result: { resources: [] } });
    else send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Open Design could not start; only open_design_setup_help is available.' } });
  };
  for (const line of pending) handle(line);
  return handle;
}

function main() {
  const { cmd, args, how, spec } = command();
  // OPEN_DESIGN_LAUNCHER tells the server it runs for the plugin, so in Claude
  // Desktop it can hand its tools to the Open Design desktop extension when that
  // is running too (openspec add-desktop-extension-bundle).
  // npx starts the server through its bin script (#!/usr/bin/env node), so this Node's folder goes first on PATH.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const env = { ...process.env, [pathKey]: [path.dirname(process.execPath), process.env[pathKey]].filter(Boolean).join(path.delimiter), OPEN_DESIGN_LAUNCHER: 'claude-plugin' };
  console.error(`[open-design launcher] node ${process.versions.node} (${process.execPath}); starting ${how === 'installed' ? 'the installed server' : `${spec} with ${args[0] === '-y' ? cmd : 'npx beside node'}`}`);
  // Windows can only start npx.cmd through a shell. Node itself starts without
  // one: cmd.exe would split an unquoted C:\Program Files\nodejs\node.exe (#66).
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: isWindows && cmd.endsWith('.cmd'), env });

  // Until the server writes its first byte, keep what the client sent, so the help server can answer it.
  let started = false;
  let helping;
  let failed = false;
  const pending = [];
  let inBuf = '';
  let stderrTail = '';

  const feedHelp = (chunk) => {
    inBuf += chunk;
    let i;
    while ((i = inBuf.indexOf('\n')) >= 0) { helping(inBuf.slice(0, i)); inBuf = inBuf.slice(i + 1); }
  };
  process.stdin.on('data', (chunk) => {
    if (helping) return feedHelp(chunk);
    if (!started) {
      inBuf += chunk;
      let i;
      while ((i = inBuf.indexOf('\n')) >= 0) { pending.push(inBuf.slice(0, i)); inBuf = inBuf.slice(i + 1); }
    }
    if (child.stdin.writable) child.stdin.write(chunk);
  });
  process.stdin.on('end', () => {
    if (helping) process.exit(0);
    child.stdin.end();
  });
  child.stdin.on('error', () => undefined);

  child.stdout.on('data', (chunk) => {
    if (!started) { started = true; pending.length = 0; inBuf = ''; }
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    stderrTail = (stderrTail + chunk).split('\n').slice(-15).join('\n');
  });

  const fail = (spawnError, exitCode) => {
    if (failed) return;
    failed = true;
    const d = diagnose({ how, spec, spawnError, exitCode, stderrTail });
    const text = setupHelpText(d, stderrTail);
    console.error(`[open-design launcher] the server did not start. ${d.reasons.join(' ')}`);
    helping = serveSetupHelp(text, pending.splice(0));
    feedHelp('');
  };

  child.on('error', (err) => {
    if (started) {
      console.error(`open-design: the MCP server failed (${err.message}).`);
      process.exit(1);
    }
    fail(err);
  });
  child.on('exit', (code, signal) => {
    // Gone before its first reply: npx failed, or the server crashed on start.
    if (!started && !signal) return fail(undefined, code);
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (helping || child.exitCode !== null) process.exit(0);
      child.kill(signal);
    });
  }
}

// Tests import the helpers above without starting a server.
if (!process.env.OPEN_DESIGN_LAUNCHER_NO_MAIN) main();
