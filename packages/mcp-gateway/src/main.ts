#!/usr/bin/env node
// The hosted Open Design gateway (openspec add-mcp-gateway). Settings: config.ts.
import { loadConfig } from './config';
import { startGateway } from './server';

// Read at build time: esbuild inlines the JSON, so the health check reports the release version.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VERSION: string = require('../../mcp-server/package.json').version;

async function main(): Promise<void> {
  // The kit's tools take their remote behaviour (hidden tools, no URL fetching) from this profile.
  process.env.OPEN_DESIGN_PROFILE = 'remote';
  await startGateway(loadConfig(), VERSION);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
