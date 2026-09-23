// "Share a finished artifact to the community" — the upload-side
// counterpart to the runtime community-content sync (see
// packages/vscode/src/workspace/communityContent.ts, the download side).
// Like every other content-producing piece of this extension, this only
// composes instructions; the model does the actual work — scaffolding the
// example folder with its own file-editing tools, then (only once the user
// has explicitly confirmed) publishing it with its own terminal tool, under
// the user's own already-authenticated `gh`/`git` identity. This
// deliberately mirrors upstream open-design's own `od-share-to-community`
// scenario (an agent-followed instruction set, not daemon-side git
// automation) rather than adding bespoke push/PR code to this extension.

export interface ComposeShareToCommunityInstructionsInput {
  artifactEntryPath: string;
  artifactContent: string;
  manifestTitle?: string;
}

const COMMUNITY_REPO = 'feimacode/awesome-open-design';

export function composeShareToCommunityInstructions(input: ComposeShareToCommunityInstructionsInput): string {
  const { artifactEntryPath, artifactContent, manifestTitle } = input;
  const parts: string[] = [];

  parts.push(
    `# Share this OpenDesign artifact to the community\n\nYou are packaging the finished artifact below as a new entry in [${COMMUNITY_REPO}](https://github.com/${COMMUNITY_REPO}) — the community-contributed catalog of remixable designs other OpenDesign users can browse and remix. This is a two-stage task: first scaffold the entry locally (harmless), then — only once the user has explicitly confirmed — publish it as a pull request under the user's own GitHub identity (a real, public, hard-to-reverse action).`,
  );

  parts.push(`\n\n## The artifact\n\nEntry file: \`${artifactEntryPath}\`\n\n\`\`\`html\n${artifactContent.trim()}\n\`\`\``);

  parts.push(
    `\n\n## Stage 1 — derive the metadata yourself\n\nDo not ask the user for anything you can already tell from the artifact above${manifestTitle ? ` (its registered title is "${manifestTitle}")` : ''}. Pick:\n- a stable, ASCII, kebab-case slug (e.g. \`personal-now-page\`), not \`YourDesignSlug\` or \`your_design_slug\`\n- a short title and a one-paragraph description of what this design actually is\n- a working \`example_prompt\`: reuse the brief that actually produced this artifact (lightly cleaned up), not an invented one\n\nOnly ask the user if something is genuinely undeterminable from the artifact and its manifest — never fabricate a fact the artifact doesn't support (no invented statistics, no invented author/brand).`,
  );

  parts.push(
    `\n\n## Stage 2 — write the local scaffold\n\nUsing your own file-editing tools (this tool does not write files itself), create a workspace-relative folder \`.open-design/community-share/<slug>/\` containing:\n\n- \`SKILL.md\` — frontmatter matching ${COMMUNITY_REPO}'s CONTRIBUTING.md shape (\`name\`, \`en_name\`, \`description\`, \`en_description\`, \`category\`, \`tags\`, and an \`od:\` block with \`mode\`, \`surface\`, \`preview.type: html\`, \`preview.entry: example.html\`, \`design_system.requires\`, \`example_prompt\`), body describing the workflow that reproduces this design (numbered steps, lift the format from an existing entry under \`examples/\` in that repo if you have access to one).\n- \`example.html\` — a copy of the artifact's entry content above, verbatim.\n- \`open-design.json\` — \`{ "od": { "useCase": { "query": { "en": "<example_prompt>" } } } }\`.\n\nThis stage is local and reversible — nothing has been published yet.`,
  );

  parts.push(
    `\n\n## Stage 3 — check in before publishing anything\n\nStop here and show the user the scaffolded files, then explicitly ask whether they want to publish it now. Do NOT proceed to Stage 4 without an explicit yes in this same conversation — everything past this point is done under the user's own GitHub identity and is public and hard to reverse.`,
  );

  parts.push(
    `\n\n## Stage 4 — publish, only once confirmed\n\nRun these with your own terminal tool, one at a time, checking each result before continuing:\n\n1. \`gh auth status\` — if this reports not logged in, STOP and tell the user to run \`gh auth login\`. Never invent a placeholder GitHub owner/org to work around a missing login.\n2. \`gh repo fork ${COMMUNITY_REPO} --clone=false\` (safe to re-run if already forked).\n3. Clone the user's own fork into a scratch directory **outside this workspace** (e.g. a system temp directory — never inside the user's project), create a branch named after the slug, copy the Stage 2 scaffold in under \`examples/<slug>/\`, commit, and push the branch to the user's fork.\n4. \`gh pr create --repo ${COMMUNITY_REPO} --title "<title>" --body "<use the PR template in CONTRIBUTING.md>"\`.\n5. Report the resulting PR URL to the user, then stop.\n\nNever merge the PR, never force-push, and never retry a failed step by guessing at a different command — report the actual error and stop instead.`,
  );

  return parts.join('');
}
