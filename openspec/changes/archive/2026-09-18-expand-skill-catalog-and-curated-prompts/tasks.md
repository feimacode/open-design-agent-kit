# Tasks: expand-skill-catalog-and-curated-prompts

## 1. Explore

- [x] Trace the user's concrete example ("slide deck" — "Write a Brand-to-Revenue Story like a Growth Strategy Lead") to its actual source file, confirm it's a `design-templates/` entry not vendored in v1
- [x] Compare slash-commands-for-all vs. participant-per-skill vs. curated-subset options against the ~280-entry real scale
- [x] Establish a defensible curation signal from upstream's inconsistent `featured`/`recommended`/`od.default_for` frontmatter

## 2. Implement

- [x] `scripts/sync-open-design-content.mjs`: refactor `copySkills` into `copySkillLikeDir(subdir)`, call it for both `skills` and `design-templates`
- [x] `ContentIndex`: merge both dirs into one skills map; add `source`, `featured`, `examplePrompt` fields; prefer `en_name`/`en_description`; merge `tags` into the matching haystack
- [x] `src/tools/listSkillsTool.ts`: include the new fields in the tool's JSON payload
- [x] `package.json` `list_open_design_skills` modelDescription: mention design-templates, `source`, `examplePrompt`
- [x] New `scripts/generate-featured-prompts.mjs`: generate `prompts/featured/<id>.prompt.md` per featured entry, rewrite `package.json`'s `contributes.chatPromptFiles`
- [x] Wire into `npm run sync-content`
- [x] `instructions/open-design.instructions.md`: mention the merged catalog and featured prompt shortcuts

## 3. Verify

- [x] `npm run sync-content` — 163 skills, 114 design templates, 152 design systems, 11 craft files, 23 featured prompts generated
- [x] Confirm `guizang-ppt` (the user's original example) is among the 23 and its generated prompt file carries the correct pinned skillId + example brief
- [x] Unit tests updated (merged-catalog fixture including a design-template with `en_name`/`od.default_for`/`example_prompt`) — 23 passing
- [x] `tsc --noEmit`, `eslint`, `esbuild` all clean
- [x] `package.json.contributes.chatPromptFiles` has 25 entries (2 hand-authored + 23 generated) after sync
- [ ] **Not performed**: manual verification that `/guizang-ppt` (and the other 22) actually appear and work in a live Extension Development Host — same documented gap as `add-open-design-tools/tasks.md` §7.
