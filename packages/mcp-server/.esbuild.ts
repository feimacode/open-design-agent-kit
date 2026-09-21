import { promises as fs } from 'node:fs';
import * as esbuild from 'esbuild';

// Bundles @feimacode/open-design-agent-kit-core (raw TS source, no compiled
// output of its own — same resolution strategy packages/vscode's esbuild
// config already relies on) into one self-contained CJS file, so a
// published, `npx`-run MCP server has zero runtime dependency on that
// sibling workspace package being present. @feimacode/open-design-agent-kit-content
// is deliberately left external: it's ~15MB of markdown/JSON *data*, not
// code — env.ts locates it at runtime via `require.resolve` against a real
// installed node_modules entry, which only works if esbuild leaves that
// require call alone rather than trying to bundle a data package's assets
// into the JS output. @modelcontextprotocol/sdk is also left external:
// it's a normal, publishable npm dependency with no TS-source-resolution
// problem, so there's no reason to inline it.
async function main() {
  await fs.rm('out', { recursive: true, force: true });
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: 'out/index.js',
    external: ['@feimacode/open-design-agent-kit-content', '@modelcontextprotocol/sdk'],
    // No banner: src/index.ts already starts with its own shebang line, and
    // esbuild preserves a leading shebang from the entry point automatically
    // — adding another via `banner` would duplicate it and break as invalid
    // JS (a second `#!` line past line 1 is a syntax error, not a comment).
    logLevel: 'info',
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
