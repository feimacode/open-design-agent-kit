# Expand skill catalog to design-templates, add curated prompt shortcuts

## Why

Walking through a concrete example — a user asking for a "slide deck" using the skill described as *"Write a Brand-to-Revenue Story like a Growth Strategy Lead"* — surfaced that the v1 catalog (`add-open-design-tools`) couldn't actually serve it. That entry lives in open-design's `design-templates/` directory, not `skills/`, and the sync script only vendored `skills/` and `design-systems/`. Separately, even for entries that were vendored, `ContentIndex` only read the plain `name`/`description`/`triggers` frontmatter fields — for many entries (including this one) the human-readable title lives in `en_name` instead (`name` is often just the machine slug), and a curated `od.example_prompt` was being dropped entirely.

This also prompted a design discussion on selection UX: should every skill/template get its own slash command, or a dedicated chat participant per skill? Both were rejected at the ~280-entry scale this catalog turns out to have (163 skills + 114 design-templates) — see `design.md`.

## What Changes

- `scripts/sync-open-design-content.mjs` now also vendors `design-templates/*/SKILL.md` (same shape as `skills/*/SKILL.md`), alongside the existing `skills/` and `design-systems/` sync.
- `ContentIndex` merges `skills/` and `design-templates/` into one catalog exposed via `list_open_design_skills`/`get_skill`, tagging each entry with a `source: 'skill' | 'design-template'` field. It now reads `en_name`/`en_description` (preferring these over the raw slug-like `name`) and `tags` (merged into the matching haystack alongside `triggers`), and surfaces `od.example_prompt` and a computed `featured` flag.
- New `scripts/generate-featured-prompts.mjs`, run as part of `npm run sync-content`, generates one `chatPromptFiles` slash command per "featured" entry (curation signal: presence of a top-level `featured` or `recommended` frontmatter key, or `od.default_for` — union across skills + design-templates currently yields 23 entries) under `prompts/featured/`, each pinning an exact `skillId` and, where available, the entry's curated `example_prompt` as the input placeholder. The script also rewrites `package.json`'s `contributes.chatPromptFiles` array to include the generated set alongside the two hand-authored prompt files.

## Capabilities

### Modified: `open-design-tools`

Skill/design-template discovery now spans both upstream catalogs with richer metadata, and a curated subset gets zero-ambiguity slash-command access.

## Impact

- `assets/open-design/design-templates/` is now vendored (114 entries as of this sync).
- `prompts/featured/*.prompt.md` (23 files) are generated content, regenerated on every `npm run sync-content` — not hand-edited.
- `package.json`'s `contributes.chatPromptFiles` array is now partially generated; `scripts/generate-featured-prompts.mjs` preserves the two hand-authored entries (`open-design-generate.prompt.md`, `open-design-list-skills.prompt.md`) and fully replaces everything under `./prompts/featured/`.
