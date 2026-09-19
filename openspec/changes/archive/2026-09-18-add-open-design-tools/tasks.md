# Tasks: add-open-design-tools

## 1. Research

- [x] Trace open-design's daemon/MCP architecture to find what's embeddable without a daemon (subagent research, see conversation)
- [x] Trace feima-copilot-llms-extension's extension architecture as the structural pattern to follow
- [x] Confirm VS Code's chat extensibility surface against current docs (languageModelTools, chatInstructions, chatPromptFiles, custom chat modes, MCP server definition providers)

## 2. Scaffold

- [x] package.json (contributes: languageModelTools ×5, chatInstructions, chatPromptFiles, configuration)
- [x] tsconfig.json, .esbuild.ts, .eslintrc.js, .gitignore, .vscodeignore
- [x] .vscode/launch.json + tasks.json for F5 Extension Development Host debugging
- [x] MIT LICENSE (project license; two vendored files retain Apache-2.0 provenance notice per SOURCE.md)

## 3. Content sync

- [x] scripts/sync-open-design-content.mjs — vendors skills/design-systems/craft markdown + writes MANIFEST.json provenance
- [x] Run sync against /home/iven/tools/open-design (163 skills, 152 design systems, 11 craft files synced)

## 4. Core logic

- [x] src/core/vendored/artifactManifest.ts — near-verbatim port
- [x] src/core/vendored/artifactCreate.ts — adapted (fs/promises instead of injected HTTP writer)
- [x] src/core/vendored/SOURCE.md — provenance notes
- [x] src/core/generation/composeInstructions.ts — new, minimal (NOT a port — see design.md)
- [x] src/core/content/contentIndex.ts — lazy-loads + parses vendored markdown (gray-matter for skills, regex for design-system heading/blockquote)
- [x] src/core/workspace/artifactWriter.ts — workspace-root resolution, entry-path suggestion, manifest read/write wiring

## 5. Tools

- [x] list_open_design_skills
- [x] list_open_design_design_systems
- [x] prepare_open_design_brief
- [x] register_open_design_artifact
- [x] get_open_design_artifact
- [x] src/tools/registerTools.ts wiring + src/extension/extension.ts activate()

## 6. Chat instructions & prompt files

- [x] instructions/open-design.instructions.md
- [x] prompts/open-design-generate.prompt.md
- [x] prompts/open-design-list-skills.prompt.md

## 7. Testing & validation

- [x] Unit tests (Mocha, vscode-free): artifactManifest, artifactCreate, composeInstructions, ContentIndex — 22 passing
- [x] `tsc --noEmit` clean
- [x] `eslint` clean
- [x] esbuild bundle succeeds (`dist/extension.js`, 156KB)
- [ ] **Not performed**: manual verification in an actual Extension Development Host against live Copilot Chat (tool auto-invocation, `#od-skills`/`#od-design-systems` explicit reference, `/open-design-generate` and `/open-design-list-skills` prompt files, end-to-end artifact generation). Requires a human running VS Code interactively — flagged here rather than silently skipped. See README.md "Development" section for how to run it.
- [ ] **Not performed**: `@vscode/test-electron` integration test suite — plumbing not set up, matching feima-copilot-llms-extension's own documented gap in the same area (see that repo's tasks.md entries under 2026-08-14-add-auto-model-routing).

## 8. Not yet decided / deferred

- Whether a thin `@open-design` chat participant is needed later, if tool auto-invocation proves hard to discover in practice — explicitly deferred, not decided against permanently (see proposal.md "What Changes").
- Whether `craft/*.md` sections should be selectively applied per-skill (via `od.craft.requires` frontmatter, present in upstream but not read here) rather than always-all-applied as in this v1.
