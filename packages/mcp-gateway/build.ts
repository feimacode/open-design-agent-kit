// Bundles the gateway for local runs: out/index.js plus the preview bundles,
// with the content package left external (resolved from node_modules). The
// container image uses deploy/stage-server.ts instead, which also copies the
// content in.
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import { buildPreviewBundles } from '../core/build/previewBundles';
import { CONTENT_PACKAGE, serverBuildOptions } from '../mcp-server/serverBuild';

async function main(): Promise<void> {
  await esbuild.build(serverBuildOptions({ outfile: path.join(__dirname, 'out', 'index.js'), external: [CONTENT_PACKAGE], entryPoint: path.join(__dirname, 'src', 'main.ts') }));
  await buildPreviewBundles(path.join(__dirname, 'out'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
