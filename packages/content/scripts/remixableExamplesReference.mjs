// Builds the markdown content for each overview skill's `references/remixable-examples.md`
// — the full vendored example pool, grouped by mode, so a model can pick a
// starting point to remix without a tool round-trip (see
// openspec/changes/example-discovery/design.md Decision 2/3).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// Mirrors packages/core/src/content/contentIndex.ts's SKILL_MODES/normalizeMode
// (duplicated deliberately, same as curatedEntries.mjs — this script has no
// TS build step to import the real module through).
const SKILL_MODES = ['prototype', 'deck', 'design-system', 'image', 'video', 'template', 'utility', 'audio'];
const SKILL_MODE_SET = new Set(SKILL_MODES);
const MODE_ORDER = [...SKILL_MODES, 'other'];

function normalizeMode(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SKILL_MODE_SET.has(raw) ? raw : 'other';
}

// Frontmatter descriptions are frequently authored as YAML block scalars
// spanning several physical lines — collapsed to one line here so each
// example renders as exactly one markdown list item, not a broken multi-line
// bullet.
function collapseWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Bare directory ids present under skills/ or design-templates/ — used only
// to detect the same skill/template-vs-example bare-id collision
// ContentIndex.mergeSkillPools() disambiguates at runtime (see that
// function's own comment for why this collision is routine, not rare: an
// example is typically the rendered counterpart of a same-named
// skill/template). An example colliding with one of these gets its public
// id's `:example` suffix here too, so what this file prints always matches
// what list_open_design_skills/remix_open_design_example would actually
// accept.
async function collectDirNames(assetsRoot, subdir) {
  const dir = path.join(assetsRoot, subdir);
  if (!(await pathExists(dir))) return new Set();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

async function collectRemixableExamples(assetsRoot) {
  const dir = path.join(assetsRoot, 'examples');
  const [skillIds, templateIds] = await Promise.all([
    collectDirNames(assetsRoot, 'skills'),
    collectDirNames(assetsRoot, 'design-templates'),
  ]);

  const results = [];
  if (!(await pathExists(dir))) return results;

  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
    const exampleHtmlPath = path.join(dir, entry.name, 'example.html');
    if (!(await pathExists(skillMdPath)) || !(await pathExists(exampleHtmlPath))) continue;

    const { data } = matter(await fs.readFile(skillMdPath, 'utf8'));
    const od = data.od;
    const mode = normalizeMode(od && od.mode);
    const displayName = collapseWhitespace(data.en_name) || collapseWhitespace(data.name) || entry.name;
    const description = collapseWhitespace(data.en_description) || collapseWhitespace(data.description);
    const collides = skillIds.has(entry.name) || templateIds.has(entry.name);
    const id = collides ? `od:${mode}:${entry.name}:example` : `od:${mode}:${entry.name}`;

    results.push({ id, mode, displayName, description });
  }

  return results;
}

/** Renders the full remixable-examples reference, grouped by mode. */
export async function buildRemixableExamplesReference(assetsRoot) {
  const examples = await collectRemixableExamples(assetsRoot);
  examples.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const byMode = new Map();
  for (const ex of examples) {
    if (!byMode.has(ex.mode)) byMode.set(ex.mode, []);
    byMode.get(ex.mode).push(ex);
  }

  const lines = [
    '# Remixable Open Design examples',
    '',
    `${examples.length} vendored examples have an actual rendered starting artifact you can copy into the workspace and modify, via \`remix_open_design_example\` with the \`id\` shown below as \`skillId\`, instead of generating from scratch with \`prepare_open_design_brief\`.`,
    '',
  ];

  for (const mode of MODE_ORDER) {
    const entries = byMode.get(mode);
    if (!entries || entries.length === 0) continue;
    lines.push(`## ${mode}`, '');
    for (const ex of entries) {
      const desc = ex.description ? `: ${ex.description}` : '';
      lines.push(`- **${ex.id}** — ${ex.displayName}${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
