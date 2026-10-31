#!/usr/bin/env node
// Lint for the ChatGPT plugin templates (openspec add-chatgpt-desktop-plugin):
// both parse, the manifest keeps the fields OpenAI's portable format and our
// release rely on, the stdio entry starts the bundled server with the ChatGPT
// launcher value, and every path the manifest names exists or is built.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..', '..');
const problems = [];
const read = (name) => {
  try {
    return JSON.parse(readFileSync(path.join(root, name), 'utf8'));
  } catch (err) {
    problems.push(`${name}: ${err.message}`);
    return {};
  }
};

const plugin = read('plugin.template.json');
if (plugin.name !== 'open-design') problems.push('plugin.template.json: name must be open-design');
if (plugin.version !== '${VERSION}') problems.push('plugin.template.json: version must be the "${VERSION}" placeholder');
for (const field of ['description', 'author', 'homepage', 'license']) if (!plugin[field]) problems.push(`plugin.template.json: missing ${field}`);
const openai = plugin.extensions?.['com.openai'];
if (!openai?.interface?.displayName) problems.push('plugin.template.json: missing extensions.com.openai.interface.displayName');
if (openai?.onboardingSkill !== './skills/open-design/SKILL.md') problems.push('plugin.template.json: onboardingSkill must be ./skills/open-design/SKILL.md');
if (!existsSync(path.join(repoRoot, '.agents', 'skills', 'open-design', 'SKILL.md'))) problems.push('.agents/skills/open-design/SKILL.md is missing (run npm run sync-content)');

const mcp = read('mcp.template.json');
const server = mcp.mcpServers?.['open-design'];
if (!server) problems.push('mcp.template.json: no open-design server');
else {
  if (server.type !== 'stdio' || server.command !== 'node') problems.push('mcp.template.json: open-design must be a stdio server run with node');
  if (server.args?.[0] !== '${PLUGIN_ROOT}/server/out/index.js') problems.push('mcp.template.json: args must start the bundled server at ${PLUGIN_ROOT}/server/out/index.js');
  if (server.env?.OPEN_DESIGN_LAUNCHER !== 'chatgpt-plugin') problems.push('mcp.template.json: env.OPEN_DESIGN_LAUNCHER must be chatgpt-plugin');
}

if (problems.length) {
  for (const p of problems) console.error(`check-plugin-template: ${p}`);
  process.exit(1);
}
console.log('ChatGPT plugin templates OK.');
