#!/usr/bin/env node
// Generates a chatPromptFile (VS Code / Copilot slash command) for each
// curated skill/design-template (see packages/content/scripts/curatedEntries.mjs
// for the shared detection logic), so the ~20-ish most-curated entries are
// reachable with zero ambiguity (the model doesn't have to guess a skillId
// from natural language) without flooding the `/` autocomplete with all
// ~280 vendored entries. Run after copy-content-assets.mjs, as part of
// `npm run sync-content`. Idempotent: clears and rewrites prompts/featured/
// and the generated slice of package.json's contributes.chatPromptFiles on
// every run.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCuratedEntries } from '@feimacode/open-design-agent-kit-content/scripts/curatedEntries.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(repoRoot, 'assets', 'open-design');
const featuredPromptsDir = path.join(repoRoot, 'prompts', 'featured');
const GENERATED_PREFIX = './prompts/featured/';

function promptFileContent(entry) {
  const placeholder = entry.examplePrompt
    ? entry.examplePrompt.replace(/"/g, '\\"')
    : `What do you want to build with ${entry.displayName}?`;
  // Hyphens, not colons: VS Code's chat input treats a colon in a prompt
  // name as a subcommand separator and renders/inserts it as a literal
  // space (`od:video:x` -> `/od video x`). A hyphenated form displays as
  // written and matches Claude Code's own naming.
  const invocationName = entry.publicId.replace(/:/g, '-');
  return `---
name: "${invocationName}"
description: ${entry.displayName} (OpenDesign)
mode: agent
---

Use the OpenDesign skill \`${entry.publicId}\` (${entry.displayName}).

Brief: \${input:brief:${placeholder}}

Call \`prepare_open_design_brief\` with skillId "${entry.publicId}" and this brief (call \`list_open_design_design_systems\` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call \`register_open_design_artifact\`.
`;
}

async function main() {
  const entries = await collectCuratedEntries(assetsRoot);

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
