# Design: skill/template mode namespacing

## Field survey: why `od.mode`, not `od.category`/top-level `category`/`scenario`

Measured directly against the 277 vendored skills+design-templates (see conversation research, same-day):

| Field | Coverage | Distinct values |
|---|---|---|
| top-level `category:` | 25/277 (9%) | 9 (video, card, slides, poster, resume, hero, doc, data, article) |
| `od.category` | 171/277 (62%) | ~34 (image-generation, marketing-gtm, academic-research, ...) |
| top-level `scenario:` | 24/277 (9%) | 7 (marketing, video, personal, product, operations, finance, design) |
| `od.mode` | 271/277 (98%) | 8 (prototype, deck, design-system, image, video, template, utility, audio) |

`od.mode` is the only field close to universal, and its small fixed vocabulary maps directly onto how a user actually frames a request ("I want a deck", "I want an image") — a better primary axis than `od.category`'s richer but sparser, inconsistent tagging. `od.category` remains available as a secondary `category` field on each entry (unchanged behavior from the earlier `expand-skill-catalog-and-curated-prompts` change), just not the primary organizing signal.

## Why namespace the id instead of a separate `mode` field alone

`mode` was already added as a plain field in the same pass — the question was whether that's enough, or whether it should also be baked into the id. The user's direction was to prefix the id (`od:<mode>:<name>`) rather than rely on a caller remembering to read a separate `mode` field. This has a real advantage over the field-only approach: it's visible wherever the id shows up on its own — inside `prepare_open_design_brief`'s "Unknown skillId" error message, inside `register_open_design_artifact`'s stored `sourceSkillId`, inside generated prompt files' body text — without needing a second lookup. The trade-off is that it's a breaking change to what `list_open_design_skills` returns as `id` (see `proposal.md` Impact); judged acceptable since the extension has no external consumers yet beyond this repo's own tests and generated content, both updated in this same change.

## Why not a "Browse Skills" command (rejected, superseding the earlier open question)

The prior `design-system-selection` change built a QuickPick browse command for design systems specifically because they have no per-item curation signal and a large flat list. Skills/templates already have two working discovery paths that a mode-aware id directly improves: the `list_open_design_skills` tool (now filterable by `mode`) and the 23 curated slash commands (now displaying the namespaced id in their pinned brief, so a user glancing at `prompts/featured/guizang-ppt.prompt.md` sees `od:deck:guizang-ppt` and immediately knows its mode). A separate browse command was offered as an option but the user redirected to the namespacing approach instead — it fully addresses the "no visible grouping" complaint without adding a new command surface, so it isn't pursued as a second thing to build here.

## Internal id vs. public id

`ContentIndex`'s internal `Map<string, SkillDetail>` stays keyed by the plain on-disk directory id — this is what the sync script writes, what generated prompt *filenames* use, and what tests build fixtures around. Only the *public* boundary (`listSkills()`'s returned summaries) applies the `od:<mode>:` prefix. `getSkill()` accepts either form via `parseSkillId()`, which strips a leading `od:[^:]+:` pattern if present and otherwise passes the input through unchanged — so a bare directory id still resolves, which matters for robustness against a model echoing back something slightly different than what it was given.
