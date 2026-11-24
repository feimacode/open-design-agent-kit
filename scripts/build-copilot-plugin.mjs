#!/usr/bin/env node
// Builds packages/copilot-plugin, the Open Design plugin for GitHub Copilot
// (Copilot CLI and the Copilot app), listed in the awesome-copilot
// marketplace. It is the same plugin as packages/claude-plugin-local, in the
// Agent Plugins v1.0.0 layout Copilot expects: a root plugin.json, a root
// mcp.json that starts the local server, and the same skills and agent with
// the Claude-only passages (`<!-- claude-only -->` blocks: Claude artifacts and
// sync) left out.
//
// Owned by this script: skills/, agents/, plugin.json and the server pin in
// scripts/open-design-mcp.mjs. Hand-written: mcp.json, README.md and the rest
// of the launcher.
//
//   node scripts/build-copilot-plugin.mjs           write them
//   node scripts/build-copilot-plugin.mjs --check   fail if they are stale
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'packages', 'claude-plugin');
const localRoot = path.join(repoRoot, 'packages', 'claude-plugin-local');
const pluginRoot = path.join(repoRoot, 'packages', 'copilot-plugin');
const launcherPath = path.join(pluginRoot, 'scripts', 'open-design-mcp.mjs');
const MCP_PACKAGE = '@feimacode/open-design-agent-kit-mcp';
const COPIED = ['agents', 'skills'];
const CLAUDE_ONLY_RE = /\n?<!-- claude-only -->[\s\S]*?<!-- \/claude-only -->\n?/g;
const REPO_URL = 'https://github.com/feimacode/open-design-agent-kit';

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

async function walk(dir, base = dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, base)));
    else files.push(path.relative(base, full));
  }
  return files;
}

/** A copied file as Copilot sees it: Claude-only blocks dropped from Markdown. */
function forCopilot(rel, content) {
  if (!rel.endsWith('.md')) return content;
  const text = content.toString('utf8');
  if (!text.includes('<!-- claude-only -->')) return content;
  return Buffer.from(text.replace(CLAUDE_ONLY_RE, '\n').replace(/\n{3,}/g, '\n\n'));
}

async function expectedFiles() {
  const files = new Map();
  for (const item of COPIED) {
    for (const rel of await walk(path.join(sourceRoot, item))) {
      const file = path.join(item, rel);
      files.set(file, forCopilot(file, await fs.readFile(path.join(sourceRoot, file))));
    }
  }

  const claude = await readJson(path.join(sourceRoot, '.claude-plugin', 'plugin.json'));
  const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: claude.name,
    version: claude.version,
    description: claude.description,
    author: { name: claude.author.name, url: 'https://github.com/feimacode' },
    homepage: `${REPO_URL}/tree/main/packages/copilot-plugin`,
    repository: REPO_URL,
    license: claude.license,
    keywords: [...claude.keywords, 'copilot', 'mcp'],
  };
  files.set('plugin.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));

  const pin = (await readJson(path.join(localRoot, 'package.json'))).dependencies[MCP_PACKAGE];
  const launcher = await fs.readFile(launcherPath, 'utf8');
  if (!/^const MCP_VERSION = '[^']*';$/m.test(launcher)) throw new Error(`${launcherPath} has no MCP_VERSION line`);
  files.set(path.join('scripts', 'open-design-mcp.mjs'), Buffer.from(launcher.replace(/^const MCP_VERSION = '[^']*';$/m, `const MCP_VERSION = '${pin}';`)));
  return files;
}

async function main() {
  const check = process.argv.includes('--check');
  const expected = await expectedFiles();
  const problems = [];

  for (const [rel, content] of expected) {
    const actual = await fs.readFile(path.join(pluginRoot, rel)).catch(() => null);
    if (actual && actual.equals(content)) continue;
    if (check) problems.push(`${actual ? 'stale' : 'missing'} ${rel}`);
    else {
      await fs.mkdir(path.dirname(path.join(pluginRoot, rel)), { recursive: true });
      await fs.writeFile(path.join(pluginRoot, rel), content);
    }
  }
  for (const item of COPIED) {
    for (const rel of (await walk(path.join(pluginRoot, item))).map((r) => path.join(item, r))) {
      if (expected.has(rel)) continue;
      if (check) problems.push(`unexpected ${rel}`);
      else await fs.rm(path.join(pluginRoot, rel));
    }
  }

  if (problems.length) {
    console.error(`packages/copilot-plugin is out of date (run node scripts/build-copilot-plugin.mjs):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`${check ? '✓ packages/copilot-plugin is up to date' : 'Built packages/copilot-plugin'} (${expected.size} files).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
