#!/usr/bin/env node
// Copies the plugin in packages/claude-plugin into this one (openspec
// deploy-hosted-gateway). packages/claude-plugin is the plugin submitted to the
// Claude plugin directory, which only accepts local MCP servers from Verified
// organizations, so it connects to the hosted gateway over HTTP and has no
// package.json, lockfile or launcher. This package is the plugin the repo's
// marketplace installs: the same manifest, icon, agent and skills, with its own
// .mcp.json, package.json, lockfile and launcher running the server locally.
//
//   node ./scripts/build-local-plugin.mjs           copy them
//   node ./scripts/build-local-plugin.mjs --check   fail if the copies are stale
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localRoot = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(localRoot, '..', 'claude-plugin');

// Owned by the copy: everything under these is replaced from packages/claude-plugin.
const COPIED = ['.claude-plugin', 'agents', 'skills'];

async function walk(dir, base = dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, base)));
    else files.push(path.relative(base, full));
  }
  return files;
}

async function filesUnder(root) {
  const files = new Map();
  for (const item of COPIED) {
    for (const rel of await walk(path.join(root, item))) files.set(path.join(item, rel), path.join(root, item, rel));
  }
  return files;
}

async function main() {
  const check = process.argv.includes('--check');
  const expected = await filesUnder(sourceRoot);
  const existing = await filesUnder(localRoot);
  const problems = [];

  for (const [rel, src] of expected) {
    const content = await fs.readFile(src);
    const actual = await fs.readFile(path.join(localRoot, rel)).catch(() => null);
    if (actual && actual.equals(content)) continue;
    if (check) problems.push(`${actual ? 'stale' : 'missing'} ${rel}`);
    else {
      await fs.mkdir(path.dirname(path.join(localRoot, rel)), { recursive: true });
      await fs.writeFile(path.join(localRoot, rel), content);
    }
  }
  for (const rel of existing.keys()) {
    if (expected.has(rel)) continue;
    if (check) problems.push(`unexpected ${rel}`);
    else await fs.rm(path.join(localRoot, rel));
  }

  if (problems.length) {
    console.error(`packages/claude-plugin-local is out of date with packages/claude-plugin (run npm run build-local-plugin):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`${check ? '✓ packages/claude-plugin-local matches' : 'Copied'} packages/claude-plugin (${expected.size} files).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
