#!/usr/bin/env node
// Generates a chatPromptFile (VS Code / Copilot slash command) for each
// "featured" skill or design-template, so the ~20-ish most-curated entries
// are reachable with zero ambiguity (the model doesn't have to guess a
// skillId from natural language) without flooding the `/` autocomplete
// with all ~280 vendored entries. Run after sync-open-design-content.mjs.
// Idempotent: clears and rewrites prompts/featured/ and the generated slice
// of package.json's contributes.chatPromptFiles on every run.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(repoRoot, 'assets', 'open-design');
const featuredPromptsDir = path.join(repoRoot, 'prompts', 'featured');
const GENERATED_PREFIX = './prompts/featured/';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isFeatured(data, od) {
  if (data.featured !== undefined) return true;
  if (data.recommended !== undefined) return true;
  if (od && od.default_for !== undefined) return true;
  return false;
}

// Mirrors src/core/content/contentIndex.ts's SKILL_MODES/normalizeMode —
// kept in sync manually since this script doesn't import the TS module.
const SKILL_MODES = new Set(['prototype', 'deck', 'design-system', 'image', 'video', 'template', 'utility', 'audio']);

function normalizeMode(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SKILL_MODES.has(raw) ? raw : 'other';
}

async function collectFeaturedEntries(subdir) {
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
    if (!isFeatured(data, od)) continue;
    const mode = normalizeMode(od && od.mode);
    entries.push({
      id: entry.name,
      publicId: `od:${mode}:${entry.name}`,
      displayName: (data.en_name && data.en_name.trim()) || (data.name && data.name.trim()) || entry.name,
      examplePrompt: od && typeof od.example_prompt === 'string' ? od.example_prompt : undefined,
    });
  }
  return entries;
}

function promptFileContent(entry) {
  const placeholder = entry.examplePrompt
    ? entry.examplePrompt.replace(/"/g, '\\"')
    : `What do you want to build with ${entry.displayName}?`;
  return `---
description: ${entry.displayName} (OpenDesign)
mode: agent
---

Use the OpenDesign skill \`${entry.publicId}\` (${entry.displayName}).

Brief: \${input:brief:${placeholder}}

Call \`prepare_open_design_brief\` with skillId "${entry.publicId}" and this brief (call \`list_open_design_design_systems\` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call \`register_open_design_artifact\`.
`;
}

async function main() {
  const [skills, templates] = await Promise.all([
    collectFeaturedEntries('skills'),
    collectFeaturedEntries('design-templates'),
  ]);
  const entries = [...skills, ...templates].sort((a, b) => a.id.localeCompare(b.id));

  await fs.rm(featuredPromptsDir, { recursive: true, force: true });
  await fs.mkdir(featuredPromptsDir, { recursive: true });
  for (const entry of entries) {
    await fs.writeFile(path.join(featuredPromptsDir, `${entry.id}.prompt.md`), promptFileContent(entry));
  }

  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  const handAuthored = (pkg.contributes.chatPromptFiles || []).filter((e) => !e.path.startsWith(GENERATED_PREFIX));
  const generated = entries.map((entry) => ({ path: `${GENERATED_PREFIX}${entry.id}.prompt.md` }));
  pkg.contributes.chatPromptFiles = [...handAuthored, ...generated];
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`Generated ${entries.length} featured prompt files, updated package.json contributes.chatPromptFiles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
