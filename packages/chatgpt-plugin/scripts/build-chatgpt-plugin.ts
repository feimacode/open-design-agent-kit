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
//
// --hosted <https://…/mcp> builds the directory-listing variant instead
// (openspec deploy-hosted-gateway): mcp.json names the hosted gateway and the
// zip has no server/. It is only for the ChatGPT plugin directory submission;
// the release zip people install themselves stays local.
//
//   npm run build --workspace=packages/chatgpt-plugin -- --hosted https://open-design.feimacode.com/mcp --out <file.zip>
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { repoRoot, serverVersion, stageBundledServer } from '../../desktop-extension/scripts/stageServer';

const packageRoot = path.resolve(__dirname, '..');

export function parseArgs(argv: string[]): { content?: string; out?: string; hosted?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--content' && flag !== '--out' && flag !== '--hosted') throw new Error(`Unknown argument ${flag}`);
    if (!argv[i + 1]) throw new Error(`${flag} needs a value`);
    const value = argv[++i];
    args[flag.slice(2)] = flag === '--hosted' ? value : path.resolve(value);
  }
  if (args.hosted) {
    const url = new URL(args.hosted);
    if (url.protocol !== 'https:' || !url.pathname.endsWith('/mcp')) throw new Error('--hosted needs the gateway\'s https URL ending in /mcp');
    return { hosted: url.toString(), out: args.out };
  }
  if (!args.content) throw new Error('--content <tgz> is required: the content package tarball (npm pack --workspace=packages/content)');
  return { content: args.content, out: args.out };
}

/** mcp.json for the directory-listing variant: the hosted gateway over streamable HTTP. */
export function hostedMcpJson(url: string): string {
  return `${JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { 'open-design': { type: 'http', url } } }, null, 2)}\n`;
}

/** The hosted variant's long description: no local install, no Documents folder, no Node.js. */
export const HOSTED_LONG_DESCRIPTION =
  'Open Design gives ChatGPT design recipes, 198 design systems and remixable examples. Ask for a poster, a pitch deck, a landing page or an Instagram carousel: it\'s built as a real page in one consistent style, checked in a browser, and exported to PNG, PDF or PowerPoint with a download link. Nothing to install and no account needed; projects are kept for 7 days.';

/** plugin.json for the directory-listing variant: the same manifest with the hosted description. */
export function hostedManifest(rendered: string): string {
  const manifest = JSON.parse(rendered);
  manifest.extensions['com.openai'].interface.longDescription = HOSTED_LONG_DESCRIPTION;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const version = await serverVersion();
  const out = args.out ?? path.join(repoRoot, 'release', `open-design-chatgpt-plugin-${version}${args.hosted ? '-hosted' : ''}.zip`);
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'od-chatgpt-plugin-'));
  try {
    if (!args.hosted) await stageBundledServer(stage, args.content!, version);
    await fs.cp(path.join(repoRoot, '.agents', 'skills'), path.join(stage, 'skills'), { recursive: true });
    await fs.mkdir(path.join(stage, 'assets'));
    await fs.copyFile(path.join(repoRoot, 'packages', 'claude-plugin', '.claude-plugin', 'icon.png'), path.join(stage, 'assets', 'icon.png'));
    const manifest = await fs.readFile(path.join(packageRoot, 'plugin.template.json'), 'utf8');
    const rendered = manifest.replace('"${VERSION}"', JSON.stringify(version));
    await fs.writeFile(path.join(stage, 'plugin.json'), args.hosted ? hostedManifest(rendered) : rendered);
    if (args.hosted) await fs.writeFile(path.join(stage, 'mcp.json'), hostedMcpJson(args.hosted));
    else await fs.copyFile(path.join(packageRoot, 'mcp.template.json'), path.join(stage, 'mcp.json'));

    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.rm(out, { force: true });
    execFileSync('zip', ['-qrX', out, '.'], { cwd: stage, stdio: 'inherit' });
    console.log(`Built ${out}`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
