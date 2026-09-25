#!/usr/bin/env node
// Generates this repo's root-level .agents/skills/ — Codex CLI's own
// skill-discovery convention (it scans $CWD/.agents/skills, $REPO_ROOT/.agents/skills,
// and $HOME/.agents/skills) — from the same curated-entry signal
// (packages/content/scripts/curatedEntries.mjs) that drives the Claude Code
// plugin's skills/, plus a verbatim copy of the hand-authored overview
// skill. Run as part of `npm run sync-content`. Idempotent: only ever
// touches directories it marked as its own on a previous run.
//
// Codex's SKILL.md frontmatter is a narrower schema than Claude Code's (no
// `disable-model-invocation`/`argument-hint`) — the documented way to make a
// skill explicit-only is a sibling agents/openai.yaml sidecar
// (`policy.allow_implicit_invocation: false`), so the curated per-entry
// skills each get one; the overview skill (copied as-is, meant to
// auto-trigger) does not.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCuratedEntries } from '@feimacode/open-design-agent-kit-content/scripts/curatedEntries.mjs';
import { loadLocalPrompts, renderPromptBody } from '@feimacode/open-design-agent-kit-content/scripts/localPrompts.mjs';
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
description: ${entry.displayName} (Open Design) — use only when explicitly invoked, not for general design requests
---

${GENERATED_MARKER}

Use the Open Design skill \`${entry.publicId}\` (${entry.displayName}).

Treat the rest of the user's message as the brief. If nothing more specific was given, use: "${placeholder}"

Call \`prepare_open_design_brief\` (the open-design MCP server's tool) with skillId "${entry.publicId}" and this brief — call \`list_open_design_design_systems\` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call \`register_open_design_artifact\`.
`;
}

// Hand-written, host-agnostic prompts from packages/content/local/prompts/
// (e.g. open-design-social-post), rendered as explicit-only skills.
// Unlike the per-entry curated skills, these are workflows the model should
// reach on its own for a matching request — so no explicit-only policy sidecar.
function localPromptSkillMdContent(prompt) {
  return `---
name: ${prompt.name}
description: ${prompt.description} — use whenever the user wants something to post on social media (an X/Twitter image, Instagram or LinkedIn post or carousel, Xiaohongshu cards, a Story/Reels cover, a YouTube thumbnail or video), even if they don't mention Open Design
---

${GENERATED_MARKER}

${renderPromptBody(prompt, `the rest of the user's message (if there is none, ask the user: "${prompt.placeholder}")`)}
`;
}

// A `#` comment, not the `<!-- -->` GENERATED_MARKER used in the SKILL.md
// files — this is a YAML file, `<!-- -->` isn't a valid YAML comment and
// would break parsing.
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

async function isGeneratedSkillDir(dir) {
  const skillMd = path.join(dir, 'SKILL.md');
  if (!(await pathExists(skillMd))) return false;
  return (await fs.readFile(skillMd, 'utf8')).includes(GENERATED_MARKER);
}

async function main() {
  const entries = await collectCuratedEntries(assetsRoot);

  await fs.mkdir(skillsDir, { recursive: true });
  const existing = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const entry of existing) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(skillsDir, entry.name);
    if (await isGeneratedSkillDir(dir)) await fs.rm(dir, { recursive: true, force: true });
  }

  // Overview skill: a marked copy of the hand-authored Claude Code version,
  // not independently generated content — one authored source, mirrored.
  const overviewDir = path.join(skillsDir, 'open-design');
  await fs.mkdir(overviewDir, { recursive: true });
  const overviewSource = await fs.readFile(overviewSkillSource, 'utf8');
  const overviewParts = overviewSource.split(/^---\s*$/m);
  // overviewParts: ['', frontmatter, body] — insert the marker right after
  // the frontmatter close, same position every generated file uses it.
  const overviewContent = `---${overviewParts[1]}---\n\n${GENERATED_MARKER}\n\n${overviewParts.slice(2).join('---').trimStart()}`;
  await fs.writeFile(path.join(overviewDir, 'SKILL.md'), overviewContent);

  const referencesDir = path.join(overviewDir, 'references');
  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(path.join(referencesDir, 'remixable-examples.md'), await buildRemixableExamplesReference(assetsRoot));

  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.id);
    await fs.mkdir(path.join(dir, 'agents'), { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), curatedSkillMdContent(entry));
    await fs.writeFile(path.join(dir, 'agents', 'openai.yaml'), EXPLICIT_ONLY_POLICY);
  }

  const localPrompts = await loadLocalPrompts(assetsRoot);
  for (const prompt of localPrompts) {
    const dir = path.join(skillsDir, prompt.name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), localPromptSkillMdContent(prompt));
  }

  console.log(
    `Generated ${entries.length + localPrompts.length + 1} Codex skills (1 overview + ${entries.length} curated + ${localPrompts.length} local prompts) under .agents/skills/.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
