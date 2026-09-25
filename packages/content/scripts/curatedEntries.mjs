// Shared curated-entry detection, used by every host's command/prompt
// generator (packages/vscode's chatPromptFiles, packages/claude-plugin's
// commands/) so "which entries are curated" is decided in exactly one
// place, regardless of how many hosts render it. A curated entry is one
// carrying a top-level `featured`, a top-level `recommended`, or an
// `od.default_for` field in its SKILL.md frontmatter — or one whose id is
// listed in the extension-owned local/curated.json (see local/README.md).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const LOCAL_CURATED_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'local', 'curated.json');

async function readLocalCurated(localCuratedPath) {
  let raw;
  try {
    raw = await fs.readFile(localCuratedPath, 'utf8');
  } catch {
    return new Set();
  }
  const ids = JSON.parse(raw);
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    throw new Error(`${localCuratedPath} must be a JSON array of entry id strings.`);
  }
  return new Set(ids);
}

// Mirrors packages/core/src/content/contentIndex.ts's SKILL_MODES/normalizeMode.
const SKILL_MODES = new Set(['prototype', 'deck', 'design-system', 'image', 'video', 'template', 'utility', 'audio']);

function normalizeMode(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SKILL_MODES.has(raw) ? raw : 'other';
}

function isCurated(data, od) {
  if (data.featured !== undefined) return true;
  if (data.recommended !== undefined) return true;
  if (od && od.default_for !== undefined) return true;
  return false;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function collectFrom(assetsRoot, subdir, localCurated, seen) {
  const dir = path.join(assetsRoot, subdir);
  const entries = [];
  if (!(await pathExists(dir))) return entries;
  const dirEntries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
    if (!(await pathExists(skillMdPath))) continue;
    const raw = await fs.readFile(skillMdPath, 'utf8');
    const { data } = matter(raw);
    const od = data.od;
    seen.add(entry.name);
    if (!isCurated(data, od) && !localCurated.has(entry.name)) continue;
    const mode = normalizeMode(od && od.mode);
    entries.push({
      id: entry.name,
      publicId: `od:${mode}:${entry.name}`,
      mode,
      displayName: (data.en_name && data.en_name.trim()) || (data.name && data.name.trim()) || entry.name,
      examplePrompt: od && typeof od.example_prompt === 'string' ? od.example_prompt : undefined,
    });
  }
  return entries;
}

/**
 * Every curated skill/design-template entry, sorted by id. Throws if the
 * local curation list names an id that matches no entry (a typo, or an
 * upstream rename) — silently dropping it would lose a command unnoticed.
 */
export async function collectCuratedEntries(assetsRoot, localCuratedPath = LOCAL_CURATED_PATH) {
  const localCurated = await readLocalCurated(localCuratedPath);
  const seen = new Set();
  const [skills, templates] = await Promise.all([
    collectFrom(assetsRoot, 'skills', localCurated, seen),
    collectFrom(assetsRoot, 'design-templates', localCurated, seen),
  ]);
  const unknown = [...localCurated].filter((id) => !seen.has(id));
  if (unknown.length > 0) {
    throw new Error(`${localCuratedPath} names unknown entry id(s): ${unknown.join(', ')}`);
  }
  return [...skills, ...templates].sort((a, b) => a.id.localeCompare(b.id));
}
