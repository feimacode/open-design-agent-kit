#!/usr/bin/env node
// Rewrites packages/mcp-server/package.json's dependency on
// @feimacode/open-design-agent-kit-content from the wildcard "*" (correct
// for local development — npm workspaces always resolves it to the sibling
// package via a symlink regardless of version) to a real, pinned range
// matching the content version actually being released in this run.
//
// Run ONLY inside an ephemeral CI checkout, immediately before
// `npm pack`/`npm publish` for packages/mcp-server — never against a
// checkout whose changes might get committed or pushed. This script
// intentionally has no safeguard against being run against a real working
// tree; the guarantee that the committed file never changes comes from
// *when* this is invoked (a throwaway release-workflow checkout), not from
// anything in this script itself. See openspec/changes/npm-publish-automation/design.md
// Decision 3 for why a wildcard is wrong for a real published dependency,
// and why this happens before packing rather than at publish time.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const CONTENT_PKG_PATH = path.join(repoRoot, 'packages', 'content', 'package.json');
const MCP_SERVER_PKG_PATH = path.join(repoRoot, 'packages', 'mcp-server', 'package.json');
const DEP_NAME = '@feimacode/open-design-agent-kit-content';

async function main() {
  const contentPkg = JSON.parse(await fs.readFile(CONTENT_PKG_PATH, 'utf8'));
  const contentVersion = contentPkg.version;
  if (!contentVersion) throw new Error(`${CONTENT_PKG_PATH} has no version field`);

  const mcpPkg = JSON.parse(await fs.readFile(MCP_SERVER_PKG_PATH, 'utf8'));
  const previous = mcpPkg.dependencies?.[DEP_NAME];
  if (previous === undefined) {
    throw new Error(`${MCP_SERVER_PKG_PATH} has no "${DEP_NAME}" dependency to pin`);
  }

  const pinned = `^${contentVersion}`;
  mcpPkg.dependencies[DEP_NAME] = pinned;
  await fs.writeFile(MCP_SERVER_PKG_PATH, JSON.stringify(mcpPkg, null, 2) + '\n', 'utf8');

  if (previous !== '*') {
    console.warn(`Note: "${DEP_NAME}" was already "${previous}" (not the expected "*") before this rewrite.`);
  }
  console.log(`Pinned ${MCP_SERVER_PKG_PATH}'s "${DEP_NAME}" dependency: "${previous}" -> "${pinned}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
