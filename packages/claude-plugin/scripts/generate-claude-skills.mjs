#!/usr/bin/env node
// Generates one explicit-only Claude Code skill per curated OpenDesign
// entry (see packages/content/scripts/curatedEntries.mjs for the shared
// detection logic shared with packages/vscode's chatPromptFiles generator).
// `disable-model-invocation: true` gives each one exactly the old
// "explicit-only shortcut" behavior a flat commands/*.md file used to (that
// format is now legacy — see openspec/changes/agent-plugin-support/design.md
// Decision 4's correction). Run as part of `npm run sync-content`.
// Idempotent: clears and rewrites the generated skill folders on every run.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCuratedEntries } from '@feimacode/open-design-agent-kit-content/scripts/curatedEntries.mjs';
import { buildRemixableExamplesReference } from '@feimacode/open-design-agent-kit-content/scripts/remixableExamplesReference.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const assetsRoot = path.resolve(pluginRoot, '..', 'content', 'assets', 'open-design');
const skillsDir = path.join(pluginRoot, 'skills');
const GENERATED_MARKER = '<!-- generated:curated-entry -->';

function skillMdContent(entry) {
  const placeholder = entry.examplePrompt
    ? entry.examplePrompt.replace(/"/g, '\\"')
    : `What do you want to build with ${entry.displayName}?`;
  return `---
description: ${entry.displayName} (OpenDesign) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

${GENERATED_MARKER}

Use the OpenDesign skill \`${entry.publicId}\` (${entry.displayName}).

Brief: "$ARGUMENTS", or if empty: "${placeholder}"

Call \`prepare_open_design_brief\` (the open-design MCP server's tool) with skillId "${entry.publicId}" and this brief — call \`list_open_design_design_systems\` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call \`register_open_design_artifact\`.
`;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isGeneratedSkillDir(dir) {
  const skillMd = path.join(dir, 'SKILL.md');
  if (!(await pathExists(skillMd))) return false;
  const content = await fs.readFile(skillMd, 'utf8');
  return content.includes(GENERATED_MARKER);
}

async function main() {
  const entries = await collectCuratedEntries(assetsRoot);

  await fs.mkdir(skillsDir, { recursive: true });
  const existing = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const entry of existing) {
    if (!entry.isDirectory() || entry.name === 'open-design') continue;
    const dir = path.join(skillsDir, entry.name);
    if (await isGeneratedSkillDir(dir)) await fs.rm(dir, { recursive: true, force: true });
  }

  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), skillMdContent(entry));
  }

  const referencesDir = path.join(skillsDir, 'open-design', 'references');
  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(path.join(referencesDir, 'remixable-examples.md'), await buildRemixableExamplesReference(assetsRoot));

  console.log(`Generated ${entries.length} curated OpenDesign skills under ${path.relative(pluginRoot, skillsDir)}/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
