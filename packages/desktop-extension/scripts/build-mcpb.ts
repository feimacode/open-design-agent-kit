// Builds the Claude Desktop extension, open-design-<version>.mcpb
// (openspec add-desktop-extension-bundle):
//   1-2. the bundled MCP server and the content package (stageServer.ts,
//      shared with the ChatGPT plugin: a .mcpb has no npm install step);
//   3. the plugin's icon and manifest.json, rendered with the server's version;
//   4. `mcpb validate` and `mcpb pack` from the pinned devDependency.
// Nothing is fetched from the network.
//
// Usage (run through tsx, which the server's build config needs). A .ts file,
// so tsx runs it as CommonJS: on Node 20 an .mjs importing serverBuild.ts gave
// that module a data: URL for __dirname and broke the entry point path.
//
//   npm run build --workspace=packages/desktop-extension -- --content <content.tgz> --out <file.mcpb>
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { repoRoot, serverVersion, stageBundledServer } from './stageServer';

const packageRoot = path.resolve(__dirname, '..');
const mcpb = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'mcpb.cmd' : 'mcpb');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--content' && flag !== '--out') throw new Error(`Unknown argument ${flag}`);
    if (!argv[i + 1]) throw new Error(`${flag} needs a value`);
    args[flag.slice(2)] = path.resolve(argv[++i]);
  }
  if (!args.content) throw new Error('--content <tgz> is required: the content package tarball (npm pack --workspace=packages/content)');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = await serverVersion();
  const out = args.out ?? path.join(repoRoot, 'release', `open-design-${version}.mcpb`);
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcpb-'));
  try {
    await stageBundledServer(stage, args.content, version);

    await fs.copyFile(path.join(repoRoot, 'packages', 'claude-plugin', '.claude-plugin', 'icon.png'), path.join(stage, 'icon.png'));
    const template = await fs.readFile(path.join(packageRoot, 'manifest.template.json'), 'utf8');
    await fs.writeFile(path.join(stage, 'manifest.json'), template.replace('"${VERSION}"', JSON.stringify(version)));

    execFileSync(mcpb, ['validate', path.join(stage, 'manifest.json')], { stdio: 'inherit' });
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.rm(out, { force: true });
    execFileSync(mcpb, ['pack', stage, out], { stdio: 'inherit' });
    console.log(`Built ${out}`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
