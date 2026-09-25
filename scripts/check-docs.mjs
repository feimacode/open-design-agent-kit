#!/usr/bin/env node
// Docs drift check (openspec: documentation), run by root `npm run lint`.
// Two kinds of assertions, all problems reported at once:
//  1. Reference completeness: every tool (+ each input property), VS Code
//     setting, OPEN_DESIGN_* env var, VS Code command, and CLI command (+ each
//     option) found in code has its entry in docs/reference/.
//  2. Link integrity: every relative Markdown link in docs/**, README.md and
//     packages/*/README.md resolves to a file (and #fragment to a heading), and
//     absolute links to this repo's blob/main/ paths point to files that exist
//     (also checked in the VS Code walkthrough pages, packages/vscode/media/).
//  3. Every docs page is reachable from docs/README.md within two clicks.
// `--links-only` skips (1). No dependencies.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_BLOB_PREFIX = 'https://github.com/feimacode/open-design-agent-kit/blob/main/';

// ---------- Markdown helpers (pure, unit-tested) ----------

/** Removes fenced code blocks (keeping line count) so headings/links inside them are ignored. */
export function stripFences(markdown) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

/** GitHub heading slug: lowercase, drop punctuation (keep letters, digits, spaces, `-`, `_`), spaces → `-`. */
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Plain heading text: inline code/emphasis/link markup removed. */
export function headingText(raw) {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim();
}

/** [{ level, text, slug, line }] with GitHub's -1/-2 suffixes for duplicate slugs. */
export function headings(markdown) {
  const seen = new Map();
  const result = [];
  stripFences(markdown)
    .split('\n')
    .forEach((line, i) => {
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!m) return;
      const text = headingText(m[2]);
      const base = slugify(text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      result.push({ level: m[1].length, text, slug: n === 0 ? base : `${base}-${n}`, line: i });
    });
  return result;
}

/** The text of the section under the first heading whose text equals `title` (optionally at `level`), or undefined. */
export function sectionText(markdown, title, level) {
  const lines = markdown.split('\n');
  const hs = headings(markdown);
  const idx = hs.findIndex((h) => h.text === title && (level === undefined || h.level === level));
  if (idx < 0) return undefined;
  const start = hs[idx].line;
  const next = hs.slice(idx + 1).find((h) => h.level <= hs[idx].level);
  return lines.slice(start, next ? next.line : lines.length).join('\n');
}

/** Markdown link/image targets outside code: [{ target, line }]. Inline code spans are ignored. */
export function extractLinks(markdown) {
  const links = [];
  stripFences(markdown)
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
      for (const m of code.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) links.push({ target: m[1], line: i + 1 });
    });
  return links;
}

/** Does `word` appear in `text` as a whole token (e.g. `maxBytes`, `--max-bytes`)? */
export function mentions(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`).test(text);
}

/** CLI surface from commander calls: { commandName: [option flags] } — options attach to the preceding .command(). */
export function parseCliSurface(source) {
  const surface = {};
  let current;
  for (const m of source.matchAll(/\.(command|option|requiredOption)\(\s*'([^']+)'/g)) {
    if (m[1] === 'command') {
      current = m[2].split(/\s+/)[0];
      surface[current] = [];
    } else if (current) {
      const flag = /--[a-z0-9-]+/.exec(m[2]);
      if (flag) surface[current].push(flag[0]);
    }
  }
  return surface;
}

// ---------- Collecting the code-side truth ----------

async function readText(rel) {
  return fs.readFile(path.join(repoRoot, rel), 'utf8');
}

async function listFiles(dirRel, predicate) {
  const out = [];
  async function walk(rel) {
    let entries;
    try {
      entries = await fs.readdir(path.join(repoRoot, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = path.posix.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'test' || e.name === 'assets') continue;
        await walk(child);
      } else if (predicate(child)) out.push(child);
    }
  }
  await walk(dirRel);
  return out;
}

async function collectCodeSurface() {
  const pkg = JSON.parse(await readText('packages/vscode/package.json'));
  const tools = new Map(pkg.contributes.languageModelTools.map((t) => [t.name, Object.keys(t.inputSchema?.properties ?? {})]));
  const mcpSource = await readText('packages/mcp-server/src/index.ts');
  for (const m of mcpSource.matchAll(/tool:\s*\{\s*name:\s*'([a-z_]+)'/g)) if (!tools.has(m[1])) tools.set(m[1], []);

  const settings = Object.keys(pkg.contributes.configuration.properties);
  const commands = pkg.contributes.commands.map((c) => c.command);

  const envVars = new Set();
  for (const rel of await listFiles('packages', (f) => /\/src\/.*\.ts$/.test(f) && !/\.test\.ts$/.test(f))) {
    for (const m of (await readText(rel)).matchAll(/['"`](OPEN_DESIGN_[A-Z_]+)['"`]|process\.env\.(OPEN_DESIGN_[A-Z_]+)/g)) envVars.add(m[1] ?? m[2]);
  }

  const cli = parseCliSurface(await readText('packages/cli/src/index.ts'));
  return { tools, settings, commands, envVars: [...envVars].sort(), cli };
}

// ---------- Checks ----------

async function checkReference(problems) {
  const surface = await collectCodeSurface();
  const ref = async (name) => {
    try {
      return await readText(`docs/reference/${name}`);
    } catch {
      problems.push(`docs/reference/${name} is missing`);
      return '';
    }
  };

  const toolsMd = await ref('tools.md');
  for (const [tool, props] of surface.tools) {
    const section = sectionText(toolsMd, tool, 3);
    if (section === undefined) {
      problems.push(`docs/reference/tools.md: missing section "### ${tool}"`);
      continue;
    }
    for (const prop of props) if (!mentions(section, prop)) problems.push(`docs/reference/tools.md › ${tool}: input "${prop}" is not documented`);
  }

  const settingsMd = await ref('settings-and-env.md');
  const settingsHeadings = new Set(headings(settingsMd).map((h) => h.text));
  for (const key of [...surface.settings, ...surface.envVars]) {
    if (!settingsHeadings.has(key)) problems.push(`docs/reference/settings-and-env.md: missing heading "### ${key}"`);
  }

  const commandsMd = await ref('prompts-and-commands.md');
  for (const id of surface.commands) if (!mentions(commandsMd, id)) problems.push(`docs/reference/prompts-and-commands.md: VS Code command "${id}" is not listed`);

  const cliMd = await ref('cli.md');
  for (const [command, options] of Object.entries(surface.cli)) {
    const section = sectionText(cliMd, command, 3);
    if (section === undefined) {
      problems.push(`docs/reference/cli.md: missing section "### ${command}"`);
      continue;
    }
    for (const opt of options) if (!mentions(section, opt)) problems.push(`docs/reference/cli.md › ${command}: option "${opt}" is not documented`);
  }
}

async function checkLinks(problems) {
  const files = [
    ...(await listFiles('docs', (f) => f.endsWith('.md'))),
    'README.md',
    ...(await listFiles('packages', (f) => /^packages\/[^/]+\/README\.md$/.test(f))),
    // VS Code walkthrough pages ship in the .vsix and link to docs/ by absolute URL.
    ...(await listFiles('packages/vscode/media', (f) => f.endsWith('.md'))),
  ];
  const headingCache = new Map();
  const slugsOf = async (rel) => {
    if (!headingCache.has(rel)) headingCache.set(rel, new Set(headings(await readText(rel)).map((h) => h.slug)));
    return headingCache.get(rel);
  };
  const exists = async (rel) => {
    try {
      await fs.access(path.join(repoRoot, rel));
      return true;
    } catch {
      return false;
    }
  };

  for (const file of files) {
    const markdown = await readText(file);
    for (const { target, line } of extractLinks(markdown)) {
      let rel;
      if (target.startsWith(REPO_BLOB_PREFIX)) rel = decodeURIComponent(target.slice(REPO_BLOB_PREFIX.length));
      else if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      else if (target.startsWith('#')) rel = `${file}${target}`;
      else rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target)));

      const [filePart, fragment] = rel.split('#');
      const where = `${file}:${line}`;
      if (!(await exists(filePart))) {
        problems.push(`${where}: link "${target}" → ${filePart} does not exist`);
        continue;
      }
      if (fragment && filePart.endsWith('.md') && !(await slugsOf(filePart)).has(fragment)) {
        problems.push(`${where}: link "${target}" → no heading "#${fragment}" in ${filePart}`);
      }
    }
  }
}

// The overview skill (shipped to Claude Code, Codex and `init`) links to the
// docs with bare URLs, not Markdown links: check that each points at a real file.
async function checkBareRepoUrls(problems) {
  const rel = 'packages/claude-plugin/skills/open-design/SKILL.md';
  const text = await readText(rel);
  const lines = text.split('\n');
  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(/https:\/\/github\.com\/feimacode\/open-design-agent-kit\/blob\/main\/([^\s)#>]+)/g)) {
      try {
        await fs.access(path.join(repoRoot, decodeURIComponent(m[1])));
      } catch {
        problems.push(`${rel}:${i + 1}: URL ${m[0]} → ${m[1]} does not exist`);
      }
    }
  }
}

// Every docs page must be reachable from docs/README.md within two clicks
// (directly, or through a section README). Redirect stubs ("This page moved
// to …") are exempt.
async function checkReachability(problems) {
  const pages = await listFiles('docs', (f) => f.endsWith('.md'));
  const linked = async (rel) =>
    extractLinks(await readText(rel))
      .map(({ target }) => target.split('#')[0])
      .filter((t) => t.endsWith('.md') && !/^[a-z][a-z0-9+.-]*:/i.test(t))
      .map((t) => path.posix.normalize(path.posix.join(path.posix.dirname(rel), t)));
  const first = await linked('docs/README.md');
  const reachable = new Set(['docs/README.md', ...first]);
  for (const page of first) if (pages.includes(page)) for (const p of await linked(page)) reachable.add(p);
  for (const page of pages) {
    if (reachable.has(page)) continue;
    if (/^This page moved to /m.test(await readText(page))) continue;
    problems.push(`${page}: not reachable from docs/README.md within two clicks — link it from the index or a section README`);
  }
}

async function main() {
  const linksOnly = process.argv.includes('--links-only');
  const problems = [];
  if (!linksOnly) await checkReference(problems);
  await checkLinks(problems);
  await checkBareRepoUrls(problems);
  await checkReachability(problems);
  if (problems.length > 0) {
    console.error(`Docs check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Docs check passed${linksOnly ? ' (links only)' : ''}.`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
