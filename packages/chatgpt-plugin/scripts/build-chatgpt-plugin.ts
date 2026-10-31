// Builds the ChatGPT desktop plugin, open-design-chatgpt-plugin-<version>.zip
// (openspec add-chatgpt-desktop-plugin):
//   plugin.json   OpenAI's portable manifest, rendered with the server's version
//   mcp.json      one stdio server: node ${PLUGIN_ROOT}/server/out/index.js
//   skills/       the repo's generated .agents/skills/ (the same files Codex uses)
//   server/       the bundled server and content (../../desktop-extension/scripts/stageServer.ts)
//   assets/       the icon
// A local stdio server makes the plugin "Desktop only" in ChatGPT. Nothing is
// fetched from the network.
//
//   npm run build --workspace=packages/chatgpt-plugin -- --content <content.tgz> --out <file.zip>
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { repoRoot, serverVersion, stageBundledServer } from '../../desktop-extension/scripts/stageServer';

const packageRoot = path.resolve(__dirname, '..');

function parseArgs(argv: string[]): { content: string; out?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--content' && flag !== '--out') throw new Error(`Unknown argument ${flag}`);
    if (!argv[i + 1]) throw new Error(`${flag} needs a value`);
    args[flag.slice(2)] = path.resolve(argv[++i]);
  }
  if (!args.content) throw new Error('--content <tgz> is required: the content package tarball (npm pack --workspace=packages/content)');
  return { content: args.content, out: args.out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const version = await serverVersion();
  const out = args.out ?? path.join(repoRoot, 'release', `open-design-chatgpt-plugin-${version}.zip`);
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'od-chatgpt-plugin-'));
  try {
    await stageBundledServer(stage, args.content, version);
    await fs.cp(path.join(repoRoot, '.agents', 'skills'), path.join(stage, 'skills'), { recursive: true });
    await fs.mkdir(path.join(stage, 'assets'));
    await fs.copyFile(path.join(repoRoot, 'packages', 'claude-plugin', '.claude-plugin', 'icon.png'), path.join(stage, 'assets', 'icon.png'));
    const manifest = await fs.readFile(path.join(packageRoot, 'plugin.template.json'), 'utf8');
    await fs.writeFile(path.join(stage, 'plugin.json'), manifest.replace('"${VERSION}"', JSON.stringify(version)));
    await fs.copyFile(path.join(packageRoot, 'mcp.template.json'), path.join(stage, 'mcp.json'));

    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.rm(out, { force: true });
    execFileSync('zip', ['-qrX', out, '.'], { cwd: stage, stdio: 'inherit' });
    console.log(`Built ${out}`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
