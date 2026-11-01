import * as path from 'node:path';
import type * as esbuild from 'esbuild';
import { cheerioLoadParsePlugin } from '../core/build/cheerioLoadParsePlugin';

export const CONTENT_PACKAGE = '@feimacode/open-design-agent-kit-content';
export const MCP_SDK_PACKAGE = '@modelcontextprotocol/sdk';

/**
 * The esbuild options for the MCP server's one-file bundle, shared by the npm
 * package's build (.esbuild.ts) and the Claude Desktop extension's
 * (packages/desktop-extension/scripts/build-mcpb.ts), so the two can't drift.
 * `external` decides what stays a runtime dependency.
 */
export function serverBuildOptions(input: { outfile: string; external: string[]; entryPoint?: string }): esbuild.BuildOptions {
  return {
    // The hosted gateway (packages/mcp-gateway) passes its own entry point; everything else is the same.
    entryPoints: [input.entryPoint ?? path.join(__dirname, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: input.outfile,
    external: input.external,
    plugins: [cheerioLoadParsePlugin],
    // No banner: src/index.ts already starts with its own shebang line, and
    // esbuild preserves a leading shebang from the entry point automatically
    // — adding another via `banner` would duplicate it and break as invalid
    // JS (a second `#!` line past line 1 is a syntax error, not a comment).
    logLevel: 'info',
  };
}
