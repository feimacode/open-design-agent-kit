#!/usr/bin/env node
// Process safeguard, same family as packages/content/scripts/check-content-sync.mjs
// and packages/vscode/scripts/check-content-mirror.mjs: recomputes what
// generate-claude-skills.mjs would produce right now and diffs it in memory
// against what's actually committed under skills/, so a content refresh
// that forgot to also re-run generate-claude-skills.mjs (and commit the
// result) is caught, not silently shipped stale.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCuratedEntries } from '@feimacode/open-design-agent-kit-content/scripts/curatedEntries.mjs';
import { buildRemixableExamplesReference } from '@feimacode/open-design-agent-kit-content/scripts/remixableExamplesReference.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const assetsRoot = path.resolve(pluginRoot, '..', 'content', 'assets', 'open-design');
const committedSkillsDir = path.join(pluginRoot, 'skills');

// Duplicated from generate-claude-skills.mjs rather than imported, so this
// check exercises the exact same rendering logic as a fresh copy, not a
// shared closure that could silently diverge in a way that always agrees
// with itself.
function skillMdContent(entry) {
  const placeholder = entry.examplePrompt
    ? entry.examplePrompt.replace(/"/g, '\\"')
    : `What do you want to build with ${entry.displayName}?`;
  // Kept in sync with generate-claude-skills.mjs's own hyphenated-name
  // rationale (see there): colons render as spaces in VS Code's chat input.
  const invocationName = entry.publicId.replace(/:/g, '-');
  return `---
name: "${invocationName}"
description: ${entry.displayName} (OpenDesign) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

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

async function main() {
  const entries = await collectCuratedEntries(assetsRoot);
  const expectedIds = new Set(entries.map((e) => e.id));

  const problems = [];

  for (const entry of entries) {
    const committedPath = path.join(committedSkillsDir, entry.id, 'SKILL.md');
    if (!(await pathExists(committedPath))) {
      problems.push(`missing generated skill for curated entry "${entry.id}"`);
      continue;
    }
    const committed = await fs.readFile(committedPath, 'utf8');
    const expected = skillMdContent(entry);
    if (committed !== expected) problems.push(`stale generated skill content for "${entry.id}"`);
  }

  // Only flags directories the generator itself would recognize as its own
  // output (carrying the generated-marker) — mirrors generate-claude-skills.mjs's
  // own cleanup check exactly, so a user's hand-authored skill under
  // skills/ (no marker) is never mistaken for drift.
  const existingDirs = (await fs.readdir(committedSkillsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== 'open-design')
    .map((e) => e.name);
  for (const dirName of existingDirs) {
    if (expectedIds.has(dirName)) continue;
    const skillMdPath = path.join(committedSkillsDir, dirName, 'SKILL.md');
    if (!(await pathExists(skillMdPath))) continue;
    const content = await fs.readFile(skillMdPath, 'utf8');
    if (content.includes('<!-- generated:curated-entry -->')) {
      problems.push(`stale generated skill directory not in the current curated set: "${dirName}"`);
    }
  }

  const referencePath = path.join(committedSkillsDir, 'open-design', 'references', 'remixable-examples.md');
  if (!(await pathExists(referencePath))) {
    problems.push('missing skills/open-design/references/remixable-examples.md');
  } else {
    const committedReference = await fs.readFile(referencePath, 'utf8');
    const expectedReference = await buildRemixableExamplesReference(assetsRoot);
    if (committedReference !== expectedReference) problems.push('stale skills/open-design/references/remixable-examples.md');
  }

  if (problems.length > 0) {
    console.error(
      `Claude Code skills drift detected:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        `Run \`npm run sync-content\` and commit the refreshed packages/claude-plugin/skills/.`,
    );
    process.exit(1);
  }

  console.log(`packages/claude-plugin/skills/ is in sync with the curated content (${entries.length} entries).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
