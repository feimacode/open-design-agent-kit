# Tasks: skill-mode-namespacing

## 1. Explore

- [x] Survey `category`/`od.category`/`scenario`/`od.mode` coverage and value distributions across all 277 vendored skills+design-templates
- [x] Confirm the user's direction: bake mode into the id as `od:<mode>:<name>` rather than build a browse command

## 2. Implement

- [x] `ContentIndex`: `SKILL_MODES` const + `SkillMode` type, `normalizeMode()`, `toPublicSkillId()`, `parseSkillId()`
- [x] `loadSkillLikeDir`: read `od.mode` into each entry
- [x] `listSkills()`: return namespaced `id`, accept `mode` filter param, sort by mode then name
- [x] `getSkill()`: parse namespace prefix before map lookup (accepts both namespaced and bare ids)
- [x] `listSkillModes()`: new method
- [x] `listSkillsTool.ts` + `package.json`: `mode` filter param, `mode` field in payload, updated modelDescriptions with the id-convention explanation and `design-system`-mode disambiguation note
- [x] `scripts/generate-featured-prompts.mjs`: mirror `normalizeMode`, pin namespaced id as `skillId` in generated prompt bodies (filenames unchanged)
- [x] `instructions/open-design.instructions.md`, `README.md`: document the id convention and `mode` filtering

## 3. Verify

- [x] `npm run sync-content` — confirmed `prompts/featured/guizang-ppt.prompt.md` now pins `od:deck:guizang-ppt`
- [x] Unit tests: mode normalization (including 'other' fallback), namespaced-id listing, mode filtering, `listSkillModes`, `toPublicSkillId`/`parseSkillId` round-trip, `getSkill` accepting both id forms — 33 passing total
- [x] `tsc --noEmit`, `eslint`, `esbuild` all clean
- [ ] **Not performed**: manual verification in a live Extension Development Host that Copilot correctly passes back the namespaced id it received from `list_open_design_skills` — same documented gap as prior changes in this repo.
