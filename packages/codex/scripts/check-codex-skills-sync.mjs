#!/usr/bin/env node
// Process safeguard, same family as packages/claude-plugin/scripts/check-skills-sync.mjs:
// recomputes what generate-codex-skills.mjs would produce right now and
// diffs it in memory against what's actually committed under .agents/skills/,
// so a content refresh (or an edit to the hand-authored overview skill)
// that forgot to also re-run generate-codex-skills.mjs is caught.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCuratedEntries } from '@feimacode/open-design-agent-kit-content/scripts/curatedEntries.mjs';
import { buildRemixableExamplesReference } from '@feimacode/open-design-agent-kit-content/scripts/remixableExamplesReference.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codexPackageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(codexPackageRoot, '..', '..');
const assetsRoot = path.resolve(codexPackageRoot, '..', 'content', 'assets', 'open-design');
const overviewSkillSource = path.join(repoRoot, 'packages', 'claude-plugin', 'skills', 'open-design', 'SKILL.md');
const skillsDir = path.join(repoRoot, '.agents', 'skills');
const GENERATED_MARKER = '<!-- generated:open-design-agent-kit -->';

function curatedSkillMdContent(entry) {
  const placeholder = entry.examplePrompt
    ? entry.examplePrompt.replace(/"/g, '\\"')
    : `What do you want to build with ${entry.displayName}?`;
  return `---
name: ${entry.id}
description: ${entry.displayName} (OpenDesign) — use only when explicitly invoked, not for general design requests
---

${GENERATED_MARKER}

Use the OpenDesign skill \`${entry.publicId}\` (${entry.displayName}).

Treat the rest of the user's message as the brief. If nothing more specific was given, use: "${placeholder}"

Call \`prepare_open_design_brief\` (the open-design MCP server's tool) with skillId "${entry.publicId}" and this brief — call \`list_open_design_design_systems\` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call \`register_open_design_artifact\`.
`;
}

const YAML_GENERATED_MARKER = '# generated:open-design-agent-kit';
const EXPLICIT_ONLY_POLICY = `${YAML_GENERATED_MARKER}\npolicy:\n  allow_implicit_invocation: false\n`;

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

  const overviewSource = await fs.readFile(overviewSkillSource, 'utf8');
  const overviewParts = overviewSource.split(/^---\s*$/m);
  const expectedOverview = `---${overviewParts[1]}---\n\n${GENERATED_MARKER}\n\n${overviewParts.slice(2).join('---').trimStart()}`;
  const overviewPath = path.join(skillsDir, 'open-design', 'SKILL.md');
  if (!(await pathExists(overviewPath))) {
    problems.push('missing .agents/skills/open-design/SKILL.md');
  } else if ((await fs.readFile(overviewPath, 'utf8')) !== expectedOverview) {
    problems.push('.agents/skills/open-design/SKILL.md is stale relative to the Claude plugin\'s authored version');
  }

  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.id);
    const skillMdPath = path.join(dir, 'SKILL.md');
    const policyPath = path.join(dir, 'agents', 'openai.yaml');
    if (!(await pathExists(skillMdPath)) || !(await pathExists(policyPath))) {
      problems.push(`missing generated Codex skill for curated entry "${entry.id}"`);
      continue;
    }
    if ((await fs.readFile(skillMdPath, 'utf8')) !== curatedSkillMdContent(entry)) {
      problems.push(`stale generated Codex skill content for "${entry.id}"`);
    }
    if ((await fs.readFile(policyPath, 'utf8')) !== EXPLICIT_ONLY_POLICY) {
      problems.push(`stale generated Codex policy sidecar for "${entry.id}"`);
    }
  }

  const existingDirs = (await fs.readdir(skillsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== 'open-design')
    .map((e) => e.name);
  for (const dirName of existingDirs) {
    if (expectedIds.has(dirName)) continue;
    const skillMdPath = path.join(skillsDir, dirName, 'SKILL.md');
    if (!(await pathExists(skillMdPath))) continue;
    const content = await fs.readFile(skillMdPath, 'utf8');
    if (content.includes(GENERATED_MARKER)) problems.push(`stale generated Codex skill directory not in the current curated set: "${dirName}"`);
  }

  const referencePath = path.join(skillsDir, 'open-design', 'references', 'remixable-examples.md');
  if (!(await pathExists(referencePath))) {
    problems.push('missing .agents/skills/open-design/references/remixable-examples.md');
  } else {
    const committedReference = await fs.readFile(referencePath, 'utf8');
    const expectedReference = await buildRemixableExamplesReference(assetsRoot);
    if (committedReference !== expectedReference) problems.push('stale .agents/skills/open-design/references/remixable-examples.md');
  }

  if (problems.length > 0) {
    console.error(`Codex skills drift detected:\n${problems.map((p) => `  - ${p}`).join('\n')}\nRun \`npm run sync-content\` and commit the refreshed .agents/skills/.`);
    process.exit(1);
  }

  console.log(`.agents/skills/ is in sync with the curated content and the overview skill (${entries.length + 1} entries).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
