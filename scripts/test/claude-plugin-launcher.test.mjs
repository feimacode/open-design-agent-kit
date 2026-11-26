import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/claude-plugin-local/scripts/open-design-mcp.mjs');
process.env.OPEN_DESIGN_LAUNCHER_NO_MAIN = '1';
const { diagnose, npxBesideNode, setupHelpText } = await import(launcher);
delete process.env.OPEN_DESIGN_LAUNCHER_NO_MAIN;

test('npxBesideNode finds npm\'s npx script next to the Node binary', () => {
  const seen = new Set([path.join('/opt/node/bin', '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')]);
  assert.equal(npxBesideNode('/opt/node/bin/node', 'linux', (p) => seen.has(p)), [...seen][0]);
  const win = path.join('C:\\node', 'node_modules', 'npm', 'bin', 'npx-cli.js');
  assert.equal(npxBesideNode(path.join('C:\\node', 'node.exe'), 'win32', (p) => p === win), win);
  assert.equal(npxBesideNode('/opt/node/bin/node', 'linux', () => false), undefined);
});

test('diagnose names a missing npx, an unreachable registry and an old Node', () => {
  const missing = diagnose({ nodeVersion: '22.1.0', how: 'npx', spec: 'pkg@1.0.0', spawnError: Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' }) });
  assert.match(missing.reasons.join(' '), /npx .* was not found/);
  const offline = diagnose({ nodeVersion: '22.1.0', how: 'npx', spec: 'pkg@1.0.0', exitCode: 1, stderrTail: 'npm error code ENOTFOUND\nnpm error request to https://registry.npmjs.org/pkg failed' });
  assert.match(offline.reasons.join(' '), /registry\.npmjs\.org\) could not be reached/);
  assert.ok(offline.fixes.some((f) => f.includes('npx -y pkg@1.0.0')));
  assert.ok(offline.fixes.some((f) => f.includes('Open Design Hosted')));
  const old = diagnose({ nodeVersion: '16.20.0', how: 'npx', spec: 'pkg@1.0.0', exitCode: 1 });
  assert.match(old.reasons[0], /Node\.js is 16\.20\.0/);
  assert.match(setupHelpText(old, 'boom'), /Last lines the server printed:\nboom/);
});

test('without npx the launcher still answers MCP, with one tool that explains why', { skip: process.platform === 'win32' }, async () => {
  // A lone copy of Node in an empty folder, with nothing on PATH: no npx anywhere.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'od-launcher-'));
  const node = path.join(dir, 'node');
  copyFileSync(process.execPath, node);
  const child = spawn(node, [launcher], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: path.join(dir, 'empty'), HOME: dir } });
  const replies = new Map();
  let buf = '';
  let timer;
  const done = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        replies.set(msg.id, msg);
        if (replies.size === 3) resolve();
      }
    });
    child.on('exit', () => reject(new Error('launcher exited')));
    timer = setTimeout(() => reject(new Error('timed out')), 20000);
  });
  for (const msg of [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'open_design_setup_help', arguments: {} } },
  ]) child.stdin.write(`${JSON.stringify(msg)}\n`);
  try {
    await done;
  } finally {
    clearTimeout(timer);
    child.removeAllListeners('exit');
    child.kill();
  }
  assert.equal(replies.get(1).result.serverInfo.version, 'setup-help');
  assert.deepEqual(replies.get(2).result.tools.map((t) => t.name), ['open_design_setup_help']);
  assert.match(replies.get(3).result.content[0].text, /npx \(part of Node\.js\) was not found/);
});
