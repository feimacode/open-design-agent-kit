# Skill/template mode namespacing (`od:<mode>:<name>`)

## Why

After manually testing the extension, the user observed skills register successfully but have no visible group/category — matching a real gap: `ContentIndex` was only reading `od.category` (62% coverage across the 277 vendored skills+design-templates, ~34 inconsistent values) and never read `od.mode` at all, which turns out to be the field with by far the best coverage (271/277, 98%) and a small, clean 8-value vocabulary (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`).

Rather than adding a separate command/UI surface (the design-systems precedent from `design-system-selection`), the user proposed baking the mode directly into each entry's id as a namespace prefix: `od:<mode>:<name>`, e.g. `od:deck:guizang-ppt`. This makes the grouping self-describing everywhere the id already appears — tool output, error messages, generated prompt files — with no new UI to build or discover.

## What Changes

- `ContentIndex` reads `od.mode`, normalizes it against the 8 known values (falling back to `other` for the 6/277 entries with none or an unrecognized value), and exposes it as a new `mode` field on every skill/design-template.
- The public `id` returned by `list_open_design_skills` (and accepted as `skillId` by `prepare_open_design_brief`) is now `od:<mode>:<dirId>`, not the bare directory id. Internally, `ContentIndex` still keys its map by the plain directory id (unaffected — sync script, on-disk paths, and generated prompt *filenames* are untouched); `getSkill()` and friends parse the namespace prefix back off via `parseSkillId()`, and also accept a bare directory id directly for robustness.
- `list_open_design_skills` gains an exact `mode` filter parameter, and a new `listSkillModes()` method lists the modes actually present.
- `scripts/generate-featured-prompts.mjs` now pins the namespaced `od:<mode>:<name>` form as the `skillId` referenced inside each generated prompt's body text (filenames, and therefore the `/slash-command` names themselves, are unchanged — colons aren't filesystem-safe).
- `package.json` tool descriptions updated to explain the id convention and explicitly disambiguate `mode: design-system` (a skill that *authors* a design-system deliverable) from `designSystemId` (selects from the separate ~150-entry prebuilt brand design-system library).

## Capabilities

### Modified: `open-design-tools`

Every skill/design-template id is now self-describing (`od:<mode>:<name>`), giving near-universal (98%) grouping with no new command surface — a deliberately different mechanism from the design-systems browse command, chosen because it needs no discovery UI at all.

## Impact

- **Breaking change to the tool contract**: any external caller (or a user's saved chat, generated prompt) using a bare skill id like `guizang-ppt` as `skillId` still works (`getSkill`/`parseSkillId` accept bare ids as a fallback), but `list_open_design_skills` no longer returns bare ids — callers reading `id` from its output must handle the namespaced form.
- `prompts/featured/*.prompt.md` regenerated (filenames unchanged, pinned `skillId` text inside changed to the namespaced form).
- No change to `assets/open-design/` vendoring or the sync script.
