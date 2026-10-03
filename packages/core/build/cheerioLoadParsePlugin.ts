// esbuild plugin shared by every host bundle (vscode, mcp-server, cli):
// resolves `cheerio` to its `load-parse` module. The vendored standalone
// bundler (src/vendored/standaloneHtml.ts) only uses `load`, which lives
// there; cheerio's main entry also pulls in `fromURL`/`loadBuffer` and with
// them undici and encoding-sniffer, about 1.5 MB minified of code that is
// never called. Node (unit tests) still resolves the full package.
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { Plugin } from 'esbuild';

const localRequire = createRequire(__filename);

export const cheerioLoadParsePlugin: Plugin = {
  name: 'cheerio-load-parse',
  setup(build) {
    build.onResolve({ filter: /^cheerio$/ }, () => ({
      path: path.join(path.dirname(localRequire.resolve('cheerio')), 'load-parse.js'),
    }));
  },
};
