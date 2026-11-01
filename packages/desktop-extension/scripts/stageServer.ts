// Stages the self-contained MCP server that both desktop bundles ship
// (openspec add-desktop-extension-bundle, add-chatgpt-desktop-plugin):
// <dest>/server/out/index.js, the server bundled with the same esbuild options
// as the npm package except that @modelcontextprotocol/sdk is inlined, plus the
// browser preview bundles, and <dest>/server/node_modules/<content package>,
// extracted from the content tarball built in the same release run. Nothing is
// fetched from the network.
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import { buildPreviewBundles } from '../../core/build/previewBundles';
import { CONTENT_PACKAGE, serverBuildOptions } from '../../mcp-server/serverBuild';

export const repoRoot = path.resolve(__dirname, '..', '..', '..');

export async function serverVersion(): Promise<string> {
  return JSON.parse(await fs.readFile(path.join(repoRoot, 'packages', 'mcp-server', 'package.json'), 'utf8')).version;
}

/**
 * Writes <dest>/server/ (bundled server + content). `contentTgz` must be the content package at `version`.
 * `entryPoint` swaps the stdio server for another entry, such as the hosted gateway (packages/mcp-gateway/src/main.ts).
 */
export async function stageBundledServer(dest: string, contentTgz: string, version: string, entryPoint?: string): Promise<void> {
  const serverOut = path.join(dest, 'server', 'out');
  await esbuild.build(serverBuildOptions({ outfile: path.join(serverOut, 'index.js'), external: [CONTENT_PACKAGE], entryPoint }));
  await buildPreviewBundles(serverOut);

  const unpacked = path.join(dest, '.content');
  await fs.mkdir(unpacked);
  execFileSync('tar', ['-xzf', contentTgz, '-C', unpacked], { stdio: 'inherit' });
  const contentPackage = JSON.parse(await fs.readFile(path.join(unpacked, 'package', 'package.json'), 'utf8'));
  if (contentPackage.name !== CONTENT_PACKAGE) throw new Error(`${contentTgz} is ${contentPackage.name}, not ${CONTENT_PACKAGE}`);
  if (contentPackage.version !== version) throw new Error(`${contentTgz} is version ${contentPackage.version}; the server is ${version}`);
  const contentDest = path.join(dest, 'server', 'node_modules', ...CONTENT_PACKAGE.split('/'));
  await fs.mkdir(path.dirname(contentDest), { recursive: true });
  await fs.rename(path.join(unpacked, 'package'), contentDest);
  await fs.rm(unpacked, { recursive: true });
}
