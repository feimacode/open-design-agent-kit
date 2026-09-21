## 1. Core filter

- [x] 1.1 `ContentIndex.listSkills()` gains `source`/`remixableOnly` filter params (`packages/core`)
- [x] 1.2 4 new unit tests: `source` filter, `remixableOnly` filter, composed with existing `query`/`mode` (96 total, up from 93)

## 2. Tool parity

- [x] 2.1 Updated `packages/vscode/package.json`'s `list_open_design_skills` `inputSchema`/`modelDescription`
- [x] 2.2 Updated `packages/vscode/src/tools/listSkillsTool.ts` to pass the new params through. **Real pre-existing bug found and fixed in passing**: the VS Code tool's payload was missing `exampleArtifactPath` entirely, despite the tool's own `modelDescription` explicitly promising it ("A result with a non-empty 'exampleArtifactPath' has an actual rendered starting artifact..."). Confirmed via `git diff` that this was genuinely absent before this change, not a misremembering — added it.
- [x] 2.3 Updated `packages/mcp-server/src/index.ts`'s `list_open_design_skills` tool def and `packages/mcp-server/src/tools.ts`'s `listSkills()` (already had `exampleArtifactPath` correctly — this bug was VS-Code-specific)
- [x] 2.4 1 new unit test for the mcp-server tool handler passing the new params through (11 total, up from 10)

## 3. Shared reference-file generator

- [x] 3.1 `packages/content/scripts/remixableExamplesReference.mjs`: `buildRemixableExamplesReference(assetsRoot)`, grouped by mode, full 167-example pool. **Two real bugs found and fixed by actually inspecting the generated output, not assuming correctness**: (1) frontmatter descriptions are frequently authored as multi-line YAML block scalars, which broke the intended one-bullet-per-example format — fixed with a `collapseWhitespace()` pass; (2) verified the id-collision handling (a same-named skill/design-template forces a colliding example's id to carry the `:example` suffix, matching `ContentIndex.mergeSkillPools()`'s real behavior) actually matters, not a theoretical edge case — checked real data before implementing: **all** of the 129 skill/template-vs-example collisions found two rounds ago involve an example, meaning a large fraction of the 167 examples needed this handling for their printed id to actually work with `remix_open_design_example`, not a rare corner case.
- [x] 3.2 Wired into `packages/claude-plugin/scripts/generate-claude-skills.mjs`: writes `skills/open-design/references/remixable-examples.md`
- [x] 3.3 Wired into `packages/codex/scripts/generate-codex-skills.mjs`: writes `.agents/skills/open-design/references/remixable-examples.md`
- [x] 3.4 Added the markdown link to the hand-authored `packages/claude-plugin/skills/open-design/SKILL.md`; confirmed Codex's copy inherited it automatically (it's a mechanical copy of that same file) — verified by grepping both generated files for the link text, not assumed
- [x] 3.5 Extended `check-skills-sync.mjs` and `check-codex-skills-sync.mjs` to also diff the reference file's expected content. Verified both directions for real: deliberately tampered with the Claude copy and deleted the Codex copy, confirmed both guards failed with the correct, specific message, then regenerated and confirmed both pass clean again.
- [x] 3.6 Verified (not assumed) that `packages/cli`'s wholesale mirror picks up `references/` automatically — inspected `packages/cli/assets/{claude-skills,codex-skills}/open-design/` directly after regenerating, confirmed the drift guard passes, and additionally ran the real compiled `init` binary against a scratch project end-to-end, confirming `references/remixable-examples.md` lands under both `.claude/skills/open-design/` and `.agents/skills/open-design/` in the target project too — not just in this repo's own generated output.

## 4. Verification

- [x] 4.1 Regenerated via `npm run sync-content`; confirmed both reference files exist, are byte-for-byte identical (`diff` — no output), and correctly grouped by mode (167 entries total, matching the real example count)
- [x] 4.2 Deliberately introduced drift (tampered with the Claude copy, deleted the Codex copy) and confirmed both drift guards caught it with the correct message, then regenerated and confirmed clean — done as part of 3.5
- [x] 4.3 Full monorepo check suite clean: typecheck × 6 workspaces, lint × 6 (all drift guards), 125 total unit tests (96 core + 11 mcp-server + 18 cli), all three real binaries compile
