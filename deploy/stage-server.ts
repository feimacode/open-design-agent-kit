// Stages the hosted server for the container image (openspec add-remote-mcp-server):
// <out>/server/out/index.js and <out>/server/node_modules/<content>, the same
// self-contained server the desktop bundles ship.
//
//   npx tsx deploy/stage-server.ts --content <content.tgz> --out <dir>
import * as path from 'node:path';
import { serverVersion, stageBundledServer } from '../packages/desktop-extension/scripts/stageServer';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const value = (flag: string): string => {
    const i = argv.indexOf(flag);
    if (i === -1 || !argv[i + 1]) throw new Error(`${flag} <path> is required`);
    return path.resolve(argv[i + 1]);
  };
  const out = value('--out');
  await stageBundledServer(out, value('--content'), await serverVersion());
  console.log(`Staged the hosted server in ${path.join(out, 'server')}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
