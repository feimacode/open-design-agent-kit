// Stages the hosted gateway for the container image (openspec add-mcp-gateway,
// deploy-hosted-gateway): <out>/server/out/index.js (packages/mcp-gateway,
// bundled with the kit's tools and the MCP SDK) and
// <out>/server/node_modules/<content>, the same content the desktop bundles ship.
//
//   npx tsx deploy/stage-server.ts --content <content.tgz> --out <dir>
import * as path from 'node:path';
import { repoRoot, serverVersion, stageBundledServer } from '../packages/desktop-extension/scripts/stageServer';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const value = (flag: string): string => {
    const i = argv.indexOf(flag);
    if (i === -1 || !argv[i + 1]) throw new Error(`${flag} <path> is required`);
    return path.resolve(argv[i + 1]);
  };
  const out = value('--out');
  await stageBundledServer(out, value('--content'), await serverVersion(), path.join(repoRoot, 'packages', 'mcp-gateway', 'src', 'main.ts'));
  console.log(`Staged the hosted gateway in ${path.join(out, 'server')}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
