#!/usr/bin/env node
// Scaffold generator for porting one (or listing all candidate) design
// systems from bergside/awesome-design-skills (typeui.sh) into this repo's
// local content overlay. See typeuiExtraction.mjs for the mapping rules and
// packages/content/local/README.md for the full scaffold -> review -> move
// workflow this feeds. NEVER writes into local/design-systems/ directly —
// output always lands under the gitignored .typeui-scaffold/ staging dir,
// so an unreviewed scaffold can never be picked up by apply-local-overlay.mjs.
//
// Usage:
//   node scripts/extract-typeui-design-system.mjs <slug> [--source <dir>] [--force]
//   node scripts/extract-typeui-design-system.mjs --list-candidates [--source <dir>]
//
// --source defaults to $TYPEUI_SRC (a local awesome-design-skills checkout),
// mirroring sync-open-design-content.mjs's own OPEN_DESIGN_SRC override
// convention. Without either, falls back to fetching straight from GitHub's
// raw content host on `main` — awesome-design-skills has no tags to pin
// against, the same unauthenticated shape typeui's own CLI itself uses
// (see REGISTRY.md in the typeui repo).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDesignSystemScaffold, classifyCandidates } from './typeuiExtraction.mjs';
import { OVERLAY_MARKER } from './apply-local-overlay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(packageRoot, 'assets', 'open-design');
const localDesignSystemsRoot = path.join(packageRoot, 'local', 'design-systems');
const scaffoldRoot = path.join(packageRoot, 'scripts', '.typeui-scaffold');

const RAW_BASE = 'https://raw.githubusercontent.com/bergside/awesome-design-skills/main';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dir) {
  if (!(await pathExists(dir))) return [];
  return (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readLocalEntry(sourceDir, slug) {
  const dir = path.join(sourceDir, 'skills', slug);
  const [skillMdRaw, designMdRaw] = await Promise.all([
    fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'),
    fs.readFile(path.join(dir, 'DESIGN.md'), 'utf8'),
  ]);
  return { skillMdRaw, designMdRaw };
}

async function readLocalIndexSlugs(sourceDir) {
  const raw = await fs.readFile(path.join(sourceDir, 'skills', 'index.json'), 'utf8');
  return Object.keys(JSON.parse(raw));
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function fetchRemoteEntry(slug) {
  const [skillMdRaw, designMdRaw] = await Promise.all([
    fetchText(`${RAW_BASE}/skills/${slug}/SKILL.md`),
    fetchText(`${RAW_BASE}/skills/${slug}/DESIGN.md`),
  ]);
  return { skillMdRaw, designMdRaw };
}

async function fetchRemoteIndexSlugs() {
  const raw = await fetchText(`${RAW_BASE}/skills/index.json`);
  return Object.keys(JSON.parse(raw));
}

// Excludes ids that are actually our own local-overlay copies: `local/`
// entries get physically copied into assets/open-design/design-systems/
// too (see apply-local-overlay.mjs), each carrying OVERLAY_MARKER — without
// filtering those out, every already-ported typeui slug would misreport as
// "redundant upstream" instead of "ported".
async function getUpstreamDesignSystemIds() {
  const dsRoot = path.join(assetsRoot, 'design-systems');
  const ids = await listDirs(dsRoot);
  const upstreamOnly = [];
  for (const id of ids) {
    if (!(await pathExists(path.join(dsRoot, id, OVERLAY_MARKER)))) upstreamOnly.push(id);
  }
  return new Set(upstreamOnly);
}

async function getLocalDesignSystemIds() {
  return new Set(await listDirs(localDesignSystemsRoot));
}

async function getAvailableCategories() {
  const ids = await listDirs(path.join(assetsRoot, 'design-systems'));
  const categories = new Set();
  for (const id of ids) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(assetsRoot, 'design-systems', id, 'manifest.json'), 'utf8'));
      if (typeof manifest.category === 'string' && manifest.category.trim()) categories.add(manifest.category.trim());
    } catch {
      // legacy DESIGN.md-only entry, or no manifest — no category to contribute
    }
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv) {
  const args = { source: process.env.TYPEUI_SRC, force: false, listCandidates: false, slug: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i];
    else if (arg === '--force') args.force = true;
    else if (arg === '--list-candidates') args.listCandidates = true;
    else if (!arg.startsWith('--')) args.slug = arg;
  }
  return args;
}

async function runListCandidates(args) {
  const typeuiSlugs = args.source ? await readLocalIndexSlugs(args.source) : await fetchRemoteIndexSlugs();
  const upstreamIds = await getUpstreamDesignSystemIds();
  const localIds = await getLocalDesignSystemIds();
  const { redundant, ported, candidate } = classifyCandidates(typeuiSlugs, upstreamIds, localIds);
  console.log(`redundant (already a richer upstream entry, ${redundant.length}): ${redundant.join(', ') || '(none)'}`);
  console.log(`ported (already under local/design-systems/, ${ported.length}): ${ported.join(', ') || '(none)'}`);
  console.log(`candidate (net-new, ${candidate.length}): ${candidate.join(', ') || '(none)'}`);
}

async function runExtract(args) {
  if (!args.slug) {
    console.error('Usage: node scripts/extract-typeui-design-system.mjs <slug> [--source <dir>] [--force]');
    process.exit(1);
  }
  const { skillMdRaw, designMdRaw } = args.source ? await readLocalEntry(args.source, args.slug) : await fetchRemoteEntry(args.slug);
  const upstreamIds = await getUpstreamDesignSystemIds();
  const localIds = await getLocalDesignSystemIds();
  const availableCategories = await getAvailableCategories();

  const scaffold = extractDesignSystemScaffold(args.slug, skillMdRaw, designMdRaw, upstreamIds, localIds, availableCategories);
  if (scaffold.collision && !args.force) {
    console.error(`Refusing to scaffold "${args.slug}": ${scaffold.notes[0]}`);
    console.error('Pass --force to scaffold anyway.');
    process.exit(1);
  }

  const dir = path.join(scaffoldRoot, args.slug);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(scaffold.manifest, null, 2) + '\n');
  await fs.writeFile(path.join(dir, 'tokens.css'), scaffold.tokensCss);
  await fs.writeFile(path.join(dir, 'DESIGN.md'), scaffold.designMdSkeleton);
  await fs.writeFile(
    path.join(dir, 'NOTES.md'),
    `# Review checklist for "${args.slug}"\n\n` +
      `Source: https://github.com/bergside/awesome-design-skills/tree/main/skills/${args.slug}\n` +
      `Screenshot: https://github.com/bergside/awesome-design-skills/tree/main/registry-examples/${args.slug}-marketing.png\n\n` +
      scaffold.notes.map((n) => `- [ ] ${n}`).join('\n') +
      '\n\nOnce every item above is resolved: move manifest.json/tokens.css/DESIGN.md into ' +
      `packages/content/local/design-systems/${args.slug}/, delete this NOTES.md, then run ` +
      '`npm run apply-overlay --workspace=@feimacode/open-design-agent-kit-content` (and the vscode ' +
      'mirror step — see local/README.md).\n',
  );

  console.log(`Scaffold written to ${path.relative(process.cwd(), dir)}/ — resolve NOTES.md before moving into local/design-systems/.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.listCandidates) await runListCandidates(args);
  else await runExtract(args);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
