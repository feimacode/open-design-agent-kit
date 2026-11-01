#!/usr/bin/env node
// The stdio MCP server. The tools live in session.ts, which the hosted
// gateway (packages/mcp-gateway, openspec add-mcp-gateway) reuses.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSession } from './session';

async function main(): Promise<void> {
  if (process.argv.slice(2).includes('--http')) {
    throw new Error('The hosted server moved to the open-design-gateway image (packages/mcp-gateway). This server runs over stdio only.');
  }
  const server = createSession();
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
