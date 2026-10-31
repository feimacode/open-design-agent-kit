#!/usr/bin/env node
// Builds the MCP Apps host probe as a ChatGPT desktop plugin folder
// (openspec chatgpt-mcp-apps-compat, task 1.2), and with --install puts it in
// ~/.codex/plugins/od-mcp-apps-probe and lists it in
// ~/.agents/plugins/marketplace.json (other entries kept). --uninstall undoes it.
//
//   node scripts/probe-mcp-apps-host/build.mjs [--install | --uninstall]
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'od-mcp-apps-probe';
const outDir = path.join(here, 'dist', NAME);
const home = os.homedir();
const marketplace = path.join(home, '.agents', 'plugins', 'marketplace.json');
const installDir = path.join(home, '.codex', 'plugins', NAME);

async function readMarket() {
  try {
    return JSON.parse(await fs.readFile(marketplace, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
    throw new Error(`${marketplace} isn't valid JSON; fix it or add the entry by hand`);
  }
}

async function build() {
  const view = await esbuild.build({ entryPoints: [path.join(here, 'view.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true });
  const viewHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Open Design probe</title><style>body{font:13px/1.5 system-ui,sans-serif;margin:12px}pre{white-space:pre-wrap}</style></head><body><strong>Open Design MCP Apps probe</strong><pre id="out"></pre><script>${view.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(here, 'server.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node18', outfile: path.join(outDir, 'server.js'), define: { VIEW_HTML: JSON.stringify(viewHtml) } });
  await fs.writeFile(
    path.join(outDir, 'plugin.json'),
    `${JSON.stringify({ name: NAME, version: '0.1.0', description: 'Records how this app handles MCP Apps views (Open Design test tool).', extensions: { 'com.openai': { interface: { displayName: 'Open Design probe', shortDescription: 'MCP Apps host probe', developerName: 'feimacode', category: 'Developer tools' } } } }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, 'mcp.json'),
    `${JSON.stringify({ mcpServers: { [NAME]: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server.js'], env: { OPEN_DESIGN_LAUNCHER: 'chatgpt-plugin' } } } }, null, 2)}\n`,
  );
  console.log(`Built ${outDir}`);
}

async function install() {
  await fs.rm(installDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(installDir), { recursive: true });
  await fs.cp(outDir, installDir, { recursive: true });
  const market = await readMarket();
  market.plugins = (market.plugins ?? []).filter((p) => p?.name !== NAME);
  market.plugins.push({ name: NAME, source: { source: 'local', path: `./.codex/plugins/${NAME}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer tools' });
  await fs.mkdir(path.dirname(marketplace), { recursive: true });
  await fs.writeFile(marketplace, `${JSON.stringify(market, null, 2)}\n`);
  console.log(`Installed to ${installDir} and listed in ${marketplace}.\nRestart ChatGPT, turn on "Open Design probe" under Plugins → Personal, then in a Work thread ask: "run the Open Design probe".\nThe log is written to ${path.join(installDir, 'probe-log.jsonl')}.`);
}

async function uninstall() {
  await fs.rm(installDir, { recursive: true, force: true });
  const market = await readMarket();
  market.plugins = (market.plugins ?? []).filter((p) => p?.name !== NAME);
  await fs.writeFile(marketplace, `${JSON.stringify(market, null, 2)}\n`);
  console.log(`Removed ${installDir} and its entry in ${marketplace}.`);
}

const flag = process.argv[2];
if (flag === '--uninstall') await uninstall();
else {
  await build();
  if (flag === '--install') await install();
}
